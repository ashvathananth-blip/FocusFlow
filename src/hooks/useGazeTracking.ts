"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import type { CalibrationResult, Features } from "@/types/vision";
import { CameraError, openCamera, releaseCamera, type CameraStatus } from "@/lib/vision/camera";
import { loadLandmarker } from "@/lib/vision/landmarks";
import { extractFeatures } from "@/lib/vision/features";
import { CALIBRATION, CalibrationCollector, finishCalibration } from "@/lib/vision/calibration";
import { GazeEstimator } from "@/lib/vision/gaze-estimator";
import { summarize, type Experiment, type InferenceMeasurement, type Scenario, type VisibilityEvent } from "@/lib/vision/diagnostics";
import { createVideoFrameScheduler, createVisibilityRecoveryController, inferenceDelayMs, shouldPublishUiUpdate, type VideoFrameSource } from "@/lib/vision/scheduling";
import { createInferenceRetryPolicy, inspectInferenceFrame } from "@/lib/vision/inference-lifecycle";

export type Readout = ReturnType<GazeEstimator["update"]> & { faceDetected: boolean | null; at: number | null; calibrating: boolean };
const emptyReadout = (reason: string): Readout => ({ ...new GazeEstimator().update(null, null), faceDetected: null, at: null, calibrating: false, reason });
const EMPTY = emptyReadout("Camera inactive; no inference");
const EMPTY_STATS = summarize([], 0, 0);

export type TrackingObserver = { onSample?: (readout: Readout) => void; onInterrupt?: (at: number) => void };
export function useGazeTracking(observer?: TrackingObserver) {
  const observerRef = useRef(observer);
  useEffect(() => { observerRef.current = observer; }, [observer]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null), landmarker = useRef<FaceLandmarker | null>(null);
  const generation = useRef(0), scheduler = useRef<ReturnType<typeof createVideoFrameScheduler> | null>(null);
  const visibilityRecovery = useRef<ReturnType<typeof createVisibilityRecoveryController> | null>(null);
  const visibilityRetry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true), estimator = useRef(new GazeEstimator());
  const collector = useRef<CalibrationCollector | null>(null), calibrationRef = useRef<CalibrationResult | null>(null);
  const latest = useRef<Features | null>(null), lastInference = useRef<number | null>(null), lastValidFeaturesAt = useRef<number | null>(null);
  const lastInferenceStart = useRef<number | null>(null), estimatorStale = useRef(false);
  const lastTimingLogAt = useRef<number | null>(null);
  const recent = useRef<InferenceMeasurement[]>([]), experimentRef = useRef<Experiment | null>(null);
  const resultsRef = useRef<Experiment[]>([]), visibilityLog = useRef<VisibilityEvent[]>([]);
  const [camera, setCamera] = useState<CameraStatus>("idle"), [permission, setPermission] = useState("not requested");
  const [modelStatus, setModelStatus] = useState("not loaded"), [error, setError] = useState("");
  const [readout, setReadout] = useState<Readout>(EMPTY), [stats, setStats] = useState(EMPTY_STATS);
  const [calibration, setCalibration] = useState<CalibrationResult | null>(null);
  const [progress, setProgress] = useState<{ group: number; phase: string; count: number } | null>(null);
  const [visibility, setVisibility] = useState("unknown"), [experiment, setExperiment] = useState<Experiment | null>(null);
  const [results, setResults] = useState<Experiment[]>([]);
  const progressSnapshot = useRef(progress), lastProgressPublishAt = useRef<number | null>(null);
  const readoutSnapshot = useRef(readout), lastReadoutPublishAt = useRef<number | null>(null), lastStatsPublishAt = useRef<number | null>(null);
  const publishProgress = useCallback((next: typeof progress, at = performance.now(), force = false) => {
    const previous = progressSnapshot.current;
    const boundary = next === null || previous === null || next.group !== previous.group || next.phase !== previous.phase;
    if (!boundary && !shouldPublishUiUpdate(lastProgressPublishAt.current, at, force)) return;
    progressSnapshot.current = next; lastProgressPublishAt.current = at; setProgress(next);
  }, []);
  const publishReadout = useCallback((next: Readout, force = false) => {
    const previous = readoutSnapshot.current;
    const boundary = next.at === null || next.classification !== previous.classification || next.focusLevel !== previous.focusLevel || next.quality !== previous.quality || next.faceDetected !== previous.faceDetected;
    if (!boundary && !shouldPublishUiUpdate(lastReadoutPublishAt.current, next.at ?? performance.now(), force)) return;
    readoutSnapshot.current = next; lastReadoutPublishAt.current = next.at ?? performance.now(); setReadout(next);
  }, []);

  const stopInternal = useCallback((preserveCalibration = false) => {
    const interruptedAt = performance.now();
    observerRef.current?.onInterrupt?.(interruptedAt);
    if (preserveCalibration) collector.current?.pause(interruptedAt);
    generation.current++;
    visibilityRecovery.current?.dispose(); visibilityRecovery.current = null;
    if (visibilityRetry.current !== null) clearTimeout(visibilityRetry.current);
    visibilityRetry.current = null;
    scheduler.current?.cancel(); scheduler.current = null;
    releaseCamera(stream.current); stream.current = null;
    landmarker.current?.close(); landmarker.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (!preserveCalibration) { collector.current = null; calibrationRef.current = null; }
    latest.current = null;
    estimator.current.reset(); lastInference.current = null; lastValidFeaturesAt.current = null; lastInferenceStart.current = null; estimatorStale.current = false; lastTimingLogAt.current = null; recent.current = [];
    if (experimentRef.current) experimentRef.current.interruptions.push({ at: performance.now(), reason: "Camera stopped" });
    if (mounted.current) {
      setCamera("stopped"); setModelStatus("released"); readoutSnapshot.current = EMPTY; lastReadoutPublishAt.current = null; setReadout(EMPTY);
      if (!preserveCalibration) { setCalibration(null); progressSnapshot.current = null; lastProgressPublishAt.current = null; setProgress(null); }
      lastStatsPublishAt.current = null; setStats(EMPTY_STATS);
    }
  }, []);
  const stop = useCallback(() => stopInternal(false), [stopInternal]);

  const start = useCallback(async () => {
    stopInternal(true);
    const run = generation.current;
    setCamera("requesting"); setPermission("requesting"); setError("");
    try {
      const acquired = await openCamera();
      if (run !== generation.current) { releaseCamera(acquired); return; }
      stream.current = acquired;
      setPermission("granted"); setCamera("active"); setModelStatus("loading local WASM and model");
      acquired.getVideoTracks().forEach(track => track.addEventListener("ended", () => {
        if (run === generation.current) { stopInternal(true); setError("Camera stream ended. Your session and calibration are preserved; reconnect the camera to continue."); }
      }));
      const video = videoRef.current;
      if (!video) throw new Error("Video element unavailable");
      video.srcObject = acquired;
      await video.play();
      if (run !== generation.current) return;
      let model: FaceLandmarker;
      try { model = await loadLandmarker(); }
      catch (cause) { throw new Error(`MediaPipe initialization failed. Check local assets with npm run assets:prepare. ${cause instanceof Error ? cause.message : ""}`); }
      if (run !== generation.current) { model.close(); return; }
      landmarker.current = model; setModelStatus("ready (CPU / VIDEO)");
      let previousVideoTime = -1;
      let previousDecodedFrameCount: number | null = null;
      let trackingSuspended = false, awaitingFreshForegroundFrame = false, recoveryAttempts = 0;
      let foregroundFrameBaseline: number | null = null;
      let inferenceRecoveryRequested = false;
      const inferenceRetries = createInferenceRetryPolicy();
      const isForeground = () => document.visibilityState === "visible" && document.hasFocus();
      const retryForegroundRecovery = () => {
        if (visibilityRetry.current !== null || recoveryAttempts >= 12 || run !== generation.current) return;
        recoveryAttempts++;
        visibilityRetry.current = setTimeout(() => {
          visibilityRetry.current = null;
          if (isForeground()) visibilityRecovery.current?.update();
        }, 250);
      };
      const schedule = (delayOverride?: number) => {
        if (run !== generation.current || trackingSuspended || !isForeground()) return;
        scheduler.current?.schedule(delayOverride ?? inferenceDelayMs(lastInferenceStart.current, performance.now()));
      };
      const tick = (mediaTime?: number) => {
        if (run !== generation.current) return;
        if (!isForeground()) { visibilityRecovery.current?.update(); return; }
        if (trackingSuspended) return;
        const started = performance.now();
        let failureStage = "frame validation";
        try {
          const frameTime = mediaTime ?? video.currentTime;
          const activeStream = stream.current;
          const frameHealth = inspectInferenceFrame({
            readyState: video.readyState,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            currentTime: video.currentTime,
            streamActive: activeStream?.active ?? false,
            trackStates: activeStream?.getVideoTracks().map(track => ({ readyState: track.readyState, muted: track.muted })) ?? [],
          }, HTMLMediaElement.HAVE_CURRENT_DATA, foregroundFrameBaseline, frameTime);
          if (!frameHealth.ready) {
            if (process.env.NODE_ENV === "development" && frameHealth.reason !== "waiting for a frame newer than the foreground recovery baseline") {
              console.debug("[FocusFlow frame deferred]", { reason: frameHealth.reason, readyState: video.readyState, videoWidth: video.videoWidth, videoHeight: video.videoHeight, currentTime: video.currentTime, mediaTime: frameTime });
            }
            schedule();
            return;
          }
          if (frameTime !== previousVideoTime && (lastInferenceStart.current === null || inferenceDelayMs(lastInferenceStart.current, started) === 0)) {
            const frameIntervalMs = previousVideoTime < 0 ? null : (frameTime - previousVideoTime) * 1000;
            const scheduledIntervalMs = lastInferenceStart.current === null ? null : started - lastInferenceStart.current;
            const decodedFrameCount = typeof video.getVideoPlaybackQuality === "function" ? video.getVideoPlaybackQuality().totalVideoFrames : null;
            const decodedFrameDelta = decodedFrameCount === null || previousDecodedFrameCount === null ? null : decodedFrameCount - previousDecodedFrameCount;
            previousVideoTime = frameTime;
            failureStage = "MediaPipe detectForVideo";
            const result = model.detectForVideo(video, started);
            const done = performance.now(), latencyMs = done - started;
            const completionGapMs = lastInference.current === null ? null : done - lastInference.current;
            const measurement = { at: done, latencyMs, completionGapMs, frameIntervalMs, decodedFrameDelta, scheduledIntervalMs };
            if (completionGapMs !== null && completionGapMs > 500) {
              if (!estimatorStale.current) { estimator.current.reset(); estimatorStale.current = true; }
              collector.current?.pause(lastInference.current ?? started);
            }
            lastInference.current = done; lastInferenceStart.current = started; previousDecodedFrameCount = decodedFrameCount;
            recent.current.push(measurement);
            const cutoff = done - 5000;
            let staleMeasurements = 0;
            while (staleMeasurements < recent.current.length && recent.current[staleMeasurements].at < cutoff) staleMeasurements++;
            if (staleMeasurements) recent.current.splice(0, staleMeasurements);
            if (experimentRef.current) experimentRef.current.measurements.push(measurement);
            failureStage = "MediaPipe result validation and calibration";
            latest.current = extractFeatures(result.faceLandmarks[0], result.facialTransformationMatrixes[0]?.data, video.videoWidth / video.videoHeight);
            inferenceRetries.succeeded();
            inferenceRecoveryRequested = false;
            setModelStatus("ready (CPU / VIDEO)");
            if (awaitingFreshForegroundFrame) { awaitingFreshForegroundFrame = false; foregroundFrameBaseline = null; setError(""); }
            if (latest.current) { lastValidFeaturesAt.current = done; estimatorStale.current = false; }
            if (process.env.NODE_ENV === "development" && (lastTimingLogAt.current === null || done - lastTimingLogAt.current >= 1000)) {
              lastTimingLogAt.current = done;
              console.debug("[FocusFlow inference timing · 1s sample]", { at: done, latencyMs, completionGapMs, frameIntervalMs, decodedFrameDelta, scheduledIntervalMs, frameReadyState: video.readyState });
            }
            if (collector.current) {
              const current = collector.current;
              try {
                if (!latest.current) {
                  if (current.pause(done)) publishProgress({ group: current.group, phase: "waiting for valid tracking", count: current.samples.filter(s => s.group === current.group).length }, done);
                } else {
                  const recovery = current.resume(done);
                  if (recovery === "retried") setError(`Tracking was unavailable for over ${CALIBRATION.prolongedLossMs / 1000} seconds. Target ${current.group + 1} has been reset; continue from this point.`);
                  else if (current.paused === false) setError("");
                  const phase = current.add(latest.current.vector, done);
                if (phase === "done") {
                  const fitted = finishCalibration(current.samples);
                  calibrationRef.current = fitted; setCalibration(fitted); collector.current = null; publishProgress(null, done); estimator.current.reset();
                  if (fitted.status === "poor") setError("Calibration validation is poor. Retry with steady posture and better lighting. If it remains poor, stop and consider an approved five-point or simpler-feature fallback.");
                } else publishProgress({ group: current.group, phase, count: current.samples.filter(s => s.group === current.group).length }, done);
                }
              } catch (cause) {
                current.retryCurrent(done); publishProgress({ group: current.group, phase: current.paused ? "waiting for fresh tracking" : "settling", count: 0 }, done); setError(`${cause instanceof Error ? cause.message : "Calibration failed"} Retry target ${current.group + 1} or continue collecting at this point.`);
              }
            }
            const next = { ...estimator.current.update(latest.current, calibrationRef.current), faceDetected: !!result.faceLandmarks[0]?.length, at: done, calibrating: !!collector.current };
            observerRef.current?.onSample?.(next);
            publishReadout(next);
          }
        } catch (cause) {
          const done = performance.now();
          const failure = inferenceRetries.failed();
          const detail = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
          if (process.env.NODE_ENV === "development") {
            console.error("[FocusFlow tracking pipeline exception]", {
              stage: failureStage,
              detail,
              stack: cause instanceof Error ? cause.stack : undefined,
              latencyMs: done - started,
              readyState: video.readyState,
              dimensions: `${video.videoWidth}x${video.videoHeight}`,
              currentTime: video.currentTime,
              streamActive: stream.current?.active ?? false,
              tracks: stream.current?.getVideoTracks().map(track => ({ state: track.readyState, muted: track.muted })) ?? [],
              modelAvailable: landmarker.current === model,
              visibility: document.visibilityState,
              consecutiveFailures: failure.failures,
            });
          }
          lastValidFeaturesAt.current = null; latest.current = null; estimator.current.reset(); estimatorStale.current = true;
          observerRef.current?.onInterrupt?.(done);
          if (collector.current?.pause(done)) publishProgress({ group: collector.current.group, phase: "waiting for fresh tracking", count: collector.current.samples.filter(s => s.group === collector.current?.group).length }, done, true);
          publishReadout(emptyReadout("Inference unavailable; waiting for a fresh camera frame"), true);
          setError(`${failureStage} failed${failure.retry ? "; retrying shortly" : "; tracking paused for recovery"}. ${detail}`);
          if (failure.retry) schedule(failure.delayMs);
          else if (!inferenceRecoveryRequested) {
            inferenceRecoveryRequested = true;
            visibilityRecovery.current?.requestRecovery();
          } else {
            trackingSuspended = true;
            scheduler.current?.cancel(); scheduler.current = null;
            setModelStatus("inference recovery paused");
            setError(`${failureStage} keeps failing after foreground recovery. Tracking is paused; restart the camera to retry. Your session and calibration are preserved. ${detail}`);
          }
          return;
        }
        // At most 15 FPS; skip duplicate video frames. Timers deliberately remain
        // observable under background throttling instead of simulating continuity.
        schedule();
      };
      const suspendInference = () => {
        if (trackingSuspended || run !== generation.current) return;
        trackingSuspended = true; awaitingFreshForegroundFrame = false;
        if (visibilityRetry.current !== null) clearTimeout(visibilityRetry.current);
        visibilityRetry.current = null; recoveryAttempts = 0;
        scheduler.current?.cancel(); scheduler.current = null;
        latest.current = null; lastValidFeaturesAt.current = null; estimator.current.reset(); estimatorStale.current = true;
        const at = performance.now(); observerRef.current?.onInterrupt?.(at);
        if (collector.current && collector.current.pause(at)) {
          publishProgress({ group: collector.current.group, phase: "waiting for foreground tracking", count: collector.current.samples.filter(s => s.group === collector.current?.group).length }, at, true);
        }
        if (experimentRef.current) experimentRef.current.interruptions.push({ at, reason: "FocusFlow page hidden or window unfocused" });
        publishReadout(emptyReadout("Tracking unavailable while FocusFlow is hidden or unfocused"), true);
      };
      const resumeInference = async () => {
        if (run !== generation.current || !trackingSuspended) return false;
        const activeStream = stream.current, tracks = activeStream?.getVideoTracks() ?? [];
        if (!activeStream || tracks.length === 0 || tracks.some(track => track.readyState !== "live")) {
          setError("The camera stream did not survive the background switch. Your session and calibration are preserved; restart the camera when ready.");
          return false;
        }
        if (!activeStream.active || tracks.some(track => track.muted)) {
          setError("The camera is temporarily not producing frames. Focus Flow will retry while this tab is visible.");
          retryForegroundRecovery();
          return false;
        }
        if (video.srcObject !== activeStream) video.srcObject = activeStream;
        try { await video.play(); }
        catch (cause) { setError(`Camera playback did not resume: ${cause instanceof Error ? cause.message : "allow camera playback and keep this tab visible"}`); retryForegroundRecovery(); return false; }
        if (run !== generation.current || !isForeground()) return false;
        if (video.readyState < 2 || video.videoWidth <= 0 || video.videoHeight <= 0) {
          setError("The camera is returning, but no fresh video frame is ready yet. Keep FocusFlow visible while it reconnects.");
          retryForegroundRecovery();
          return false;
        }
        if (visibilityRetry.current !== null) clearTimeout(visibilityRetry.current);
        visibilityRetry.current = null; recoveryAttempts = 0;
        trackingSuspended = false; awaitingFreshForegroundFrame = true;
        foregroundFrameBaseline = video.currentTime;
        latest.current = null; lastValidFeaturesAt.current = null; estimator.current.reset(); estimatorStale.current = true;
        lastInferenceStart.current = null;
        setError("Tracking is waiting for a fresh camera frame.");
        scheduler.current = createVideoFrameScheduler(video as unknown as VideoFrameSource, tick);
        scheduler.current.schedule(0);
        return true;
      };
      visibilityRecovery.current = createVisibilityRecoveryController(isForeground, suspendInference, resumeInference);
      visibilityRecovery.current.update();
      if (!trackingSuspended) {
        scheduler.current = createVideoFrameScheduler(video as unknown as VideoFrameSource, tick);
        scheduler.current.schedule(0);
      }
    } catch (cause) {
      if (run !== generation.current) return;
      stopInternal(true);
      setCamera(cause instanceof CameraError ? cause.status : "error");
      setPermission(cause instanceof CameraError && cause.status === "denied" ? "denied" : "see camera status");
      setModelStatus("not ready"); setError(cause instanceof Error ? cause.message : "Initialization failed");
    }
  }, [stopInternal, publishProgress, publishReadout]);

  const calibrate = useCallback(() => {
    if (!landmarker.current) return;
    observerRef.current?.onInterrupt?.(performance.now());
    calibrationRef.current = null; setCalibration(null); estimator.current.reset(); publishReadout(EMPTY, true); setError("");
    collector.current = new CalibrationCollector(performance.now());
    publishProgress({ group: 0, phase: "settling", count: 0 }, performance.now(), true);
  }, [publishProgress, publishReadout]);
  const retryCalibrationPoint = useCallback(() => {
    const current = collector.current;
    if (!current) return;
    current.retryCurrent(performance.now());
    publishProgress({ group: current.group, phase: current.paused ? "waiting for fresh tracking" : "settling", count: 0 }, performance.now(), true);
    setError("");
  }, [publishProgress]);
  const cancelCalibration = useCallback(() => { collector.current = null; publishProgress(null, performance.now(), true); }, [publishProgress]);

  useEffect(() => {
    mounted.current = true;
    const log = () => {
      const event = { at: performance.now(), state: document.visibilityState, focused: document.hasFocus() };
      setVisibility(`${event.state} / ${event.focused ? "focused" : "unfocused"}`);
      visibilityLog.current.push(event);
      visibilityLog.current = visibilityLog.current.slice(-1000);
      experimentRef.current?.visibility.push(event);
      // Chrome may throttle camera callbacks off-screen. Preserve the estimator
      // and current calibration point, but never treat hidden frames as gaze.
      visibilityRecovery.current?.update();
    };
    log();
    const resize = () => {
      if (!calibrationRef.current && !collector.current) return;
      observerRef.current?.onInterrupt?.(performance.now());
      calibrationRef.current = null; collector.current = null; estimator.current.reset();
      setCalibration(null); publishProgress(null, performance.now(), true); publishReadout(EMPTY, true); setError("Viewport changed. Recalibrate for this window size.");
    };
    document.addEventListener("visibilitychange", log); window.addEventListener("focus", log); window.addEventListener("blur", log);
    window.addEventListener("resize", resize);
    const watchdog = setInterval(() => {
      const now = performance.now(), last = lastInference.current;
      const windowSamples = recent.current.filter(m => m.at >= now - 5000);
      if (lastStatsPublishAt.current === null || now - lastStatsPublishAt.current >= 1000) { setStats(summarize(windowSamples, now - 5000, now)); lastStatsPublishAt.current = now; }
      const lastValid = lastValidFeaturesAt.current;
      if (((last !== null && now - last > 500) || (lastValid !== null && now - lastValid > 500)) && !estimatorStale.current) {
        estimator.current.reset(); estimatorStale.current = true;
        publishReadout(emptyReadout(last !== null && now - last > 500 ? "Inference stale: no completed frame for >500 ms" : "Tracking stale: no valid gaze features for >500 ms"), true);
      }
      if (collector.current && last !== null && now - last > CALIBRATION.transientGapMs) {
        if (collector.current.pause(last)) publishProgress({ group: collector.current.group, phase: "waiting for fresh tracking", count: collector.current.samples.filter(s => s.group === collector.current?.group).length }, now, true);
      }
      if (collector.current?.paused && collector.current.restartAfterProlongedLoss(now)) {
        publishProgress({ group: collector.current.group, phase: "tracking lost · retrying this point", count: 0 }, now, true);
        setError(`Tracking has been unavailable for over ${CALIBRATION.prolongedLossMs / 1000} seconds. Target ${collector.current.group + 1} was reset; it will resume when fresh tracking returns.`);
      }
      if (collector.current && !collector.current.paused && now - collector.current.targetSince > CALIBRATION.timeoutMs) {
        collector.current = null; publishProgress(null, now, true); setError("Calibration timed out. Check the camera and lighting, then retry.");
      }
    }, 250);
    return () => {
      mounted.current = false; stop(); clearInterval(watchdog);
      document.removeEventListener("visibilitychange", log); window.removeEventListener("focus", log); window.removeEventListener("blur", log);
      window.removeEventListener("resize", resize);
    };
  }, [stop, publishProgress, publishReadout]);

  const startExperiment = useCallback((scenario: Scenario) => {
    if (!landmarker.current || experimentRef.current) return;
    const run: Experiment = { scenario, startedAt: new Date().toISOString(), start: performance.now(), stop: null, measurements: [], visibility: [{ at: performance.now(), state: document.visibilityState, focused: document.hasFocus() }], interruptions: [] };
    experimentRef.current = run; setExperiment(run);
  }, []);
  const stopExperiment = useCallback(() => {
    const run = experimentRef.current;
    if (!run) return;
    run.stop = performance.now(); experimentRef.current = null;
    resultsRef.current = [...resultsRef.current, run]; setResults(resultsRef.current); setExperiment(null);
  }, []);
  const exportResults = useCallback(() => {
    const payload = {
      schema: 1, exportedAt: new Date().toISOString(), userAgent: navigator.userAgent,
      timeOrigin: performance.timeOrigin, clock: "performance.now(), milliseconds", synthetic: false,
      visibility: visibilityLog.current,
      experiments: resultsRef.current.map(run => ({ ...run, summary: summarize(run.measurements, run.start, run.stop ?? performance.now()), minimumDurationMet: (run.stop ?? performance.now()) - run.start >= 30000 })),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "focusflow-background-diagnostics.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);
  return { videoRef, camera, permission, modelStatus, error, readout, stats, calibration, progress, visibility, experiment, results, start, stop, calibrate, retryCalibrationPoint, cancelCalibration, startExperiment, stopExperiment, exportResults };
}
