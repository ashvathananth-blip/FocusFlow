import { advanceFocus, completeFocus, createFocusMachine, interruptFocus, observeFocus, pauseFocus, resumeFocus, nonFocusedDurationMs, type CreditSegment, type FocusMachine, type TrackingSignal } from './state-machine';

export const GOAL_MINUTES = [15, 25, 30, 45, 60] as const;
export const DEFAULT_GOAL_MS = 25 * 60_000;
export const MAX_OBSERVATION_GAP_MS = 500;
export type FocusDiagnostic = { at: number; message: string; state: string; signal: string; nonFocusedMs: number };
export type Session = {
  diagnostics: FocusDiagnostic[];
  lifecycle: 'idle' | 'running' | 'ended' | 'completed';
  goalMs: number; startedAt: number | null; stoppedAt: number | null; now: number;
  focus: FocusMachine; lastSampleAt: number | null;
  creditedMs: number; currentStreakMs: number; longestStreakMs: number;
};
export type TimerEvent =
  | { type: 'start' | 'pause' | 'resume' | 'end' | 'interrupt' | 'tick'; at: number; reason?: string }
  | { type: 'sample'; at: number; signal: TrackingSignal; reason?: string; setup?: boolean };
export function createSession(goalMs = DEFAULT_GOAL_MS, at = 0): Session {
  if (!Number.isFinite(goalMs) || goalMs <= 0) throw new Error('Goal must be a positive finite duration');
  return { diagnostics: [], lifecycle: 'idle', goalMs, startedAt: null, stoppedAt: null, now: at,
    focus: createFocusMachine(at), lastSampleAt: null, creditedMs: 0, currentStreakMs: 0, longestStreakMs: 0 };
}
function accrue(session: Session, segments: CreditSegment[]): Session {
  const s = { ...session };
  for (const segment of segments) {
    if (!segment.credited) { if (segment.resetStreak) s.currentStreakMs = 0; continue; }
    const duration = Math.min(segment.to - segment.from, s.goalMs - s.creditedMs);
    s.creditedMs += duration; s.currentStreakMs += duration;
    s.longestStreakMs = Math.max(s.longestStreakMs, s.currentStreakMs);
    if (s.creditedMs >= s.goalMs) {
      const stoppedAt = segment.from + duration;
      return { ...s, lifecycle: 'completed', stoppedAt, focus: completeFocus({ ...s.focus, at: stoppedAt }) };
    }
  }
  return s;
}
/** Only adjacent real samples can verify a credited interval. UI ticks never mint time.
 * A >=500 ms gap drops the ENTIRE uncovered interval, with no backfill on resume.
 */
function reduceSession(session: Session, event: TimerEvent): Session {
  if (!Number.isFinite(event.at) || event.at < session.now) return session;
  if (session.lifecycle === 'completed' || session.lifecycle === 'ended') return session;
  let s = { ...session, now: event.at };
  if (event.type === 'start') {
    if (s.lifecycle !== 'idle') return s;
    return { ...s, lifecycle: 'running', startedAt: event.at, focus: createFocusMachine(event.at), lastSampleAt: null };
  }
  if (s.lifecycle !== 'running') return s;
  if (event.type === 'sample') {
    // Ignore duplicate timestamps: a cached readout is not new evidence.
    if (s.lastSampleAt !== null && event.at <= s.lastSampleAt) return session;
    if (s.lastSampleAt !== null && event.at - s.lastSampleAt < MAX_OBSERVATION_GAP_MS) {
      const advanced = advanceFocus(s.focus, event.at);
      s = accrue(s, advanced.segments);
      if (s.lifecycle === 'completed') return s;
      s.focus = advanced.machine;
    } else {
      const lostAt = s.lastSampleAt === null ? s.focus.at : s.lastSampleAt + MAX_OBSERVATION_GAP_MS;
      s.focus = interruptFocus(s.focus, lostAt, 'Inference gap: credit stopped');
      s.focus = advanceFocus(s.focus, event.at).machine; s.currentStreakMs = 0;
    }
    s.focus = observeFocus(s.focus, event.signal);
    if (s.focus.nonFocusedCounted) s.currentStreakMs = 0;
    return { ...s, lastSampleAt: event.at };
  }
  if (event.type === 'tick') {
    if (s.lastSampleAt !== null && event.at - s.lastSampleAt >= MAX_OBSERVATION_GAP_MS) {
      s.focus = interruptFocus(s.focus, s.lastSampleAt + MAX_OBSERVATION_GAP_MS, 'Inference watchdog: stale >=500 ms');
      s.lastSampleAt = null; s.currentStreakMs = 0;
    }
    if (s.lastSampleAt === null) s.focus = advanceFocus(s.focus, event.at).machine;
    return s;
  }
  if (event.type === 'pause' && s.focus.manual) return s;
  if (event.type === 'resume' && !s.focus.manual) return s;
  // Commands drop the unverified trailing fraction since the last inference.
  s.focus = interruptFocus(event.type === 'pause' ? pauseFocus(s.focus) : s.focus, event.at, event.reason ?? event.type); s.lastSampleAt = null; s.currentStreakMs = 0;
  if (event.type === 'pause') s.focus = pauseFocus(s.focus);
  if (event.type === 'resume') s.focus = resumeFocus(s.focus);
  if (event.type === 'end') { s.lifecycle = 'ended'; s.stoppedAt = event.at; s.focus = { ...s.focus, nonFocusedSince: null, episodeReason: 'Non-focused episode reset: session ended' }; }
  return s;
}
export function elapsedMs(session: Session) {
  return session.startedAt === null ? 0 : Math.max(0, (session.stoppedAt ?? session.now) - session.startedAt);
}
export function remainingMs(session: Session) { return Math.max(0, session.goalMs - session.creditedMs); }

/** Bounded in-memory transition trace, with no landmarks or persistence. */
export function updateSession(session: Session, event: TimerEvent): Session {
  const next = reduceSession(session, event);
  if (next === session) return next;
  const before = session.focus, after = next.focus;
  const messages: string[] = [];
  if (before.state !== after.state) messages.push(`State ${before.state} -> ${after.state}`);
  if (before.nonFocusedSince !== after.nonFocusedSince) messages.push(after.nonFocusedSince === null ? 'Non-focused episode ended/reset' : before.nonFocusedSince === null ? 'Non-focused episode started' : 'Non-focused start changed');
  if (before.episodeReason !== after.episodeReason) messages.push(after.episodeReason);
  if (before.signal !== after.signal) messages.push(`Input ${before.signal} -> ${after.signal}; recovery requires 300 ms stable valid classification`);
  if (after.distractionCount > before.distractionCount) messages.push('Distraction: 10-second combined non-focused episode');
  if (event.type === 'interrupt') messages.push(`Continuity interruption: ${event.reason ?? 'unspecified'}; episode preserved, credit stopped`);
  if (!messages.length) return next;
  return { ...next, diagnostics: [...next.diagnostics, { at: event.at,
    message: `${messages.join('; ')}${event.reason ? `; source: ${event.reason}` : ''}`,
    state: after.state, signal: after.signal, nonFocusedMs: nonFocusedDurationMs(after),
  }].slice(-512) };
}
