import type { CalibrationResult, Features, Point, Quality } from "@/types/vision";
import { coordinateError, normalizeInput } from "./regression";

// These floors affect quality distance only. Regression still uses its original
// training statistics. A steady calibration must not make normal motion invalid.
export const TRACKING_QUALITY = {
  scaleFloors: [0.025, 0.020, 0.025, 0.020, 0.10, 0.08], // eye-width units; yaw/pitch radians
  maxDistance: 3, highDistance: 1.5,
  maxSpread: 1.6, highSpread: 0.08, // full viewport diagonal is approximately 1.414
  minAperture: 0.08, highAperture: 0.15,
} as const;
export function trackingQuality(features: Features | null, calibration: CalibrationResult | null, recent: readonly Point[]): { quality: Quality; distance: number | null; stability: number | null; reasons: string[] } {
  if (!features) return { quality: "unavailable", distance: null, stability: null, reasons: ["Missing or unusable eye landmarks / pose"] };
  if (!calibration || calibration.status === "poor") return { quality: "low", distance: null, stability: null, reasons: [calibration ? "Poor calibration" : "Not calibrated"] };
  const scale = calibration.model.scale.map((s, i) => Math.max(s, TRACKING_QUALITY.scaleFloors[i] ?? s));
  const z = normalizeInput(features.vector, calibration.model.mean, scale);
  const distance = Math.sqrt(z.reduce((s, v) => s + v * v, 0) / z.length);
  const stability = recent.length > 1 ? Math.max(...recent.slice(1).map(p => coordinateError(p, recent[0]))) : 0;
  const quality: Quality = distance > TRACKING_QUALITY.maxDistance || stability > TRACKING_QUALITY.maxSpread || features.minAperture < TRACKING_QUALITY.minAperture ? "low"
    : distance <= TRACKING_QUALITY.highDistance && stability <= TRACKING_QUALITY.highSpread && calibration.error <= 0.12 && features.minAperture >= TRACKING_QUALITY.highAperture ? "high" : "medium";
  const reasons = [distance > TRACKING_QUALITY.maxDistance && "Feature RMS > 3 (outside calibration distribution)", stability > TRACKING_QUALITY.maxSpread && "Prediction spread > 1.6", features.minAperture < TRACKING_QUALITY.minAperture && "Eye aperture < 0.08"].filter((reason): reason is string => Boolean(reason));
  return { quality, distance, stability, reasons: reasons.length ? reasons : [`${quality} quality; no rejection gate triggered`] };
}
