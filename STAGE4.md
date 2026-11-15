# Stage 4 progress

## Implemented

**Group 1 — tokens and shared UI.** Semantic dark tokens (`#090D12` / `#141B23` / `#1B2630`, teal `#40E0C0`, amber, soft red, muted blue-gray), neon borders and a single subtle glow token, larger type scale for descriptions and notes, bulleted explanation lists, icon set, labeled status badges, `PageHeader`, `AppShell`, desktop sidebar, keyboard-accessible responsive navigation, skip link, and a desktop-Chrome tracking disclosure on small screens.

**Group 2 — Focus Session presentation.** Large countdown, responsive timer/camera panels, camera-off placeholder with the landmark illustration, tracking setup checklist, labeled live status with a status key, statistic cards, 2×2 control grid on small screens, unchanged session handlers and enablement rules, existing calibration invocation, mirrored aspect-video preview, expanded accounting explanation, required credited-time disclosure, and retained diagnostics.

**Group 3 — Dashboard and onboarding.** Welcome header with a single primary CTA, hero card with original line illustration, today's credited focus time, total sessions, average focus score, eligible focus percentage, recent non-focused episodes, recent sessions, and the three-step "How Focus Flow Works" section with original SVG diagrams and the counting rules.

**Group 4 — History and analytics.** Restyled `/history` and `/history/[id]`: statistic cards, focus trend with axes and teal area fill, attention breakdown, attention timeline with patterns and event markers, focus score meter, rule-based insights, non-focused episode table, tracking-uncertainty context, empty state illustration, and both required disclosures.

**Group 5 — Settings and calibration.** Two-column settings cards with icons and status rows: calibration status/recalibration link, privacy, local storage, clear history with confirmation dialog, and application details. Calibration overlay restyled with progress dots, lighting/camera tips, and unchanged targets and sample rules.

## Files changed

- `src/app/globals.css`
- `src/app/layout.tsx`
- `src/app/page.tsx`
- `src/app/settings/page.tsx`
- `src/app/study/page.tsx`
- `src/components/analytics/charts.tsx`
- `src/components/analytics/history-view.tsx`
- `src/components/analytics/ui.tsx`
- `src/components/calibration/calibration-overlay.tsx`
- `src/components/layout/app-shell.tsx`
- `src/components/layout/page-header.tsx`
- `src/components/dashboard/dashboard.tsx`
- `src/components/settings/settings-panel.tsx`
- `src/components/ui/button.tsx`
- `src/components/ui/icon.tsx`
- `src/components/ui/illustrations.tsx`
- `src/components/ui/status-badge.tsx`
- `src/lib/storage/history-store.ts` (added `clearHistory`; IndexedDB schema unchanged)
- `src/tests/ui/presentation.test.ts`

## Verification

- `npm test`: 119 tests passed (existing Stage 1–3 suites unchanged; 9 presentation tests added).
- `npx tsc --noEmit`, `npm run lint`, `npm run build` (Webpack, Cache Components), and `npm run assets:check` all pass.
- Visual check in a Chromium preview at 1440×1000 and 390×844 on `/`, `/study`, `/history`, `/history/[id]` and `/settings`, using schema-valid local sessions seeded into IndexedDB and then removed. Navigation, hierarchy, card alignment, neon subtlety, mobile single-column layouts, and the tracking disclosure were inspected. No desktop/mobile layout defects remained.

## Not verified / known limits

- Camera-dependent states (live preview, green tracking, calibration overlay, running session) could not be exercised in the automated browser. The overlay's markup, target coordinates and accessibility are covered by tests; its appearance was not visually inspected.
- The repository has no live landmark-mesh renderer over the webcam video. The Focus Session screen shows the actual video plus a static landmark illustration in the camera-off state; no mesh drawing was fabricated and the tracking hook was not modified.
- The Focus Score formula is still unconfigured, so score surfaces correctly report it as unavailable.
