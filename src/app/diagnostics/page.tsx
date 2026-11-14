"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { CalibrationOverlay } from "@/components/calibration/calibration-overlay";
import { useGazeTracking } from "@/hooks/useGazeTracking";
import { CLASSIFICATION } from "@/lib/vision/classifier";
import { summarize, type Scenario } from "@/lib/vision/diagnostics";
type PipApi = { requestWindow: (options: { width: number; height: number }) => Promise<Window> };
const number = (value: number | null, digits = 1) => value === null ? "unavailable" : value.toFixed(digits);
const point = (value: { x: number; y: number } | null) => value ? `${number(value.x, 4)}, ${number(value.y, 4)}` : "unavailable";
const scenarios: Scenario[] = ["A-visible-tab", "B-other-tab", "C-other-app", "D-document-pip"];
const subscribeCapability = () => () => {};
const pipCapability = () => "documentPictureInPicture" in window;
export default function Diagnostics() {
  const { videoRef, camera, permission, modelStatus, error, readout, stats, calibration, progress, visibility, experiment, results, start, stop, calibrate, cancelCalibration, startExperiment, stopExperiment, exportResults } = useGazeTracking();
  const [scenario, setScenario] = useState<Scenario>("A-visible-tab");
  const [pipStatus, setPipStatus] = useState("not tested");
  const pipSupported = useSyncExternalStore(subscribeCapability, pipCapability, () => false);
  const pip = useRef<Window | null>(null), pipText = useRef<HTMLParagraphElement | null>(null);
  const busy = camera === "requesting" || modelStatus.startsWith("loading"), ready = modelStatus.startsWith("ready");
  useEffect(() => () => pip.current?.close(), []);
  useEffect(() => {
    if (pipText.current) pipText.current.textContent = `${readout.focusLevel} · ${readout.quality} · ${number(stats.fps)} FPS (rolling 5s)`;
  }, [readout, stats]);
  async function openPip() {
    try {
      const api = (window as Window & { documentPictureInPicture?: PipApi }).documentPictureInPicture;
      if (!api) { setPipStatus("unsupported"); return; }
      pip.current?.close();
      const child = await api.requestWindow({ width: 360, height: 180 }); pip.current = child;
      child.document.documentElement.style.colorScheme = "dark";
      child.document.body.style.backgroundColor = "#121212";
      child.document.body.style.color = "#E5E5E5";
      child.document.title = "FocusFlow feasibility experiment";
      const heading = child.document.createElement("h1"); heading.textContent = "FocusFlow diagnostic";
      const text = child.document.createElement("p"); text.textContent = "Waiting for live readout"; pipText.current = text;
      const note = child.document.createElement("p"); note.textContent = "Inference remains in the source tab. This probe tests whether visible Document PiP affects continuity.";
      child.document.body.append(heading, text, note);
      child.addEventListener("pagehide", () => { pipText.current = null; pip.current = null; setPipStatus("closed"); }, { once: true });
      setPipStatus("open — continuity unverified");
    } catch (error) { setPipStatus(error instanceof Error ? error.message : "Document PiP failed"); }
  }
  const rows = [
    ["Focus level (high/medium earn credit)", readout.focusLevel],
    ["Gaze classification (not browser focus)", readout.classification],
    ["Classification reason", readout.reason],
    ["Face detected (MediaPipe)", readout.faceDetected === null ? "no current inference" : readout.faceDetected ? "yes" : "no"],
    ["Last completed inference (monotonic ms)", number(readout.at, 0)],
    ["Raw regression (x, y), unclamped", point(readout.raw)],
    ["Smoothed median (x, y)", point(readout.coordinate)],
    ["Smoothing samples", `${readout.samples} / ${readout.requiredSamples}`],
    ["Active bounds (both axes, inclusive)", `${number(readout.bounds.min, 3)} to ${number(readout.bounds.max, 3)}`],
    ["Base margin / retention hysteresis", `${CLASSIFICATION.margin} / ${CLASSIFICATION.hysteresis}`],
    ["Previous class used for bounds", readout.previous],
    ["Quality gate reasons", readout.reasons.join("; ")],
    ["Minimum eye aperture (gate <0.08)", number(readout.minAperture, 4)],
    ["Feature RMS / spread rejection thresholds", ">3 / >1.6"],
    ["Live features: Lx, Ly, Rx, Ry, yaw, pitch", readout.features?.map(v => number(v, 5)).join(", ") ?? "unavailable"],
    ["Tracking quality", readout.quality], ["Inference FPS (5s)", number(stats.fps)],
    ["Median latency", `${number(stats.medianLatencyMs)} ms`], ["Median interval", `${number(stats.medianIntervalMs)} ms`],
    ["Maximum gap (5s)", `${number(stats.maximumGapMs)} ms`], ["Gaps >500 ms (5s)", stats.gapsOver500Ms],
    ["Calibration", calibration?.status ?? "not calibrated"], ["Valid samples", calibration?.count ?? "unavailable"],
    ["Held-out median error", number(calibration?.error ?? null, 3)],
    ["Feature distance / stability", `${number(readout.distance, 2)} / ${number(readout.stability, 3)}`],
  ];
  return <main className="mx-auto max-w-5xl space-y-6 p-6">
    <header><h1 className="text-2xl font-semibold">FocusFlow · Stage 1 diagnostics</h1><p>Local webcam gaze spike. No video recording, uploads, or saved calibration. Gaze estimates visual engagement, not mental attention.</p><Link href="/history" className="underline">History</Link></header>
    <section className="space-y-3 rounded border p-4" aria-label="Camera controls">
      <div className="flex flex-wrap gap-3"><Button disabled={busy || ready} onClick={start}>Start camera</Button><Button variant="outline" disabled={camera === "idle" || camera === "stopped"} onClick={stop}>Stop camera</Button><Button variant="outline" disabled={!ready || !!experiment} onClick={calibrate}>{calibration ? "Recalibrate" : "Calibrate nine points"}</Button></div>
      <p>Camera: {camera} · Permission: {permission} · Model: {modelStatus}</p><p>Browser tab visibility / window focus: {visibility}</p><p className="text-sm">“Visible” and “focused” describe the browser APIs, not your face or gaze. Looking away does not blur the window. Gaze classification appears separately below.</p>
      {error && <p role="alert" className="text-red-300">{error}</p>}
      <video ref={videoRef} autoPlay playsInline muted className="aspect-video w-64 -scale-x-100 rounded bg-[#262626]" aria-label="Mirrored live camera preview" />
      <p className="text-sm">Use good lighting, remove glare, and keep posture steady. Calibration covers the viewport. Recalibrate after resizing, moving the camera, or changing posture.</p>
    </section>
    <section className="rounded border p-4" aria-label="Live readout"><h2 className="text-lg font-semibold">Live readout</h2><dl className="grid grid-cols-2 gap-2">{rows.map(([label, value]) => <div key={label} className="contents"><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <p className="mt-3 text-sm">Error is Euclidean distance in normalized viewport coordinates. Validation holds out each entire target group; nine targets provide limited evidence. Poor calibration disables definite gaze classification. FPS counts completed real inference calls, including calls with no detected face. The rolling display uses a full five-second denominator.</p>
      {calibration && <p>Per-target held-out median errors: {calibration.groupErrors.map(e => e.toFixed(3)).join(", ")}</p>}
      {calibration && <details className="mt-4"><summary>Regression fit and collapse diagnostics</summary>
        <p>Training median error: {number(calibration.diagnostics.trainingError, 4)}; held-out median error: {number(calibration.error, 4)}. A much smaller training error can indicate overfitting. Small prediction spans or target medians near the center indicate weak gaze separation. These are diagnostics, not proof of accuracy.</p>
        <p>Training prediction ranges: X [{calibration.diagnostics.predictionRange.x.map(v => number(v, 4)).join(", ")}]; Y [{calibration.diagnostics.predictionRange.y.map(v => number(v, 4)).join(", ")}]. Target ranges are [0.1, 0.9] on each axis. Ridge λ={calibration.model.lambda}; no coordinate clamping.</p>
        <p>Training feature ranges (Lx, Ly, Rx, Ry, yaw, pitch): {calibration.diagnostics.featureRanges.map(r => `[${r.map(v => number(v, 5)).join(", ")}]`).join(" ")}</p>
        <table className="w-full text-left text-sm"><caption>Calibration target versus fitted median (training data)</caption><thead><tr><th>Target</th><th>Expected x, y</th><th>Fitted x, y</th></tr></thead><tbody>{calibration.diagnostics.targetPredictions.map((p, i) => <tr key={i}><td>{i + 1}</td><td>{point({ x: [0.1, 0.5, 0.9][i % 3], y: [0.1, 0.5, 0.9][Math.floor(i / 3)] })}</td><td>{point(p)}</td></tr>)}</tbody></table>
      </details>}
      <p className="mt-3 text-sm">Test center → left/right/top/bottom → beyond each edge, holding each for two seconds. Compare live features, raw and median coordinates. If raw moves but gaze is unknown, inspect quality reasons. If raw stays centered, inspect fitted target medians and training versus held-out error. Exit from on-screen requires a median beyond −0.13 or 1.13; re-entry uses −0.08 to 1.08. High and medium are both focused; medium includes screen edges. Large or unreliable gaze changes can still trigger quality gates; unknown is uncertainty, not focused.</p>
    </section>
    <section className="space-y-3 rounded border p-4" aria-label="Background experiment"><h2 className="text-lg font-semibold">Background feasibility experiment</h2>
      <p>Start the camera, choose a scenario, then start a run. Spend at least 30 seconds in the target condition before returning to stop. Export includes inference timestamps, latency, visibility/focus events, and interruptions. It excludes facial features and calibration.</p>
      <label className="block">Scenario <select value={scenario} disabled={!!experiment} onChange={e => setScenario(e.target.value as Scenario)} className="rounded border p-2">{scenarios.map(s => <option key={s}>{s}</option>)}</select></label>
      <div className="flex flex-wrap gap-3"><Button disabled={!ready || !!experiment || !!progress} onClick={() => startExperiment(scenario)}>Start experiment</Button><Button variant="outline" disabled={!experiment} onClick={stopExperiment}>Stop experiment</Button><Button variant="outline" disabled={!results.length || !!experiment} onClick={exportResults}>Export completed runs (JSON)</Button><Button variant="outline" disabled={!pipSupported} onClick={openPip}>Open experimental Document PiP</Button></div>
      <p aria-live="polite">{experiment ? `Recording ${experiment.scenario}; stop after at least 30 seconds in condition.` : "No experiment recording"}</p>
      <p>Document PiP: {pipSupported ? pipStatus : "unsupported"}. This probe does not guarantee background reliability.</p>
      <ol className="list-decimal space-y-1 pl-6"><li>A: keep this tab visible for at least 30 seconds.</li><li>B: switch to another Chrome tab for at least 30 seconds, then return and stop.</li><li>C: switch to another desktop app for at least 30 seconds, then return and stop.</li><li>D: open Document PiP first, return focus here to start the D run, then switch tabs/apps with PiP visible for at least 30 seconds. Return and stop. Record unsupported if unavailable.</li></ol>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="text-left">Measured completed runs — no results until recorded</caption><thead><tr>{["Scenario", "Duration", "FPS", "Median interval", "Max gap", "Gaps >500ms", "Median latency"].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{results.map((run, i) => {
        const s = summarize(run.measurements, run.start, run.stop!);
        return <tr key={i}><td>{run.scenario}{run.interruptions.length ? " (interrupted)" : ""}</td><td>{number(s.durationMs / 1000)}s{s.durationMs < 30000 ? " — too short" : ""}</td><td>{number(s.fps)}</td><td>{number(s.medianIntervalMs)} ms</td><td>{number(s.maximumGapMs)} ms</td><td>{s.gapsOver500Ms}</td><td>{number(s.medianLatencyMs)} ms</td></tr>;
      })}</tbody></table></div>
    </section>
    <details className="rounded border p-4"><summary>Engineering thresholds and limitations</summary><p>Both eyes required; aperture/width 0.08–0.65. Head yaw limit 1 radian, pitch 0.9. Calibration: 800 ms settling, 24 samples per target, 16 minimum after a 3.5-MAD filter (scale floor 0.015). Ridge λ=0.1, unpenalized intercept, training-only standardization. Poor: median held-out error &gt;0.20 or any target median &gt;0.35.</p><p>Unavailable: unusable landmarks. Low: uncalibrated/poor fit, standardized feature RMS &gt;3, five-prediction spread &gt;1.6, or aperture &lt;0.08. High requires error ≤0.12, feature RMS ≤1.5, spread ≤0.08, aperture ≥0.15; other valid tracking is medium. Low/unavailable gives unknown immediately. Stale inference over 500 ms clears classification when execution resumes. Screen margin 8%; on-screen retention adds 5% hysteresis. Quality-distance scale floors: iris X 0.025, iris Y 0.020 eye-width units per eye; yaw 0.10 rad, pitch 0.08 rad, centered on calibration means. Regression training scales remain unchanged. High uses the calibrated inner region [0.1, 0.9] on each axis, retained to [0.05, 0.95] with high quality. Other accepted on-screen estimates are medium; both earn credit. Smoothing requires five valid predictions. These are engineering assumptions, not validated confidence scores.</p><p>Synchronous CPU VIDEO inference is capped at 15 calls/second, using unique decoded frames at 640×480 ideal camera size. A worker needs latency evidence and frame-transfer testing; this spike uses a measurable main-thread pipeline. Suspension can prevent UI updates until resume. Document PiP leaves inference in the source page, so results apply only to this arrangement.</p></details>
    {progress && <CalibrationOverlay progress={progress} cancel={cancelCalibration} />}
  </main>;
}
