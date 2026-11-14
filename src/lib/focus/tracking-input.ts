import type { GazeClass, Quality } from '@/types/vision';
import type { TrackingSignal } from './state-machine';
/** Both high- and medium-quality on-screen readings are focused. Tracking
 * quality=low is uncertainty, never evidence of gaze away. */
export function trackingSignal(input: { classification: GazeClass; quality: Quality; faceDetected: boolean | null }): TrackingSignal {
  if (input.faceDetected === false) return 'no-face';
  if (input.faceDetected !== true || input.quality === 'low' || input.quality === 'unavailable' || input.classification === 'unknown') return 'invalid';
  return input.classification;
}

export type ClockSnapshot = { monotonic: number; wall: number };
/** Wall clock is only a safety veto, never a source of credited duration.
 * Detect sleep/clock changes even when the browser's monotonic clock pauses.
 */
export function clockDiscontinuity(previous: ClockSnapshot | null, current: ClockSnapshot): boolean {
  return previous !== null && Math.abs((current.wall - previous.wall) - (current.monotonic - previous.monotonic)) >= 500;
}
