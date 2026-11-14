
# FocusFlow — Product and Engineering Specification

Version: 1.0
Project: Veritas AI Hackathon
Target: Desktop Google Chrome on macOS and Windows
Stack: Next.js App Router, React, TypeScript (strict), Tailwind CSS, shadcn/ui, MediaPipe Face Landmarker, Vitest

## 1. Product Vision

FocusFlow is a privacy-first, AI-powered study timer that uses local webcam gaze tracking to estimate whether a student is visually engaged with their study screen.

The application tracks credited focused-study time rather than simply counting elapsed time.

Gaze is a proxy for visual engagement, not proof of mental concentration.

The MVP must use actual computer-vision inference, not random values, mocked tracking, or simulated AI results.

No authentication or cloud backend is required.

## 2. Development Stages

Implement the project in five stages. Do not proceed to another stage without explicit approval.

### Stage 1 — Gaze Spike and Foundation

- Inspect the repository and explain technical risks.
- Set up required dependencies and architecture.
- Implement webcam access.
- Load locally hosted MediaPipe model assets.
- Extract eye and head-pose features.
- Implement nine-point gaze calibration.
- Fit a regularized linear regression model.
- Build a live gaze diagnostic page.
- Evaluate background-browser feasibility.
- Add automated tests.

### Stage 2 — Focus State Machine and Timer

- Implement deterministic focus states.
- Implement 10-second look-away detection.
- Automatic pause and resume.
- Face-loss and uncertainty handling.
- Manual timer controls.
- One notification per confirmed distraction.
- Accurate focused-time accounting.
- Unit tests for state transitions.

### Stage 3 — Study Interface and Analytics

- Polished study interface.
- Session goal selection.
- Focus progress ring.
- Local session persistence.
- Dashboard with real analytics.
- Distraction timeline.
- Session completion summary.

### Stage 4 — Reliability and Usability

- Background behavior improvements.
- Optional Document Picture-in-Picture if viable.
- Browser recovery behavior.
- Performance optimization.
- Accessibility and responsive layouts.
- Camera calibration improvements.

### Stage 5 — Validation and Hackathon Delivery

- End-to-end verification.
- Human webcam evaluation protocol.
- Honest results template.
- Developer-only simulated-input test harness.
- Documentation and limitations.
- Demo preparation and deployment.

## 3. Architecture and Folder Structure

Use the existing Next.js project.

Recommended structure:

```text
src/
  app/
    page.tsx
    study/page.tsx
    diagnostics/page.tsx
    settings/page.tsx
  components/
    study/
    dashboard/
    calibration/
    ui/
  lib/
    vision/
      camera.ts
      landmarks.ts
      features.ts
      calibration.ts
      regression.ts
      gaze-estimator.ts
      classifier.ts
      tracking-quality.ts
    focus/
      state-machine.ts
      timer-engine.ts
    analytics/
      metrics.ts
    storage/
      sessions.ts
  hooks/
    useCamera.ts
    useGazeTracking.ts
  types/
    vision.ts
    focus.ts
    session.ts
  tests/
    vision/
    focus/
    analytics/
public/
  models/
  mediapipe/
```

Create only the folders and modules needed for the current stage.

Keep vision logic independent of React.

Use strict TypeScript and testable pure functions wherever practical.

Use npm unless explicitly instructed otherwise.

## 4. Stage 1 — Webcam and MediaPipe

### 4.1 Webcam Initialization

Camera access must begin only after an explicit user click.

Use `navigator.mediaDevices.getUserMedia`.

Handle:

- Permission denied.
- No camera available.
- Unsupported browser.
- Insecure origin.
- Camera already in use or unreadable.
- MediaPipe initialization failure.

Display the current camera status.

Stop all media tracks and release model resources when tracking ends or components unmount.

Do not request camera permission automatically on page load.

### 4.2 MediaPipe

Use MediaPipe Face Landmarker with face and iris landmark support.

Pin the MediaPipe package version and model asset version.

Self-host WASM and model files under `public/`.

Do not depend on an unpinned CDN for the final demo.

Run inference at a target rate of 10–15 FPS on the user's actual hardware.

Avoid unnecessarily blocking the UI thread.

Evaluate a Web Worker where practical, but prioritize a functioning implementation.

Use the appropriate MediaPipe video inference API.

### 4.3 Feature Extraction

Extract:

- Left iris center.
- Right iris center.
- Left and right eye corners.
- Normalized iris position relative to eye geometry.
- Head yaw.
- Head pitch.
- Landmark availability.
- Eye visibility or usable geometric quality indicators.

Normalize measurements to reduce sensitivity to camera distance and face size.

Use both eyes when reliable.

Do not substitute head direction alone for gaze direction.

Handle missing or invalid landmarks safely.

## 5. Stage 1 — Calibration and Regression

### 5.1 Nine-Point Calibration

Implement a nine-point calibration interface.

Targets:

1. Top-left.
2. Top-center.
3. Top-right.
4. Middle-left.
5. Center.
6. Middle-right.
7. Bottom-left.
8. Bottom-center.
9. Bottom-right.

For each target:

1. Display the target clearly.
2. Wait for a settling interval.
3. Collect multiple valid feature samples.
4. Reject missing or extreme outliers.
5. Associate samples with normalized screen coordinates.

Calibration targets must have known coordinates.

Do not generate arbitrary calibration results.

### 5.2 Regression Model

Fit a regularized linear regression model mapping iris and head-pose features to normalized screen coordinates.

Requirements:

- Include an intercept.
- Normalize input features using training-set statistics.
- Document the regularization parameter.
- Handle numerical instability.
- Reject invalid input.
- Predict normalized X and Y coordinates.

Use held-out target groups for validation, not random sample splits.

Because there are only nine calibration targets, use target-group holdout or leave-one-target-out validation and document the limitations.

Prevent training/validation leakage.

Report:

- Number of valid calibration samples.
- Median normalized coordinate error.
- Calibration status.
- Warnings when predictions are unreliable.

Offer recalibration when quality is poor.

If nine-point calibration performs poorly after reasonable effort, report the problem and propose a five-point or simpler-feature fallback.

Do not silently replace the algorithm.

### 5.3 Gaze Classification

Estimate normalized screen coordinates.

Classify gaze as:

- On-screen.
- Off-screen.
- Unknown.

Use:

- Configurable screen-region margin.
- Boundary hysteresis.
- Median smoothing of five valid predictions.
- Unknown classification when tracking quality is insufficient.

Do not classify uncertain observations as definite distraction.

### 5.4 Tracking Quality

Report:

- High.
- Medium.
- Low.
- Unavailable.

Base tracking quality on measurable signals:

- Landmark availability.
- Eye visibility or geometric validity.
- Calibration residuals.
- Feature distance from the calibration distribution.
- Prediction stability.

Document thresholds and assumptions.

Do not generate arbitrary confidence percentages.

### 5.5 Initial Parameters

| Parameter | Initial Value |
|---|---|
| Inference rate | 10–15 FPS |
| Smoothing | Median of 5 valid predictions |
| Screen boundary hysteresis | 5% |
| Look-away threshold | 10 seconds |
| Face-absence confirmation | 2.5 seconds |
| Unknown entry delay | 500 milliseconds |
| Return stabilization | 300 milliseconds |

These are initial engineering values, not scientifically validated universal thresholds.

Make them configurable where practical.

## 6. Stage 1 — Diagnostic Interface

Create `/diagnostics`.

Include:

- Start camera button.
- Stop camera button.
- Camera permission status.
- MediaPipe model loading status.
- Nine-point calibration workflow.
- Current gaze classification.
- Predicted normalized screen coordinate.
- Tracking quality.
- Measured inference FPS.
- Inference latency.
- Inference gaps.
- Calibration error.
- Valid calibration sample count.
- Recalibration button.
- Relevant error messages.
- Browser visibility status.
- Background feasibility experiment controls.
- Export of diagnostic measurements.

The page must use actual webcam inference.

Do not fabricate FPS, predictions, calibration quality, or tracking results.

Provide clear instructions for manual testing.

## 7. Stage 1 — Automated Tests

Use Vitest.

Test:

- Feature normalization.
- Invalid landmark handling.
- Regression fitting.
- Regularization behavior.
- Prediction accuracy on deterministic synthetic data.
- Outlier rejection.
- Validation metric calculations.

Synthetic data must be explicitly identified as synthetic.

Tests must not claim to establish real-world gaze accuracy.

Run:

```bash
npm run build
npm test
```

Add the npm test script if missing.

Report actual pass/fail results.

## 8. Background-Browser Feasibility Experiment

This experiment must be performed during Stage 1 because background usability affects the product architecture.

Target browser: desktop Google Chrome.

### 8.1 Test A — Visible FocusFlow Tab

Run webcam inference for at least 30 seconds.

Measure:

- Average inference FPS.
- Median inference interval.
- Maximum inference gap.
- Number of gaps exceeding 500 milliseconds.

### 8.2 Test B — Different Browser Tab

Keep FocusFlow running.

Switch to Google Docs, a PDF, or another browser tab.

Repeat the measurements.

### 8.3 Test C — Different Application

Switch to another desktop application while FocusFlow remains open.

Repeat the measurements.

### 8.4 Test D — Document Picture-in-Picture

Where supported, test whether a floating Document Picture-in-Picture window changes inference continuity.

Measure the same statistics.

Do not assume Picture-in-Picture prevents background throttling.

### 8.5 Diagnostic Implementation

If the coding environment cannot access a real browser and webcam, create an in-app diagnostic tool that records inference timestamps and visibility changes.

Use `document.visibilitychange` to annotate foreground/background intervals.

Record measured inference gaps using monotonic timestamps.

Allow the user to inspect or export diagnostic results.

Use an explicit experiment start/stop workflow.

Export measurements in a structured format such as JSON.

Include experiment scenario labels and timestamps.

Do not fabricate measured results.

### 8.6 Feasibility Decision

At the end of Stage 1, report whether:

- Visible-tab inference meets the 10 FPS target.
- Background-tab inference remains reliable.
- Switching applications causes significant gaps.
- Document Picture-in-Picture is viable.
- A visible-tab-only fallback is required.

If inference is suspended, the future timer must not count unverified time.

## 9. Stage 2 — Timer Behavior

Do not implement during Stage 1.

The timer counts credited focused-study time.

Default session goal: 25 minutes.

Other goals: 15, 30, 45, 60 minutes and custom duration.

### 9.1 Grace-Period Policy

- Looking away for fewer than 10 continuous seconds remains credited.
- At 10 seconds, the timer pauses.
- The first 10 seconds remain credited.
- Returning gaze resumes the timer after 300 milliseconds of stable valid tracking.
- One distraction event is recorded per confirmed look-away episode.
- One notification is displayed per event.

The dashboard must disclose:

"Includes up to 10 seconds of credited grace time per look-away event."

This policy is intentional and must not be silently changed.

### 9.2 Face Loss

Distinguish temporary landmark loss from confirmed face absence.

- Temporary dropout is provisional.
- Low-quality tracking lasting 500 milliseconds enters unknown.
- Face absence is confirmed after 2.5 seconds without a valid face.
- Unknown time must not be credited after the uncertainty threshold.
- Resume only after stable valid tracking returns.

### 9.3 State Precedence

Use this precedence:

1. Completed.
2. Manual pause.
3. Face absent.
4. Unknown.
5. Distracted.
6. Looking away.
7. Focused.

Idle and calibration are separate lifecycle states.

Manual pause must override automatic resume.

Do not carry stale look-away duration across interrupted tracking episodes.

Use monotonic timestamps for timer accounting.

## 10. Stage 3 — User Interface and Dashboard

Do not implement during Stage 1.

Use a polished dark design.

Colors:

- Background: `#0B1020`
- Surface: `#141B2D`
- Accent: `#818CF8`
- Focused: `#22C55E`
- Looking away: `#F59E0B`
- Distracted: `#EF4444`

Use Geist or Inter.

### 10.1 Study Page

Include:

- Large circular timer.
- Session goal selector.
- Start, pause, resume, and end buttons.
- Live focus status.
- Camera status.
- Calibration access.
- Distraction count.
- Current focus streak.
- Longest focus streak.

### 10.2 Dashboard

Use `/` as the dashboard.

Show:

- Total credited focused time.
- Completed sessions.
- Average focus rate.
- Distraction count.
- Longest focus streak.
- Focus duration chart.
- Recent sessions.
- Session timeline.

Use real data and meaningful empty states.

### 10.3 Session Metrics

Focused time: Time credited under the timer policy.

Elapsed time: Wall-clock duration between session start and end.

Focus rate: Credited focused time divided by elapsed time, multiplied by 100.

Do not describe focus rate as a direct measurement of mental attention.

## 11. Stage 3 — Persistence

Use localStorage or IndexedDB.

Store:

- Session ID.
- Start and end timestamps.
- Goal duration.
- Credited focused duration.
- Elapsed duration.
- Distraction count.
- Longest focus streak.
- Focus-state events.
- Completion status.

Never store webcam footage or raw facial landmark histories.

Do not implement persistence during Stage 1.

## 12. Stage 4 — Reliability

Improve:

- Background-tab behavior.
- Inference performance.
- Calibration robustness.
- Tracking-quality transitions.
- Responsive design.
- Accessibility.
- Error recovery.

Implement Document Picture-in-Picture only if Stage 1 measurements justify it.

If the browser suspends tracking, show an appropriate warning and pause unverified time.

## 13. Stage 5 — Validation and Demo

Prepare:

- Automated test report.
- Real webcam evaluation procedure.
- Blank human evaluation results template.
- Known limitations.
- Browser compatibility notes.
- Three-minute demonstration script.
- AI and third-party model attribution.

Create a developer-only deterministic gaze-input replay harness.

Label it:

"Test Mode — Simulated Tracking Input."

Never present simulated input as live computer vision.

## 14. Privacy and Security

- Process webcam frames locally.
- Never upload camera footage.
- Never record video.
- Never persist raw biometric landmarks.
- Request camera permission explicitly.
- Show when the camera is active.
- Release camera resources when finished.
- Store only derived session statistics.
- Provide a manual timer fallback if webcam tracking is unavailable.

No account is required for the MVP.

## 15. Future Work

Do not implement during the five-stage MVP unless explicitly approved:

- Paper-study mode with uncertain-activity check-ins.
- Optional break recommendations based on continuous focus duration.
- User accounts.
- Supabase authentication.
- Cloud-synced study history.
- Multi-device analytics.
- Personalized recommendations.

## 16. Implementation Constraints

- Do one stage at a time.
- Inspect existing code before editing.
- Provide a short plan and risks before substantial changes.
- Keep vision logic independent of React.
- Use strict TypeScript.
- Prefer complete functionality over broad scaffolding.
- Do not fake AI inference.
- Do not invent evaluation results.
- Run tests and build checks.
- Report what was verified versus what needs human webcam testing.
- Do not modify EchoTrace or files outside FocusFlow.
- Do not proceed to another stage without approval.

### Feature Cut Order

If time is limited, cut:

1. Document Picture-in-Picture implementation.
2. Playwright tests.
3. Dedicated history page.
4. Advanced charts and animations.
5. Optional breaks.
6. Secondary UI customization.

Never cut real gaze inference, calibration, timer correctness, privacy, or core unit tests.

---

# Addendum — Engineering Clarifications

This Addendum is part of the specification and must be read before implementation.

## A1. Stage 1 Is an Engineering Spike

Stage 1 is successful only if real MediaPipe inference, calibration, and a live readout exist.

Do not build the study timer, dashboard, session persistence, or visual polish during Stage 1.

## A2. No Unverified FPS Claims

Target 10 or more measured inference FPS on the user's hardware in a visible Chrome tab.

The agent must not claim this is verified without actual hardware measurements.

If browser access is unavailable, provide a diagnostic interface and manual instructions.

## A3. Unknown Tracking Versus Face Absence

A temporary missing face detection does not prove the student left.

After 500 milliseconds of low-quality or unavailable tracking, the future timer stops crediting time.

After 2.5 seconds without a valid face, label the state face absent.

These thresholds serve different purposes.

## A4. Calibration Model Limitations

A fitted regression model is a personalized gaze mapping, not a universally accurate eye tracker.

Nine-point calibration may perform poorly due to lighting, glasses, camera angle, or small iris movements.

Report calibration quality honestly.

Use a five-point or simpler-feature fallback only after explaining the tradeoff.

## A5. Background Inference Is a Critical Feasibility Risk

Document Picture-in-Picture is not guaranteed to keep webcam inference active.

Measure background behavior early.

Do not claim reliable cross-tab tracking without evidence.

## A6. Timer Priority

Completed overrides all states.

Manual pause overrides automatic tracking transitions.

Face absence overrides unknown.

Unknown overrides gaze-derived distraction and focused states.

Do not allow automatic resume while manual pause is active.

## A7. Grace-Period Accounting

The first 10 seconds of a confirmed distraction remain credited under the selected policy.

Repeated glances shorter than 10 seconds may increase the reported focus rate.

Disclose the policy beside focus-rate statistics.

## A8. Honest Evaluation

Automated synthetic tests validate implementation logic, not real-world accuracy.

The human developer must conduct actual webcam testing.

Provide a reproducible protocol and blank results template rather than fabricated participant results.

## A9. Package Manager

The project was initialized with npm.

Use `npm run build` and `npm test` unless the repository has intentionally migrated to another package manager.

## A10. Stage Completion

At the end of each stage, report:

- Files changed.
- Features implemented.
- Tests run.
- Build status.
- Known problems.
- What the human developer must verify.
- Whether the stage's acceptance criteria are satisfied.

Stop and await approval before starting the next stage.
