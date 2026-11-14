export type ObservedState = 'focused' | 'low' | 'unknown';
export type TimelineState = ObservedState | 'manual_pause' | 'setup' | 'unobserved';
export type Durations = Record<TimelineState, number>;
export type EpisodeClass = 'looking_away' | 'tracking_uncertain' | 'mixed';
export type Episode = {
  id: number; startMs: number; endMs: number; durationMs: number;
  lowMs: number; unknownMs: number; unobservedMs: number;
  classification: EpisodeClass; belowThreshold: boolean; counted: boolean; countedAtMs: number | null;
};
export type TimelineSegment = {
  startMs: number; endMs: number; state: TimelineState | 'mixed';
  firstState: TimelineState; lastState: TimelineState; durations: Durations;
  transitions: number; events: { episodeId: number; atMs: number }[];
};
export type CalibrationMetadata = { calibrated: boolean; quality: 'ready' | 'poor' | 'unavailable'; residualError: number | null; method: string | null };
export type SavedSession = {
  schemaVersion: 1; id: string; owner: string; revision: number;
  source: 'live-camera' | 'simulated' | 'manual-timer';
  status: 'active' | 'ended' | 'completed' | 'interrupted';
  startedAt: string; endedAt: string | null; checkpointedAt: string;
  elapsedMs: number; goalMs: number; creditedMs: number; longestStreakMs: number;
  durations: Durations; distractionCount: number;
  calibration: CalibrationMetadata; timeline: TimelineSegment[];
  episodes: Episode[]; currentEpisode: Episode | null;
};
