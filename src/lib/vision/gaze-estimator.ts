import type { CalibrationResult, Features, Point } from "@/types/vision";
import { GazeClassifier } from "./classifier";
import { predict } from "./regression";
import { trackingQuality } from "./tracking-quality";

export class GazeEstimator {
  private recent: Point[] = [];
  private classifier = new GazeClassifier();
  reset() { this.recent = []; this.classifier.reset(); }
  update(features: Features | null, calibration: CalibrationResult | null) {
    const raw = features && calibration?.status === "ready" ? predict(calibration.model, features.vector) : null;
    if (raw) { this.recent.push(raw); this.recent = this.recent.slice(-5); } else this.recent = [];
    const quality = trackingQuality(features, calibration, this.recent);
    return { ...this.classifier.update(raw, quality.quality), ...quality, raw,
      features: features?.vector ?? null, minAperture: features?.minAperture ?? null };
  }
}
