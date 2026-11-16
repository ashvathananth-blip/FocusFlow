export const TARGET_INFERENCE_FPS = 15;
export const UI_PUBLISH_INTERVAL_MS = 200;

export function inferenceDelayMs(lastStartedAt: number | null, now: number): number {
  const interval = 1000 / TARGET_INFERENCE_FPS;
  return lastStartedAt === null ? interval : Math.max(0, interval - Math.max(0, now - lastStartedAt));
}

export function shouldPublishUiUpdate(lastPublishedAt: number | null, now: number, force = false): boolean {
  return force || lastPublishedAt === null || now - lastPublishedAt >= UI_PUBLISH_INTERVAL_MS;
}

/** Debounces hide/show transitions and prevents concurrent foreground recoveries. */
export function createVisibilityRecoveryController(
  isVisible: () => boolean,
  suspend: () => void,
  resume: () => boolean | Promise<boolean>,
) {
  let suspended = false, recovering = false, disposed = false, generation = 0;
  const update = () => {
    if (disposed) return;
    if (!isVisible()) {
      generation++;
      if (!suspended) { suspended = true; suspend(); }
      return;
    }
    if (!suspended || recovering) return;
    const attempt = generation;
    recovering = true;
    void Promise.resolve().then(resume).then(restored => {
      if (restored && attempt === generation && isVisible()) suspended = false;
    }).catch(() => undefined).finally(() => {
      recovering = false;
      if (suspended && isVisible() && attempt !== generation) update();
    });
  };
  const requestRecovery = () => {
    if (disposed) return;
    if (!suspended) { suspended = true; suspend(); }
    update();
  };
  return {
    update,
    requestRecovery,
    dispose() { disposed = true; generation++; },
    get suspended() { return suspended; },
    get recovering() { return recovering; },
  };
}

export type VideoFrameSource = {
  requestVideoFrameCallback?: (callback: (now: number, metadata: { mediaTime: number }) => void) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

export function createVideoFrameScheduler(video: VideoFrameSource, onFrame: (mediaTime?: number) => void) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let frameId: number | null = null;
  let cancelled = false;
  return {
    schedule(delayMs: number) {
      if (cancelled || timer !== null || frameId !== null) return false;
      timer = setTimeout(() => {
        timer = null;
        if (cancelled) return;
        if (video.requestVideoFrameCallback && video.cancelVideoFrameCallback) {
          frameId = video.requestVideoFrameCallback((_now, metadata) => {
            frameId = null;
            if (!cancelled) onFrame(metadata.mediaTime);
          });
        } else onFrame();
      }, Math.max(0, delayMs));
      return true;
    },
    cancel() {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      if (frameId !== null) video.cancelVideoFrameCallback?.(frameId);
      frameId = null;
    },
  };
}
