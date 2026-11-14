import type { FocusLevel, GazeClass, Point, Quality } from "@/types/vision";
import { median } from "./regression";

export const CLASSIFICATION = { margin: 0.08, hysteresis: 0.05, smoothing: 5, highInset: 0.10 } as const;
export class GazeClassifier {
  private history: Point[] = [];
  private previous: GazeClass = "unknown";
  private previousLevel: FocusLevel = "unknown";
  constructor(private margin: number = CLASSIFICATION.margin, private hysteresis: number = CLASSIFICATION.hysteresis) {}
  reset() { this.history = []; this.previous = "unknown"; this.previousLevel = "unknown"; }
  update(point: Point | null, quality: Quality) {
    const previous = this.previous;
    const expansion = previous === "on-screen" ? this.margin + this.hysteresis : this.margin;
    const bounds = { min: -expansion, max: 1 + expansion };
    const diagnostics = { bounds, previous, margin: this.margin, hysteresis: this.hysteresis, requiredSamples: CLASSIFICATION.smoothing };
    if (!point || ![point.x, point.y].every(Number.isFinite) || quality === "low" || quality === "unavailable") {
      this.reset(); return { ...diagnostics, classification: "unknown" as GazeClass, focusLevel: "unknown" as FocusLevel, coordinate: null, samples: 0,
        reason: !point ? "No calibrated prediction" : ![point.x, point.y].every(Number.isFinite) ? "Non-finite prediction" : `Quality gate: ${quality}; smoothing reset` };
    }
    this.history.push(point); this.history = this.history.slice(-CLASSIFICATION.smoothing);
    const coordinate = { x: median(this.history.map(p => p.x)), y: median(this.history.map(p => p.y)) };
    if (this.history.length < CLASSIFICATION.smoothing) return { ...diagnostics, classification: "unknown" as GazeClass, focusLevel: "unknown" as FocusLevel, coordinate, samples: this.history.length, reason: "Collecting five valid predictions" };
    const inside = coordinate.x >= -expansion && coordinate.x <= 1 + expansion && coordinate.y >= -expansion && coordinate.y <= 1 + expansion;
    this.previous = inside ? "on-screen" : "off-screen";
    const inset = this.previousLevel === "high" ? CLASSIFICATION.highInset - this.hysteresis : CLASSIFICATION.highInset;
    const nearCalibratedRegion = coordinate.x >= inset && coordinate.x <= 1 - inset && coordinate.y >= inset && coordinate.y <= 1 - inset;
    const focusLevel: FocusLevel = !inside ? "low" : quality === "high" && nearCalibratedRegion ? "high" : "medium";
    this.previousLevel = focusLevel;
    const outside = [coordinate.x < bounds.min && "left", coordinate.x > bounds.max && "right", coordinate.y < bounds.min && "top", coordinate.y > bounds.max && "bottom"].filter(Boolean);
    return { ...diagnostics, classification: this.previous, focusLevel, coordinate, samples: this.history.length,
      reason: inside ? `Median inside active bounds (${previous === "on-screen" ? "retention hysteresis" : "base margin"})` : `Median outside active bounds: ${outside.join(", ")}` };
  }
}
