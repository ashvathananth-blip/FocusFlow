export type ScoreFormula = {
  version: string; description: string;
  // Explicit caller-supplied formula; no provider or inferred default.
  evaluate: (input: { focusPercentage: number; distractionsPerHour: number; unknownPercentage: number }) => number;
};
export const ANALYTICS_CONFIG = {
  minEligibleMs: 120_000,
  dominanceThreshold: 0.60,
  distractionThresholdMs: 10_000,
  maxTimelineSegments: 500,
  checkpointMs: 15_000,
  scoreFormula: null as ScoreFormula | null,
} as const;
