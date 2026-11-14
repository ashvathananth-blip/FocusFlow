"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import type { CalibrationResult, Features } from "@/types/vision";
import { CameraError, openCamera, releaseCamera, type CameraStatus } from "@/lib/vision/camera";
import { loadLandmarker } from "@/lib/vision/landmarks";
import { extractFeatures } from "@/lib/vision/features";
import { CalibrationCollector, finishCalibration } from "@/lib/vision/calibration";
import { GazeEstimator } from "@/lib/vision/gaze-estimator";
import { summarize, type Experiment, type InferenceMeasurement, type Scenario, type VisibilityEvent } from "@/lib/vision/diagnostics";

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
  const generation = useRef(0), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true), estimator = useRef(new GazeEstimator());
  const collector = useRef<CalibrationCollector | null>(null), calibrationRef = useRef<CalibrationResult | null>(null);
  const latest = useRef<Features | null>(null), lastInference = useRef<number | null>(null);
  const recent = useRef<InferenceMeasurement[]>([]), experimentRef = useRef<Experiment | null>(null);
  const resultsRef = useRef<Experiment[]>([]), visibilityLog = useRef<VisibilityEvent[]>([]);
  const [camera, setCamera] = useState<CameraStatus>("idle"), [permission, setPermission] = useState("not requested");
  const [modelStatus, setModelStatus] = useState("not loaded"), [error, setError] = useState("");
  const [readout, setReadout] = useState<Readout>(EMPTY), [stats, setStats] = useState(EMPTY_STATS);
  const [calibration, setCalibration] = useState<CalibrationResult | null>(null);
  const [progress, setProgress] = useState<{ group: number; phase: string; count: number } | null>(null);
  const [visibility, setVisibility] = useState("unknown"), [experiment, setExperiment] = useState<Experiment | null>(null);
  const [results, setResults] = useState<Experiment[]>([]);

  const stop = useCallback(() => {
    observerRef.current?.onInterrupt?.(performance.now());
    generation.current++;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    releaseCamera(stream.current); stream.current = null;
    landmarker.current?.close(); landmarker.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    collector.current = null; calibrationRef.current = null; latest.current = null;
    estimator.current.reset(); lastInference.current = null; recent.current = [];
    if (experimentRef.current) experimentRef.current.interruptions.push({ at: performance.now(), reason: "Camera stopped" });
    if (mounted.current) { setCamera("stopped"); setModelStatus("released"); setReadout(EMPTY); setCalibration(null); setProgress(null); setStats(EMPTY_STATS); }
  }, []);

  const start = useCallback(async () => {
    stop();
    const run = generation.current;
    setCamera("requesting"); setPermission("requesting"); setError("");
    try {
      const acquired = await openCamera();
      if (run !== generation.current) { releaseCamera(acquired); return; }
      stream.current = acquired;
      setPermission("granted"); setCamera("active"); setModelStatus("loading local WASM and model");
      acquired.getVideoTracks().forEach(track => track.addEventListener("ended", () => {
        if (run === generation.current) { stop(); setError("Camera stream ended. Reconnect or allow the camera, then start again."); }
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
      const tick = () => {
        if (run !== generation.current) return;
        const started = performance.now();
        try {
          if (video.readyState >= 2 && video.currentTime !== previousVideoTime) {
            previousVideoTime = video.currentTime;
            const result = model.detectForVideo(video, started);
            const done = performance.now(), measurement = { at: done, latencyMs: done - started };
            if (lastInference.current !== null && done - lastInference.current > 500) {
              estimator.current.reset();
              if (collector.current) { collector.current = null; setProgress(null); setError("Calibration interrupted by an inference gap over 500 ms. Retry."); }
            }
            lastInference.current = done;
            recent.current.push(measurement); recent.current = recent.current.filter(m => m.at >= done - 5000);
            if (experimentRef.current) experimentRef.current.measurements.push(measurement);
            latest.current = extractFeatures(result.faceLandmarks[0], result.facialTransformationMatrixes[0]?.data, video.videoWidth / video.videoHeight);
            if (collector.current) {
              const current = collector.current;
              try {
                const phase = current.add(latest.current?.vector ?? null, done);
                if (phase === "done") {
                  const fitted = finishCalibration(current.samples);
                  calibrationRef.current = fitted; setCalibration(fitted); collector.current = null; setProgress(null); estimator.current.reset();
                  if (fitted.status === "poor") setError("Calibration validation is poor. Retry with steady posture and better lighting. If it remains poor, stop and consider an approved five-point or simpler-feature fallback.");
                } else setProgress({ group: current.group, phase, count: current.samples.filter(s => s.group === current.group).length });
              } catch (cause) {
                collector.current = null; setProgress(null); setError(cause instanceof Error ? cause.message : "Calibration failed");
              }
            }
            const next = { ...estimator.current.update(latest.current, calibrationRef.current), faceDetected: !!result.faceLandmarks[0]?.length, at: done, calibrating: !!collector.current };
            observerRef.current?.onSample?.(next);
            setReadout(next);
          }
        } catch (cause) {
          stop(); setModelStatus("inference failed"); setError(cause instanceof Error ? cause.message : "Inference failed"); return;
        }
        // At most 15 FPS; skip duplicate video frames. Timers deliberately remain
        // observable under background throttling instead of simulating continuity.
        timer.current = setTimeout(tick, Math.max(0, 1000 / 15 - (performance.now() - started)));
      };
      tick();
    } catch (cause) {
      if (run !== generation.current) return;
      stop();
      setCamera(cause instanceof CameraError ? cause.status : "error");
      setPermission(cause instanceof CameraError && cause.status === "denied" ? "denied" : "see camera status");
      setModelStatus("not ready"); setError(cause instanceof Error ? cause.message : "Initialization failed");
    }
  }, [stop]);

  const calibrate = useCallback(() => {
    if (!landmarker.current) return;
    observerRef.current?.onInterrupt?.(performance.now());
    calibrationRef.current = null; setCalibration(null); estimator.current.reset(); setReadout(EMPTY); setError("");
    collector.current = new CalibrationCollector(performance.now());
    setProgress({ group: 0, phase: "settling", count: 0 });
  }, []);
  const cancelCalibration = useCallback(() => { collector.current = null; setProgress(null); }, []);

  useEffect(() => {
    mounted.current = true;
    const log = () => {
      const event = { at: performance.now(), state: document.visibilityState, focused: document.hasFocus() };
      setVisibility(`${event.state} / ${event.focused ? "focused" : "unfocused"}`);
      visibilityLog.current.push(event);
      visibilityLog.current = visibilityLog.current.slice(-1000);
      experimentRef.current?.visibility.push(event);
      // Never let calibration combine observations across hidden/unfocused periods.
      if (collector.current && (event.state !== "visible" || !event.focused)) {
        collector.current = null; setProgress(null); setError("Calibration interrupted by visibility/focus change. Retry in the visible tab.");
      }
    };
    log();
    const resize = () => {
      if (!calibrationRef.current && !collector.current) return;
      observerRef.current?.onInterrupt?.(performance.now());
      calibrationRef.current = null; collector.current = null; estimator.current.reset();
      setCalibration(null); setProgress(null); setReadout(EMPTY); setError("Viewport changed. Recalibrate for this window size.");
    };
    document.addEventListener("visibilitychange", log); window.addEventListener("focus", log); window.addEventListener("blur", log);
    window.addEventListener("resize", resize);
    const watchdog = setInterval(() => {
      const now = performance.now(), last = lastInference.current;
      const windowSamples = recent.current.filter(m => m.at >= now - 5000);
      setStats(summarize(windowSamples, now - 5000, now));
      if (last !== null && now - last > 500) { estimator.current.reset(); setReadout(emptyReadout("Inference stale: no completed frame for >500 ms")); }
      if (collector.current && now - collector.current.targetSince > 12000) {
        collector.current = null; setProgress(null); setError("Calibration timed out. Check the camera and lighting, then retry.");
      }
    }, 250);
    return () => {
      mounted.current = false; stop(); clearInterval(watchdog);
      document.removeEventListener("visibilitychange", log); window.removeEventListener("focus", log); window.removeEventListener("blur", log);
      window.removeEventListener("resize", resize);
    };
  }, [stop]);

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
  return { videoRef, camera, permission, modelStatus, error, readout, stats, calibration, progress, visibility, experiment, results, start, stop, calibrate, cancelCalibration, startExperiment, stopExperiment, exportResults };
}
