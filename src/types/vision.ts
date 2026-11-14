export type Point = { x: number; y: number };
export type Landmark = Point & { z: number };
export type Quality = "high" | "medium" | "low" | "unavailable";
export type FocusLevel = "high" | "medium" | "low" | "unknown";
export type GazeClass = "on-screen" | "off-screen" | "unknown";
export type Eye = { iris: Point; corners: [Point, Point]; normalized: Point; aperture: number };
export type Features = { vector: number[]; left: Eye; right: Eye; yaw: number; pitch: number; landmarkCount: number; minAperture: number };
export type Sample = { features: number[]; target: Point; group: number };
export type RegressionModel = { mean: number[]; scale: number[]; weights: number[][]; lambda: number };
export type FitDiagnostics = {
  trainingError: number;
  targetPredictions: Point[];
  predictionRange: { x: [number, number]; y: [number, number] };
  featureRanges: [number, number][];
};
export type CalibrationResult = { diagnostics: FitDiagnostics; model: RegressionModel; count: number; error: number; groupErrors: number[]; status: "ready" | "poor" };
