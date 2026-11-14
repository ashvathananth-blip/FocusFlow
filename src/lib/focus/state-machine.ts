/** Attention classification remains distinct from session/control overrides. */
export const FOCUS_TIMING = { nonFocusedMs: 10_000, faceAbsentMs: 2_500, resumeMs: 300 } as const;
export type AttentionState = 'focused' | 'low' | 'unknown';
export type FocusState = AttentionState | 'face_absent' | 'manual_pause' | 'completed';
export type TrackingSignal = 'on-screen' | 'off-screen' | 'invalid' | 'no-face';
export type FocusMachine = {
  at: number; state: FocusState; attention: AttentionState; signal: TrackingSignal;
  onSince: number | null; absentSince: number | null;
  nonFocusedSince: number | null; nonFocusedCounted: boolean; distractionCount: number;
  manual: boolean; completed: boolean; episodeReason: string;
};
export type CreditSegment = { from: number; to: number; credited: boolean; resetStreak: boolean };
export function createFocusMachine(at: number): FocusMachine {
  if (!Number.isFinite(at) || at < 0) throw new Error('Invalid monotonic time');
  return { at, state: 'unknown', attention: 'unknown', signal: 'invalid', onSince: null, absentSince: null,
    nonFocusedSince: at, nonFocusedCounted: false, distractionCount: 0, manual: false, completed: false,
    episodeReason: 'Non-focused episode started: awaiting reliable focus' };
}
function resolve(input: FocusMachine): FocusMachine {
  let m = { ...input };
  if (m.completed) return { ...m, state: 'completed' };
  if (m.manual) return { ...m, state: 'manual_pause' };
  if (m.onSince !== null && m.at - m.onSince >= FOCUS_TIMING.resumeMs) return {
    ...m, state: 'focused', attention: 'focused', nonFocusedSince: null, nonFocusedCounted: false,
    episodeReason: 'Non-focused episode reset: stable reliable focus (300 ms)',
  };
  if (m.nonFocusedSince !== null && m.at - m.nonFocusedSince >= FOCUS_TIMING.nonFocusedMs && !m.nonFocusedCounted) {
    m = { ...m, nonFocusedCounted: true, distractionCount: m.distractionCount + 1,
      episodeReason: 'Distraction counted: 10 continuous non-focused seconds (low and/or unknown)' };
  }
  if (m.absentSince !== null && m.at - m.absentSince >= FOCUS_TIMING.faceAbsentMs) return { ...m, state: 'face_absent' };
  // Keep the absence override during return stabilization; attention is still unknown.
  return { ...m, state: m.state === 'face_absent' && m.signal === 'on-screen' ? 'face_absent' : m.attention };
}
export function creditsFocus(m: FocusMachine) {
  return m.state === 'focused' && m.signal === 'on-screen' && m.onSince !== null && m.at - m.onSince >= FOCUS_TIMING.resumeMs;
}
export function advanceFocus(machine: FocusMachine, at: number): { machine: FocusMachine; segments: CreditSegment[] } {
  if (!Number.isFinite(at) || at < machine.at) throw new Error('Time must be monotonic');
  let m = { ...machine };
  const boundaries = [
    m.nonFocusedSince === null ? null : m.nonFocusedSince + FOCUS_TIMING.nonFocusedMs,
    m.onSince === null ? null : m.onSince + FOCUS_TIMING.resumeMs,
    m.absentSince === null ? null : m.absentSince + FOCUS_TIMING.faceAbsentMs,
    at,
  ].filter((t): t is number => t !== null && t > m.at && t <= at).sort((a,b) => a-b);
  const segments: CreditSegment[] = [];
  for (const end of [...new Set(boundaries)]) {
    segments.push({ from: m.at, to: end, credited: creditsFocus(m), resetStreak: m.nonFocusedCounted || m.manual });
    m = resolve({ ...m, at: end });
  }
  return { machine: resolve(m), segments };
}
export function observeFocus(machine: FocusMachine, signal: TrackingSignal): FocusMachine {
  const m = { ...machine, signal };
  m.absentSince = signal === 'no-face' ? (m.absentSince ?? m.at) : null;
  if (signal === 'on-screen') m.onSince ??= m.at;
  else {
    m.onSince = null;
    m.attention = signal === 'off-screen' ? 'low' : 'unknown';
    if (!m.manual && m.nonFocusedSince === null) {
      m.nonFocusedSince = m.at;
      m.episodeReason = `Non-focused episode started: ${m.attention}`;
    }
  }
  return resolve(m);
}
/** Interrupt credit continuity, preserving one combined episode across missing frames. */
export function interruptFocus(machine: FocusMachine, at: number, reason = 'Tracking continuity lost'): FocusMachine {
  if (!Number.isFinite(at) || at < machine.at) throw new Error('Time must be monotonic');
  return resolve({ ...machine, at, state: 'unknown', attention: 'unknown', signal: 'invalid', onSince: null, absentSince: null,
    nonFocusedSince: machine.manual ? null : (machine.nonFocusedSince ?? at),
    episodeReason: `${reason}; non-focused episode preserved/started; no gap credit` });
}
export function pauseFocus(machine: FocusMachine): FocusMachine {
  // Manual control suspends the episode clock; it must not generate automatic events.
  return resolve({ ...machine, manual: true, onSince: null, nonFocusedSince: null, nonFocusedCounted: false,
    episodeReason: 'Non-focused episode reset: manual pause' });
}
export function resumeFocus(machine: FocusMachine): FocusMachine {
  return interruptFocus({ ...machine, manual: false }, machine.at, 'Manual resume: awaiting reliable focus');
}
export function completeFocus(machine: FocusMachine): FocusMachine {
  return resolve({ ...machine, completed: true, nonFocusedSince: null, episodeReason: 'Non-focused episode reset: completed' });
}
export function nonFocusedDurationMs(machine: FocusMachine) {
  return machine.nonFocusedSince === null ? 0 : Math.max(0, machine.at - machine.nonFocusedSince);
}
