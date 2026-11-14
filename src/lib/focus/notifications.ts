import type { FocusMachine } from './state-machine';
/** One delta, one notification attempt; permission changes never replay events. */
export function focusNotifications(before: FocusMachine, after: FocusMachine) {
  return after.distractionCount > before.distractionCount ? [{
    id: `distraction-${after.distractionCount}`, title: 'FocusFlow: distraction detected',
    body: 'You have been non-focused for 10 seconds. Return to reliable on-screen tracking to resume.',
  }] : [];
}
