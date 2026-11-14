# Stage 2: unified non-focused distraction policy

The latest user request supersedes earlier separate low-focus/unknown penalties
and credited-grace rules. Production still uses the existing MediaPipe face mesh,
calibration and gaze regression. The reading-tolerance update changes only
classification/quality tolerances as documented below, not calibration fitting.

## Reading-tolerance correction

The old quality distance divided yaw/pitch by calibration standard deviations
that could be as small as 0.000001. Normal movement after a steady calibration
could therefore become an enormous outlier. A second gate rejected movement
across more than 0.25 normalized viewport distance within five predictions,
including normal center-to-edge reading. The timer already accepted both high and
medium *tracking quality* on-screen; these upstream rejections could prevent it
from receiving valid on-screen samples.

The live focus classification is now distinct from tracking quality:

- **High:** high-quality gaze within the inner calibrated target region, X/Y
  [0.1, 0.9], retained to [0.05, 0.95] through boundary hysteresis.
- **Medium:** other usable on-screen estimates, including edges, the expanded
  screen-facing region, and ordinary movement. High and medium both map to the
  session's focused state; changing between them does not reset credit/streaks.
- **Low:** reliable smoothed gaze outside the expanded screen bounds.
- **Unknown:** unavailable geometry, poor/unavailable calibration, rejected
  tracking quality, or initial five-sample smoothing warmup.

| Parameter | Before | After | Reason |
|---|---|---|---|
| Screen margin per axis | 0.02 | 0.08 | Allow modest calibrated prediction error at screen edges |
| On-screen retention hysteresis | 0.05 | 0.05 (unchanged) | Avoid boundary flicker; entry [-0.08, 1.08], retention [-0.13, 1.13] |
| Quality-distance minimum iris X/Y scales | Training SD, minimum 0.000001 | X 0.025 / Y 0.020 per eye | Avoid treating tiny calibration variation as an exact pose constraint; eye-width units |
| Quality-distance minimum yaw/pitch scales | Training SD, minimum 0.000001 | 0.10 / 0.08 radians | Permit small natural head motion relative to calibration means |
| Five-prediction spread rejection | >0.25 | >1.6 | Permit a full viewport diagonal (~1.414); ordinary movement becomes medium, not unknown |
| Tracking-quality aperture rejection | <0.10 | <0.08 | Align with usable eye geometry; smaller open-eye aperture while reading can be medium |

These are engineering tolerances, not human-validated accuracy claims. Regression
means, training scales, weights, lambda, nine targets and validation are unchanged.
Quality floors do not alter raw model predictions. Feature RMS rejection remains
>3; high quality still requires RMS <=1.5, spread <=0.08, error <=0.12 and aperture
>=0.15. Absolute feature validity guards remain yaw <=1 rad, pitch <=0.9 rad,
iris X [-0.25, 1.25], |iris Y| <=0.6, aperture [0.08, 0.65]. Missing eyes are
still unknown. Large pose deviations can still be unknown rather than falsely
asserting reliable gaze away. Low and unknown share the unchanged 10-second
non-focused threshold, so sustained genuine look-away/lost tracking still counts.

The existing five-point median and 5% hysteresis remain; a clear 0.5→1.3 gaze
change crosses the median after three new frames (about 0.2 seconds at 15 FPS).
The 300 ms reliable-return requirement is unchanged. No extra long temporal
window was introduced. High/medium changes both remain focused and do not
rearm/reset the distraction clock.

The checkout contains a mirrored live video preview but no green mesh overlay
renderer. No camera/model/preview code was removed or replaced, and an unrelated
new renderer was not added. Dark styling and layout are unchanged.

Latest changed files: `src/lib/vision/classifier.ts`,
`src/lib/vision/tracking-quality.ts`, `src/types/vision.ts`,
`src/lib/focus/tracking-input.ts` (documentation of the existing high/medium
adapter), `src/app/study/page.tsx`, `src/app/diagnostics/page.tsx`,
`src/tests/vision/vision.test.ts`, `README.md`, and `STAGE2.md`.

Manual camera verification remains necessary: calibrate normally, hold center,
left/right edges, top/bottom and corners for several seconds each; read normally
between them; make small comfortable head movements; then turn clearly away for
15 seconds. Watch focus level separately from tracking quality and review the
exact reason if unknown. High/medium should keep adding credit and streak time;
low/unknown should add none and count once after 10 seconds. Return stably for
300 ms, then repeat and confirm the second episode can count. Also test blink,
closed eyes and face loss remain unknown rather than focused. These human tests
have not been performed by the agent.

## Current behavior

The session state machine retains three attention classifications: `focused`,
`low`, and `unknown`; both live high and medium focus levels map to `focused`.
Manual pause, completion and the face-absence diagnostic remain control/diagnostic
overrides, not new attention classifications. Idle and calibration are separate
lifecycle concerns.

Low and unknown share `nonFocusedSince`, `nonFocusedCounted`, and the cumulative
`distractionCount`. An episode starts on loss of reliable focus. Switching between
low and unknown never changes its start time or counted flag. At 10 continuous
seconds, the count increases once and the current focused streak resets. Remaining
non-focused for 30 seconds or switching classifications repeatedly adds no events.
Only 300 ms of reliable on-screen focus ends/rearms the episode; isolated good
frames do not reset it. Returning before the deadline records no distraction.

Low/unknown/no-face time and return stabilization earn no focused-time credit.
Before the 10-second threshold, the current streak is held without growing; at the
threshold it resets to zero. Longest streak remains historical. Manual pause and
unverified inference gaps also clear the current streak. Elapsed time includes
pauses. Credit settles only between real samples less than 500 ms apart; missing
intervals are never backfilled. The combined non-focused clock continues across
missing-frame interruptions, independently of focused-time accounting.

No-face tracking is classified as unknown attention; the existing 2.5-second
face-absence diagnostic can override the displayed state while the shared episode
continues. Manual pause suppresses automatic events and starts fresh on explicit
resume. Completed and ended sessions freeze counts and timing. A counted episode
causes one notification attempt, subject to browser permission; the wording refers
to non-focus, not an unsupported claim that unknown tracking proves gaze away.

## UI and diagnostics

The main study metrics and its ended/completed summary show one **Distraction
Count**, with no tracking-loss or current-unknown penalty counter. Existing focus,
elapsed-time and streak metrics remain. The existing diagnostic section shows the
three-state attention, mapped input, combined episode duration/counted flag, and
transition reasons. Its bounded in-memory log also appears in the browser console.
No data is persisted. The dark palette and overall layout remain; only the CSS
selector for low-state text changed to match the new internal `low` state.

## Changed files

- `src/lib/focus/state-machine.ts`: one episode timer, one counted flag, three
  attention states, preserved control precedence and monotonic boundaries.
- `src/lib/focus/timer-engine.ts`: unified diagnostic/count fields and streak reset
  at the 10-second boundary; existing suspension-safe focused credit retained.
- `src/lib/focus/notifications.ts`: one notification delta for the unified count.
- `src/app/study/page.tsx`: one distraction metric and combined episode diagnostics.
- `src/app/globals.css`: same low-status color under the renamed state selector.
- `src/tests/focus/focus.test.ts`: obsolete separate-penalty tests replaced with
  unified policy, lifecycle, credit, streak, adapter, notification and render tests.
- `README.md`, `STAGE2.md`: current policy and verification results.

## Verification

- `npm test`: **71 passed** in 2 files (33 unchanged focus/page cases and 38 vision cases). Inputs are explicitly deterministic synthetic test
  observations, never simulated production tracking or proof of human accuracy.
- `npx tsc --noEmit`: passed.
- `npx eslint src`: passed.
- `npm run build`: attempted; sandbox denied the Turbopack CSS-worker internal
  port bind (`Operation not permitted`, OS error 1). Production build remains
  unverified here and should be run from the normal terminal.

The synthetic reading tests cover center, all four edges, corners, small pose
changes around a nonzero calibration baseline, unchanged regression weights,
continuous high/medium credit/streaks, bounded response to clear off-screen gaze,
large head-turn uncertainty, and one event for >10 seconds away. These validate
implementation behavior, not real-world webcam accuracy.

All combined-counter scenarios pass: 10 seconds low → 1; 10 seconds unknown → 1;
5 seconds low + 5 unknown → 1; reliable focus before 10 seconds → 0;
30 seconds continuously non-focused → 1; stable recovery and another 10-second
episode → 2. Additional cases cover arbitrary alternation, short good-frame
fluctuations, elapsed-time thresholds at multiple sample rates, no non-focused
credit, exact streak/goal boundaries, permission-independent notification deltas,
manual pause/completion precedence, face diagnostics, suspension, timestamp
validation and the absence of separate loss counters in the rendered page.

Manual retest: establish reliable focus, then alternate low and unknown while
watching the combined duration in diagnostics. At 10 seconds confirm one count
and one notification attempt; continue to 30 seconds and verify no repeat. Return
on-screen for 300 ms and verify the clock/count flag reset, then repeat to get the
second distraction. Check credit does not grow while non-focused and streak resets
at the threshold. Verify dark styling, camera/calibration and face diagnostics
remain working. Stage 3 has not started.
