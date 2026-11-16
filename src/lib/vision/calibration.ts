import type { CalibrationResult, Point, Sample } from "@/types/vision";
import { coordinateError, fitRegression, median, predict } from "./regression";

export const TARGETS: Point[] = [0.1, 0.5, 0.9].flatMap(y => [0.1, 0.5, 0.9].map(x => ({ x, y })));
export const CALIBRATION = { settleMs: 800, samplesPerTarget: 24, minimumSamples: 16, timeoutMs: 12000, transientGapMs: 500, prolongedLossMs: 2500, maxError: 0.20, lambda: 0.1 } as const;
export function rejectOutliers(samples: readonly Sample[]): Sample[] {
  const finite = samples.filter(s => s.features.length === 6 && s.features.every(Number.isFinite) && [s.target.x, s.target.y].every(Number.isFinite));
  if (finite.length < 3) return [];
  const centers = finite[0].features.map((_, i) => median(finite.map(s => s.features[i])));
  const deviations = centers.map((m, i) => Math.max(0.015, 1.4826 * median(finite.map(s => Math.abs(s.features[i] - m)))));
  return finite.filter(s => s.features.every((v, i) => Math.abs(v - centers[i]) <= 3.5 * deviations[i]));
}
export function validateGroups(samples: readonly Sample[], lambda = CALIBRATION.lambda): { error: number; groupErrors: number[] } {
  const groups = [...new Set(samples.map(s => s.group))];
  if (groups.length !== 9) throw new Error("All nine target groups are required");
  const errors: number[] = [];
  const groupErrors = groups.map(group => {
    const train = samples.filter(s => s.group !== group), test = samples.filter(s => s.group === group);
    const model = fitRegression(train, lambda); // normalization computed from this fold only
    const fold = test.map(s => coordinateError(predict(model, s.features), s.target));
    errors.push(...fold);
    return median(fold);
  });
  return { error: median(errors), groupErrors };
}
export function finishCalibration(samples: readonly Sample[]): CalibrationResult {
  const clean = TARGETS.flatMap((_, group) => {
    const accepted = rejectOutliers(samples.filter(s => s.group === group));
    if (accepted.length < CALIBRATION.minimumSamples) throw new Error(`Target ${group + 1} has too few valid samples. Retry calibration.`);
    return accepted;
  });
  const validation = validateGroups(clean);
  const model = fitRegression(clean, CALIBRATION.lambda);
  const predictions = clean.map(s => predict(model, s.features));
  const range = (values: number[]): [number, number] => [Math.min(...values), Math.max(...values)];
  const diagnostics = {
    trainingError: median(predictions.map((p, i) => coordinateError(p, clean[i].target))),
    targetPredictions: TARGETS.map((_, group) => {
      const points = predictions.filter((_, i) => clean[i].group === group);
      return { x: median(points.map(p => p.x)), y: median(points.map(p => p.y)) };
    }),
    predictionRange: { x: range(predictions.map(p => p.x)), y: range(predictions.map(p => p.y)) },
    featureRanges: model.mean.map((_, j) => range(clean.map(s => s.features[j]))),
  };
  return { model, diagnostics, count: clean.length, ...validation, status: validation.error <= CALIBRATION.maxError && Math.max(...validation.groupErrors) <= 0.35 ? "ready" : "poor" };
}

export class CalibrationCollector {
  group = 0;
  targetSince: number;
  samples: Sample[] = [];
  pausedSince: number | null = null;
  private pauseRestarted = false;
  constructor(now: number) { this.targetSince = now; }
  get paused() { return this.pausedSince !== null; }
  pause(now: number): boolean { if (this.pausedSince !== null) return false; this.pausedSince = now; return true; }
  resume(now: number): "resumed" | "retried" {
    if (this.pausedSince === null) return "resumed";
    const gap = Math.max(0, now - this.pausedSince);
    if (gap > CALIBRATION.prolongedLossMs && !this.pauseRestarted) {
      this.retryCurrent(now);
      this.pausedSince = null;
      this.pauseRestarted = false;
      return "retried";
    }
    this.targetSince += gap;
    this.pausedSince = null;
    this.pauseRestarted = false;
    return "resumed";
  }
  restartAfterProlongedLoss(now: number): boolean {
    if (this.pausedSince === null || this.pauseRestarted || now - this.pausedSince <= CALIBRATION.prolongedLossMs) return false;
    this.retryCurrent(now);
    return true;
  }
  retryCurrent(now: number) {
    if (this.group >= TARGETS.length) return;
    this.samples = this.samples.filter(sample => sample.group !== this.group);
    this.targetSince = now;
    if (this.pausedSince !== null) {
      this.pausedSince = now;
      this.pauseRestarted = true;
    }
  }
  add(features: readonly number[] | null, now: number): "settling" | "collecting" | "next" | "done" {
    if (this.paused) return "settling";
    if (now - this.targetSince > CALIBRATION.timeoutMs) throw new Error("Not enough stable eye samples. Improve lighting, open both eyes, and retry.");
    if (now - this.targetSince < CALIBRATION.settleMs) return "settling";
    if (features && features.length === 6 && features.every(Number.isFinite)) this.samples.push({ features: [...features], target: TARGETS[this.group], group: this.group });
    if (this.samples.filter(s => s.group === this.group).length < CALIBRATION.samplesPerTarget) return "collecting";
    if (rejectOutliers(this.samples.filter(s => s.group === this.group)).length < CALIBRATION.minimumSamples) throw new Error("Too many unstable samples. Retry calibration.");
    this.group++;
    this.targetSince = now;
    return this.group === TARGETS.length ? "done" : "next";
  }
}
