import type { Point, RegressionModel, Sample } from "@/types/vision";

export function median(values: readonly number[]): number {
  if (!values.length || !values.every(Number.isFinite)) throw new Error("Expected finite nonempty values");
  const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function validVector(vector: readonly number[], size: number) { return vector.length === size && vector.every(Number.isFinite); }
export function normalizeInput(input: readonly number[], mean: readonly number[], scale: readonly number[]): number[] {
  if (!validVector(input, mean.length) || !validVector(scale, mean.length) || !mean.every(Number.isFinite) || scale.some(s => s <= 0)) throw new Error("Invalid regression input");
  return input.map((value, i) => (value - mean[i]) / scale[i]);
}
// Pivoted Gauss-Jordan solves both output columns. Ridge keeps collinear eye
// features invertible; the intercept is deliberately not penalized.
function solve(a: number[][], b: number[][]): number[][] {
  const n = a.length, rows = a.map((row, i) => [...row, ...b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(rows[r][col]) > Math.abs(rows[pivot][col])) pivot = r;
    if (Math.abs(rows[pivot][col]) < 1e-10) throw new Error("Numerically singular calibration; retry");
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    const divisor = rows[col][col];
    rows[col] = rows[col].map(v => v / divisor);
    for (let r = 0; r < n; r++) if (r !== col) {
      const factor = rows[r][col];
      rows[r] = rows[r].map((v, j) => v - factor * rows[col][j]);
    }
  }
  const result = rows.map(row => row.slice(n));
  if (!result.flat().every(Number.isFinite)) throw new Error("Non-finite calibration fit");
  return result;
}
export function fitRegression(samples: readonly Sample[], lambda = 0.1): RegressionModel {
  const d = samples[0]?.features.length ?? 0;
  if (!d || samples.length < d + 2 || !Number.isFinite(lambda) || lambda <= 0 || samples.some(s => !validVector(s.features, d) || ![s.target.x, s.target.y].every(Number.isFinite))) throw new Error("Invalid or insufficient calibration samples");
  const mean = Array.from({ length: d }, (_, j) => samples.reduce((sum, s) => sum + s.features[j], 0) / samples.length);
  const scale = mean.map((m, j) => Math.max(1e-6, Math.sqrt(samples.reduce((sum, s) => sum + (s.features[j] - m) ** 2, 0) / samples.length)));
  const a = Array.from({ length: d + 1 }, () => Array(d + 1).fill(0) as number[]);
  const b = Array.from({ length: d + 1 }, () => [0, 0]);
  for (const sample of samples) {
    const row = [1, ...normalizeInput(sample.features, mean, scale)];
    row.forEach((v, i) => {
      row.forEach((w, j) => { a[i][j] += v * w; });
      b[i][0] += v * sample.target.x; b[i][1] += v * sample.target.y;
    });
  }
  for (let i = 1; i <= d; i++) a[i][i] += lambda;
  return { mean, scale, weights: solve(a, b), lambda };
}
export function predict(model: RegressionModel, input: readonly number[]): Point {
  const row = [1, ...normalizeInput(input, model.mean, model.scale)];
  const result = { x: row.reduce((s, v, i) => s + v * model.weights[i][0], 0), y: row.reduce((s, v, i) => s + v * model.weights[i][1], 0) };
  if (![result.x, result.y].every(Number.isFinite)) throw new Error("Non-finite prediction");
  return result;
}
export function coordinateError(a: Point, b: Point) { return Math.hypot(a.x - b.x, a.y - b.y); }
