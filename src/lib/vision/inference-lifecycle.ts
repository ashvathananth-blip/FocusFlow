export type InferenceReadiness = {
  readyState: number;
  videoWidth: number;
  videoHeight: number;
  currentTime: number;
  streamActive: boolean;
  trackStates: Array<{ readyState: string; muted?: boolean }>;
};

export function inspectInferenceFrame(
  input: InferenceReadiness,
  minimumReadyState: number,
  freshAfterMediaTime: number | null,
  mediaTime = input.currentTime,
) {
  if (!input.streamActive || input.trackStates.length === 0 || input.trackStates.some(track => track.readyState !== "live" || track.muted)) {
    return { ready: false, reason: "camera stream is not producing live video" } as const;
  }
  if (input.readyState < minimumReadyState) return { ready: false, reason: "video has no current frame" } as const;
  if (input.videoWidth <= 0 || input.videoHeight <= 0 || !Number.isFinite(input.videoWidth) || !Number.isFinite(input.videoHeight)) {
    return { ready: false, reason: "video dimensions are unavailable" } as const;
  }
  if (!Number.isFinite(mediaTime) || !Number.isFinite(input.currentTime)) return { ready: false, reason: "video frame timestamp is invalid" } as const;
  if (freshAfterMediaTime !== null && mediaTime <= freshAfterMediaTime + 0.0001) {
    return { ready: false, reason: "waiting for a frame newer than the foreground recovery baseline" } as const;
  }
  return { ready: true, reason: "fresh video frame" } as const;
}

/** Limits consecutive inference retries within one recovery episode. */
export function createInferenceRetryPolicy(maxFailures = 3) {
  let failures = 0;
  return {
    failed() { failures++; return { failures, retry: failures < maxFailures, delayMs: Math.min(1000, 150 * 2 ** (failures - 1)) }; },
    succeeded() { failures = 0; },
    reset() { failures = 0; },
    get failures() { return failures; },
  };
}
