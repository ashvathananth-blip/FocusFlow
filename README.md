# FocusFlow — Local gaze tracking and session history

Read `SPEC.md` and its Addendum. Stage 1/2 tracking and the Stage 3 local analytics,
persistence and History UI are implemented. See [Stage 3 report](STAGE3.md) for
current requirements, changed files, test results and remaining acceptance work.
History is available at `/history` and `/history/[id]`, linked visibly from Study.
Only derived session statistics and minimal calibration metadata are saved locally;
no camera frames, face landmarks or calibration models are persisted. No cloud
backend, external AI provider or historical recommendations were added.

Current policy: both high and medium reliable on-screen focus earn focused time.
Screen-wide reading and normal head motion use calibrated tolerances documented
in `STAGE2.md`; tracking quality is separate from gaze focus level. Low and
unknown share one continuous non-focused timer and one Distraction Count. After
10 seconds, record exactly one distraction and reset the streak; switching between
low and unknown does not reset the timer. Reliable focus for 300 ms rearms it.
This user-requested policy supersedes earlier separate penalties and credited-grace
behavior in SPEC.md. See `STAGE2.md` for the complete current rules and tests.

## Current verification status

- `npm test`: **110 passed**, including all previous 104 tests.
- `npm run build`: **passed** using the verified Webpack production path.
- TypeScript, full source lint, route type generation and vision asset hashes: passed.
- `npm run build:turbopack`: retains the diagnostic path; this environment denies
  its internal CSS-worker port bind. Development still uses the existing Turbopack setup.
- Numeric Focus Score awaits the referenced formula/weights, which were not present
  in the repository or supplied instructions. Eligible records show an explicit
  unavailable score; short records show “Too short to score.” No formula was invented.
- Real-browser visual/storage/cross-tab/FPS QA remains to be performed. Details and
  manual acceptance steps are in [STAGE3.md](STAGE3.md).

## Stage 1 gaze-status blocker investigation

The former **Browser: visible / focused** readout comes exclusively from
`document.visibilityState` and `document.hasFocus()`. It measures the tab/window,
not face visibility, gaze, or mental attention. Looking away should leave that
readout unchanged. The UI now explicitly names these browser signals and labels
MediaPipe face detection and gaze classification separately.

The actual pipeline is MediaPipe → six eye/pose features → calibrated ridge
prediction → quality gate → five-valid-prediction median → screen bounds → gaze
readout. The UI uses that classifier result directly; there is no hardcoded
focused gaze state. Inference gaps over 500 ms reset gaze to unknown when
execution resumes. The live readout now includes the last inference timestamp
and an explicit stale-inference reason.

Regression outputs are **not clamped**. On-screen retention bounds are
[-0.13, 1.13] on both axes; re-entry bounds are [-0.08, 1.08], inclusive.
Tests show all four off-screen directions are reachable through the complete
estimator on deterministic synthetic inputs. Reading-tolerance thresholds are documented in `STAGE2.md`.

Quality can suppress a look-away prediction: feature RMS >3, prediction spread
>1.6, or aperture <0.08 clears smoothing and returns **unknown**, never on-screen.
Large movements can temporarily trigger spread rejection; a stable gaze can
recover, unless another quality gate continues rejecting it. Feature distance
can remain high outside the calibration distribution. We preserve this
uncertainty policy rather than assert that unreliable extrapolation is distraction.

The debug readout exposes raw unclamped and smoothed coordinates, active bounds,
previous classification, smoothing count, live features, quality rejection reasons,
and the classification reason. Calibration fit diagnostics expose training error,
held-out error, fitted medians for all nine targets, prediction ranges, and feature
ranges. A fit that remains near center or has a large training/validation gap is
now inspectable; neither collapse nor overfitting has been established on the
user's real calibration data.

Live retest (no simulated input):

1. Start camera and recalibrate at `/diagnostics`. Confirm gaze becomes on-screen
   independently of browser visibility/focus.
2. Hold center, each edge, then beyond each edge for two seconds each. Observe
   live features, raw predictions, smoothed predictions, classification and reason.
3. If features move but raw predictions stay centered, expand regression fit
   diagnostics. Compare target medians, prediction spans, and training versus
   held-out errors. If features barely move, investigate landmark sensitivity,
   lighting/glare and calibration sampling before changing regression parameters.
4. If raw predictions cross bounds but classification is unknown, inspect the
   exact quality gate and smoothing count. If the median remains within retention
   bounds, the classifier is following the current boundary policy.
5. Cover your eyes or leave frame: face detection and usable eye tracking are
   separate; gaze must become unknown. Stop camera or interrupt inference: stale
   on-screen status must clear. Switching tabs changes browser status separately.

These checks require real webcam observations. No real gaze samples or accuracy
results were fabricated, and no Stage 2 behavior was added.

## Install and run (network-enabled terminal)

Use Node 20.9+ and npm:

```sh
npm install
npm run assets:prepare
npm run assets:check
npm test
npm run build
npm start
```

Open http://localhost:3000/diagnostics in desktop Chrome. `npm run dev` also works
for development; use the production server for reported performance measurements.

Asset setup copies the pinned package's four WASM/loader files and downloads the
fixed `face_landmarker/float16/1` model into `public/`. It generates
`public/vision-assets.json` with byte counts and SHA-256 hashes. Later downloads
must match the existing manifest. Commit those files and the updated npm lockfile
before a demo. All runtime asset URLs are same-origin; no CDN is used at runtime.

MediaPipe is pinned to `0.10.22-rc.20250304`; the model is float16 version 1.
The page uses Face Landmarker `VIDEO` mode and `detectForVideo`, with iris support
and facial transformation matrices. Model initialization errors are displayed.

## Webcam and calibration protocol

1. Load diagnostics. Confirm there is no camera request before clicking Start.
2. Click **Start camera**. Test denial first; allow the camera in Chrome site
   settings and retry. Check camera status and the live mirrored preview.
3. Confirm the model reports ready. Ensure both eyes are visible, reduce glare,
   keep lighting even, and keep the browser window and your posture steady.
4. Click **Calibrate nine points**. Look at each dot, without following the text.
   Each target settles for 800 ms, then collects 24 geometrically valid samples.
   Missing samples do not advance collection; a target times out after 12 seconds.
5. Review valid sample count, overall held-out median error, and the nine target
   errors. Error is Euclidean distance in normalized viewport coordinates (a
   0.1 horizontal error means 10% of viewport width).
6. Test center, four screen edges, then look beyond each edge, blink, cover an eye,
   move your head, and leave frame. Uncertain tracking must become unknown.
   Test known targets independently after calibration; held-out calibration error
   alone does not establish real-world accuracy or off-screen sensitivity.
7. Stop the camera; confirm Chrome's camera-use indicator ends. Start again and
   navigate away; confirm tracks are released on unmount. Also try unplugging
   the camera, using it in another app, and an insecure non-localhost origin.
8. Resize the viewport; calibration must be invalidated. Recalibrate after moving
   the camera or changing posture. Stop/restart or reload clears the model.

If validation is poor, the app offers recalibration and suppresses definite gaze
classification. Retry with improved lighting and steady posture. If two or three
careful attempts still have median error >0.20 or any target median >0.35, stop
and review a fallback rather than proceeding. A five-point layout reduces burden
but supplies less spatial evidence. A simpler mapping using averaged binocular
iris X/Y plus yaw/pitch may reduce collinearity but loses eye-specific information.
Neither fallback is implemented or selected silently.

## Background feasibility experiment (SPEC section 8)

No actual rates are available yet. Run all four scenarios on your own Chrome and
hardware. Keep the power source and Chrome settings consistent; note Chrome
version, OS, camera, and battery/energy-saving settings alongside the export.

1. Start the camera and wait for model readiness. Finish calibration separately;
   do not calibrate while recording an experiment.
2. Select **A-visible-tab**, click **Start experiment**, keep diagnostics visible
   for at least 30 seconds, then click **Stop experiment**.
3. Select **B-other-tab**, start, switch immediately to Docs/PDF/another Chrome
   tab, remain there for at least 30 seconds, return, and stop.
4. Select **C-other-app**, start, switch immediately to another desktop application,
   remain there for at least 30 seconds, return, and stop. Note whether the Chrome
   window was visible or covered. Visibility and window focus are logged separately.
5. For **D-document-pip**, click **Open experimental Document PiP**. If unsupported,
   record that result. Otherwise return focus to diagnostics, select D and start,
   switch to another tab/app with PiP visible for at least 30 seconds, then return
   and stop. This probe leaves inference in the source document; it measures this
   arrangement only and does not prove that moving inference to PiP would behave
   the same way. Close PiP after testing.
6. Click **Export completed runs (JSON)**. Inspect each run's summary and its
   visibility/focus events. Repeat each scenario if you need reproducibility.
   The full run includes switching overhead; events identify condition boundaries.

The export records monotonic completion timestamps, per-call inference latency,
scenario labels, ISO start times, performance time origin, visibility/focus changes,
and camera-stop interruptions. It does not contain frames, landmarks, features,
or the calibration model. Runs shorter than 30 seconds are flagged. Inference-free
edges contribute to maximum gap and gaps >500 ms, including zero-inference runs.
FPS is completed inference count divided by full run duration. Inference latency
covers the synchronous `detectForVideo` call, excluding camera capture latency.

Blank results template (fill from actual exports):

| Scenario | Duration s | FPS | Median interval ms | Max gap ms | Gaps >500ms | Median latency ms | Notes |
|---|---|---|---|---|---|---|---|
| A visible tab | | | | | | | |
| B other tab | | | | | | | |
| C other app | | | | | | | |
| D Document PiP | | | | | | | |

Acceptance: visible-tab inference must reach >=10 measured FPS. Background
reliability, application-switch gaps, and PiP viability remain undecided until
these measurements exist. Treat repeated >500 ms gaps as a reliability failure
for future time crediting. If background inference suspends, a visible-tab-only
fallback may be necessary; future timer code must not credit unverified time.

## Engineering thresholds and limitations

- Six features: both iris centers projected onto eye-relative axes (camera aspect
  corrected, divided by eye width), plus head yaw/pitch from the pose matrix.
  Both eyes are required. Missing/nonfinite iris, corners, eyelids or pose reject
  an observation. Aperture/width must be 0.08–0.65; yaw <=1 rad, pitch <=0.9 rad.
- Calibration uses targets at viewport X/Y = 0.1, 0.5, 0.9. Per-target outlier
  rejection uses coordinate-wise median and 3.5 robust standard deviations
  (1.4826*MAD, floor 0.015). At least 16 samples must survive per target.
- Ridge regression has lambda=0.1 and an unpenalized intercept. Training means and
  population standard deviations normalize each input; scale floor 1e-6 handles
  constants. Pivoted solving rejects numerical failure. Every validation fold
  holds out one whole target; its normalization is fit on the other eight only.
  Final fitting uses all accepted samples after validation. Nine target groups
  are limited evidence, especially for extrapolation beyond screen boundaries.
- Poor calibration: median held-out error >0.20 or any group's median >0.35.
  Calibration and samples remain in memory, never localStorage or IndexedDB.
- Quality unavailable: invalid/missing geometry. Low: missing/poor calibration,
  quality-scaled feature RMS >3 (physical scale floors are documented in `STAGE2.md`), max distance from first of five recent predictions
  >1.6, or aperture <0.08. High requires residual <=0.12, feature RMS <=1.5,
  spread <=0.08, and aperture >=0.15. Other usable tracking is medium.
  These thresholds are initial engineering choices, not calibrated confidence.
- Low/unavailable means unknown immediately and clears the median window.
  Classification needs five valid predictions; screen margin is 0.08 and
  on-screen exit hysteresis adds 0.05. Coordinates are not clipped to the screen.
  Stale inference >500 ms resets classification when execution resumes. This is
  not the Stage 2 face-absence or timer state machine.
- Synchronous CPU inference is capped at 15 Hz, skipping unchanged video frames.
  Requested camera size is 640x480. Main-thread blocking is a known risk. A worker
  would require frame-transfer/lifecycle testing and latency evidence; no worker
  performance claim is made. Actual >=10 FPS remains unverified.

## Files

- `src/lib/vision/`: camera lifecycle, model loading, geometry, calibration,
  regression, gaze estimator, quality, classifier, and experiment statistics.
- `src/types/vision.ts`: shared types; vision modules do not import React.
- `src/hooks/useGazeTracking.ts`: browser/React orchestration and cleanup.
- `src/components/calibration/`, `src/components/ui/button.tsx`, `src/lib/utils.ts`,
  `components.json`: calibration UI and minimal shadcn/ui foundation.
- `src/app/diagnostics/page.tsx`: live readout and experimental PiP probe.
- `src/app/page.tsx`, `layout.tsx`, `globals.css`: minimal Stage 1 entry and styles.
- `src/tests/vision/vision.test.ts`, `vitest.config.ts`: 38 explicitly synthetic vision
  Vitest cases; the focus suite separately tests the combined timer policy. They cannot establish real-world gaze accuracy.
- `scripts/prepare-vision-assets.mjs`, `public/models/README.md`,
  `public/mediapipe/README.md`: reproducible asset setup and missing-asset disclosure.
- `package.json`: pinned new dependencies and test/asset scripts.

Implementation references: [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js)
and [shadcn/ui manual setup](https://ui.shadcn.com/docs/installation/manual).

Stage 1 is accepted per the user. Stage 2 is implemented; see `STAGE2.md` for
remaining build/manual verification. Stage 3 history/analytics/persistence are implemented; see `STAGE3.md` for the missing score-formula input and remaining manual acceptance checks.
