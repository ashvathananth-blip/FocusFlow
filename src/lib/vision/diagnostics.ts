import { median } from "./regression";

export type InferenceMeasurement = { at: number; latencyMs: number; completionGapMs?: number | null; frameIntervalMs?: number | null; decodedFrameDelta?: number | null; scheduledIntervalMs?: number | null };
export type VisibilityEvent = { at: number; state: string; focused: boolean };
export type Scenario = "A-visible-tab" | "B-other-tab" | "C-other-app" | "D-document-pip";
export type Experiment = { scenario: Scenario; startedAt: string; start: number; stop: number | null; measurements: InferenceMeasurement[]; visibility: VisibilityEvent[]; interruptions: { at: number; reason: string }[] };
export function summarize(measurements: readonly InferenceMeasurement[], start: number, stop: number) {
  const durationMs = Math.max(0, stop - start);
  const intervals = measurements.slice(1).map((m, i) => m.at - measurements[i].at);
  const values = (key: "completionGapMs" | "frameIntervalMs" | "decodedFrameDelta" | "scheduledIntervalMs") => measurements.map(m => m[key]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const completionGaps = values("completionGapMs"), frameIntervals = values("frameIntervalMs"), decodedFrameDeltas = values("decodedFrameDelta"), scheduledIntervals = values("scheduledIntervalMs");
  // Include silence at either edge so a completely suspended run cannot appear healthy.
  const gaps = measurements.length ? [measurements[0].at - start, ...intervals, stop - measurements[measurements.length - 1].at] : [durationMs];
  return {
    durationMs, inferenceCount: measurements.length,
    fps: durationMs > 0 ? measurements.length * 1000 / durationMs : 0,
    medianIntervalMs: intervals.length ? median(intervals) : null,
    maximumGapMs: Math.max(0, ...gaps), gapsOver500Ms: gaps.filter(g => g > 500).length,
    medianLatencyMs: measurements.length ? median(measurements.map(m => m.latencyMs)) : null,
    maximumLatencyMs: measurements.length ? Math.max(...measurements.map(m => m.latencyMs)) : null,
    medianCompletionGapMs: completionGaps.length ? median(completionGaps) : null,
    maximumCompletionGapMs: completionGaps.length ? Math.max(...completionGaps) : null,
    medianFrameIntervalMs: frameIntervals.length ? median(frameIntervals) : null,
    maximumFrameIntervalMs: frameIntervals.length ? Math.max(...frameIntervals) : null,
    medianDecodedFrameDelta: decodedFrameDeltas.length ? median(decodedFrameDeltas) : null,
    medianScheduledIntervalMs: scheduledIntervals.length ? median(scheduledIntervals) : null,
  };
}
