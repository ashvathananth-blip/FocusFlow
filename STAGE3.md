# Focus Flow — Stage 3 implementation and controlling addendum

This document applies the user's final Stage 3 addendum over conflicting older
SPEC.md requirements. Stage 3 adds local session analytics/history and persistence.
It does not redesign the live study screen, change MediaPipe/calibration/attention
thresholds, alter Stage 2 combined distraction counting, add recommendations, or
connect an external AI provider.

## Current completion status

Metrics, measurement recording, schema validation, checkpoint/recovery, History UI,
and regression tests are implemented. **Numeric Focus Score is still awaiting the
referenced formula and weights.** No such formula exists in SPEC.md, the earlier
repository documentation, or the supplied conversation. The configurable
`ScoreFormula` interface is in `src/lib/analytics/config.ts`; production deliberately
sets `scoreFormula: null`. Eligible records show “Score formula unavailable,” not an
invented value. Synthetic formulas in tests are test-only and are not used by the
application. This is the remaining functional input needed to complete scoring.

`npm run build` now succeeds using Webpack. The separate `build:turbopack` command
still reproduces the environment's denied CSS-worker IPC port bind. Details below.

## Implementation plan and results

1. Reuse Stage 2 events and monotonic timestamps; add an independent analytics
   ledger without changing the focus reducer's behavior — implemented.
2. Validate derived durations and record every measurable non-focused episode,
   including short episodes and interrupted open episodes — implemented.
3. Persist privacy-safe, revisioned checkpoints asynchronously in IndexedDB, with
   15-second scheduling, lifecycle flushes, and cross-tab-safe recovery — implemented.
4. Build reusable dark analytics UI at `/history` and `/history/[id]`, with visible
   navigation, charts, episode history, disclosures and error/empty states — implemented.
5. Enforce score eligibility and connect the documented numeric formula — eligibility
   and configurable interface implemented; exact formula/weights not supplied.
6. Verify persistence, routes, compaction, and Stage 2 regressions — 110 tests pass;
   production build passes. Real-browser storage/visual/performance QA remains manual.

## Measurement and scoring rules

All stored durations are milliseconds. Normalized calculations convert units as
needed:

```
eligibleTrackingSeconds = (focusedMs + lowMs + unknownMs) / 1000
focusPercentage = focusedMs / (focusedMs + lowMs + unknownMs) * 100
distractionsPerHour = distractionCount / (eligibleTrackingSeconds / 3600)
```

Eligible time excludes manual pause, calibration/setup, unobserved inference gaps,
and time before an active session. The ledger settles only intervals bounded by
adjacent real inference samples less than 500 ms apart. It uses the existing
latched attention classifications, including the reliable-return stabilization
interval. Credited time is copied independently from the Stage 2 engine; no grace
policy is changed by analytics. Camera setup before Start is never recorded as
session tracking. A minimal `calibrating` flag excludes in-session recalibration
from eligible time without changing the vision output or the Stage 2 counter.

Zero eligible time yields unavailable normalized metrics. Records below 120
eligible seconds are saved with raw statistics and “Too short to score.” Their
scores are never computed or averaged. Valid comparative sessions must pass the
strict schema/timestamp/duration checks, originate from live camera tracking, and
have at least 120 eligible seconds. Finished/interrupted valid sessions qualify;
active checkpoints do not enter historical comparisons. Simulated/manual-only
sources and corrupt records never enter scores, averages or trends.

When a formula is supplied, metrics use its configured evaluator only for valid
eligible sessions. A missing, throwing, or nonfinite formula yields unavailable
scoring. The application does not invent a fallback formula or silently clamp its
result. Configuration contains `dominanceThreshold = 0.60` and the 120-second
minimum, 10-second distraction threshold, 500-segment cap and 15-second checkpoint
cadence.

## Non-Focused Episodes

The ledger retains every measurable episode, including sub-10-second episodes.
Each stores session-relative monotonic start/end timestamps, total span duration,
measured low duration, measured unknown duration, explicitly unobserved duration,
classification, `belowThreshold`, `counted` and the counted-event timestamp.
Absolute labels are derived from session start plus those offsets. Session ISO
start/end timestamps and offsets are internally validated; write/checkpoint time
is recorded separately.

Classification uses measured low/unknown proportions, never frame counts:

- `looking_away`: low / measured non-focused duration >= 0.60.
- `tracking_uncertain`: unknown / measured non-focused duration >= 0.60.
- `mixed`: neither dominates (or no measured state exists in a gap-only span).

These labels describe observations, not intentions. Low/unknown switching preserves
the same Stage 2 episode and count flag. Only reliable focus ends/rearms it.
Sub-10-second episodes are `belowThreshold: true`, `counted: false`; they appear in
history and the mean measured episode duration. The mean uses low + unknown time
and includes all measured short episodes; unobserved-only spans cannot inflate it.

Stage 2's counter can reach its threshold while inference is unavailable. To keep
that existing counter truthful without fabricating observations, the corresponding
episode explicitly identifies unobserved spans rather than assigning them to low
or unknown measurements. Setup durations are likewise excluded from measured
attention. Episode span duration can therefore exceed the sum of measured low and
unknown durations. No unobserved time enters eligible time or state proportions.

## Checkpointing, recovery, compaction and privacy

`SessionWriter.receive()` updates only the in-memory derived ledger. It does not
serialize, open IndexedDB, or write storage in the inference callback. Checkpoint
requests run every 15 seconds and are queued in idle work; visibility/pagehide/freeze
handlers start best-effort immediate asynchronous flushes. Ending/completing a
session saves its final state, while navigation/unmount saves an interrupted state.

Checkpoints include identifiers, timestamps, schema version/status, aggregate
focus/low/unknown/manual/setup/unobserved durations, independent credited time,
current episode, all closed episodes, count and compacted timeline. Revision checks
inside IndexedDB transactions prevent a queued old checkpoint overwriting a newer
final save. Web Locks distinguish a live session in another tab from an abandoned
checkpoint. Browsers without usable Web Locks use a conservative 45-second
checkpoint lease; History refreshes periodically.

An abandoned active checkpoint is saved as `status: "interrupted"` at precisely its
stored duration. Recovery never fills time between the checkpoint and reopening.
Interrupted records remain visible and qualify for comparisons only after the
same live-source, schema and >=120-second rules as other sessions.

Timeline compaction first merges adjacent identical classifications. Beyond 500
segments it deterministically merges the shortest adjacent pair (earliest tie).
Multi-state bins are labeled `mixed`, retain exact per-state durations, first/last
states, transition counts and every counted-event timestamp. Fine-grained ordering
inside a mixed bin is lost; the UI explicitly shows it as aggregated instead of
inventing a pure state. All aggregate totals and event markers remain validated.

Minimal calibration metadata is captured at session start: readiness boolean,
ready/poor/unavailable quality, existing residual error or null, and method/version
or null. It does not claim to describe later camera/lighting changes. No frames,
images, face landmarks, feature vectors, regression weights, or calibration samples
are persisted. IndexedDB is local to this browser/origin; clearing browser data
removes history. There is no cloud sync, provider, analytics telemetry or chatbot.

## History interface and navigation

- `/history`: saved-session list, raw duration breakdown, valid-session focus trend,
  eligibility-aware summary statistics, visible interrupted/short-session badges.
- `/history/[id]`: credited versus observed focused time, focus percentage/score,
  tracking uncertainty, eligible versus wall duration, compatible Distraction Count,
  calibration context, labeled timeline and all Non-Focused Episodes.
- Reusable `StatCard`, `ChartCard`, `EmptyState`, `Badge`, and chart components use
  existing dark styles/Button with no extra dependencies or animations.
- Charts use labels and patterns as well as color; exact timeline state durations
  and event counts are available in a text table. Long episode tables paginate.
- Loading, empty, missing-session, invalid-data and local-storage error states are
  explicit. No example sessions or invented chart points are seeded.
- Live study/diagnostics screens receive only History links. Persistence integration
  is internal; camera layout, controls, theme, model and calibration remain intact.

Required text is displayed near the appropriate metrics:

> Visual-attention estimate, not a measure of concentration.

> Uses the existing Stage 2 grace-period credit rules; may differ from observed focused time.

The combined Distraction Count is retained for compatibility and explicitly
includes sustained tracking uncertainty. Unknown-state episodes are never labeled
as confirmed student distractions. Optional historical recommendations were not
implemented, and no live AI provider was added.

## Build investigation and safe resume

This workspace has no `.git` metadata, so `git status`/`git diff` cannot provide a
real baseline. No checkout/reset/clean or Git initialization was performed. A source
checkpoint was saved before resumed edits at:

`/tmp/focusflow-stage3-resume-source-checkpoint.tar.gz`

The existing Node dev server on port 3000 was inspected with `lsof` and not killed.
`ps` inspection and localhost HTTP access were denied by the execution environment.
Browser access host was unavailable; native Chrome inspection timed out. The code
is in the current workspace and History is linked from the live screen.

Turbopack's panic consistently reports CSS loader evaluation -> create process ->
bind internal port -> `Operation not permitted (os error 1)`. A temporary-copy build
proved that the app compiles, type-checks, and prerenders with Webpack instead.

Production `npm run build` now explicitly runs `next build --webpack`; default
`npm run dev` still uses Turbopack. `npm run build:turbopack` preserves the diagnostic
path and still reproduces the denied-port error here. No dependency was added.
The installed Tailwind package exposes a standard webpack loader; the Webpack
configuration appends it to Next's existing CSS/PostCSS chain, preserving built-in
CSS extraction. A top-level replacement CSS rule was rejected during the isolated
experiment because it disables Next's CSS support; it was not applied to the app.

The full production build succeeds for `/`, `/study`, `/diagnostics`, `/history`
and the dynamic `/history/[id]` route. Generated Tailwind/dark styles remain part
of the production bundle. Vendored pinned MediaPipe scripts are excluded from
ESLint and are instead checked by the existing asset SHA-256 verification.

## Files changed for Stage 3

- `src/types/analytics.ts`: privacy-safe persisted schema types.
- `src/lib/analytics/{config,episodes,metrics,recorder,schema,timeline}.ts`: configuration,
  duration ledger, eligibility/metrics, classification, validation and compaction.
- `src/lib/storage/{history-store,session-writer}.ts`: IndexedDB adapter, leases,
  checkpoint scheduling, revisions, recovery and storage-error reporting.
- `src/hooks/useHistory.ts`: asynchronous, race-safe History loading.
- `src/hooks/useStudySession.ts`: in-memory recording and lifecycle checkpoints.
- `src/hooks/useGazeTracking.ts`: calibration-progress metadata only; no vision logic change.
- `src/lib/focus/timer-engine.ts`: optional setup metadata on input events only;
  existing Stage 2 accounting/counting logic is unchanged.
- `src/components/analytics/{ui,charts,history-view,history-client}.tsx`: reusable UI.
- `src/app/history/page.tsx`, `src/app/history/[id]/page.tsx`,
  `src/app/history/loading.tsx`: public analytics routes/loading.
- `src/app/{page,study/page,diagnostics/page}.tsx`: History links only.
- `src/tests/analytics/{analytics,routes}.test.ts`: analytics/storage/UI regression tests.
- `next.config.ts`, `package.json`: verified Webpack production build alternative.
- `eslint.config.mjs`: exclude vendored MediaPipe loader assets from source lint.
- `README.md`, `STAGE3.md`: current implementation and verification report.

## Verification and remaining acceptance work

- `npm test`: **110 passed** in four files. All previous **104 tests are preserved**;
  six additional persistence/edge-case tests also pass. The 33 focus and 38 vision
  tests remain unchanged. Synthetic observations validate implementation behavior,
  never human gaze accuracy.
- `npm run build`: **passed** with Webpack, including all History routes.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed (vendored third-party scripts excluded).
- `npx next typegen`: passed.
- `npm run assets:check`: passed, all five pinned asset hashes unchanged.
- `npm run build:turbopack`: fails at the environment's denied worker port bind.

Coverage includes <120, exactly120 and >120 eligible seconds; wall/eligible separation;
zero denominators; 60% dominance boundaries; mixed/short episodes; exactly-once
Stage 2 counts; interrupted sufficient/insufficient records; queued stale writes;
checkpoint cadence/recovery; setup exclusion; unavailable calibration metadata;
privacy/schema failures; full-ledger and standalone 500-segment compaction; storage
failure isolation; route links/disclosures/loading/empty/error states.

Remaining limitations:

1. The numeric score formula/weights are missing and must be supplied before the
   real Focus Score and average score can be enabled. Tests exercise only explicitly
   synthetic injected formulas. This prevents full scoring acceptance at present.
2. Browser visual QA, actual IndexedDB/Web Locks behavior, cross-tab recovery and
   physical MediaPipe FPS during checkpointing still need a normal-browser check.
   No claim is made that these hardware/browser behaviors were measured here.
3. Sudden termination can lose observations since the last completed checkpoint;
   lifecycle writes are best effort. The application does not reconstruct that loss.
4. Mixed timeline bins preserve durations/transition counts/events, not every
   original ordering detail. Browser storage quotas and clearing data can remove
   history. Monotonic clock sleep behavior is inherited from Stage 2/browser APIs.

Manual acceptance: start a real calibrated session; save one under two eligible
minutes and one over two eligible minutes (include a manual pause and a forced
inference gap). Verify short/raw statistics and denominator exclusions. Create
short and long low/unknown/mixed episodes and inspect neutral duration-weighted
labels and exactly-once counts. Reload an active session after a checkpoint and
verify Interrupted without added recovery time. Check another live tab is not
incorrectly interrupted. Open both History routes on narrow/wide screens, inspect
labels/patterns and unavailable calibration states, and confirm navigating away
releases the camera. Supply/configure the score formula, then repeat boundary
scoring checks. Stop at Stage 3; no Stage 4 work is authorized by this implementation.
