'use client';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { StatusBadge, type StatusKind } from '@/components/ui/status-badge';
import { Icon } from '@/components/ui/icon';
import { CREDIT_DISCLOSURE } from '@/components/analytics/ui';
import { Button } from '@/components/ui/button';
import { CalibrationOverlay } from '@/components/calibration/calibration-overlay';
import { LandmarkMesh } from '@/components/ui/illustrations';
import { ShieldRailPanel } from '@/components/settings/website-blocker-status';
import { useStudySession } from '@/hooks/useStudySession';
import { nonFocusedDurationMs } from '@/lib/focus/state-machine';
import { elapsedMs, GOAL_MINUTES, remainingMs } from '@/lib/focus/timer-engine';

function clock(ms: number, countdown = false) {
  const seconds = countdown ? Math.ceil(ms / 1000) : Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
function feedbackFor(state: string, lifecycle: string) {
  switch (state) {
    case 'focused': return 'Gaze is on the screen. Focused time is being credited.';
    case 'low': return 'Gaze is away from the screen. Ten seconds of non-focused time records one distraction.';
    case 'unknown': return 'Tracking is uncertain — check lighting and camera angle. This is not counted as looking away.';
    case 'face_absent': return 'No face detected. Focused time pauses until your face is visible again.';
    case 'manual_pause': return 'Paused manually. Website blocking stays active while paused.';
    case 'completed': return 'Session complete and saved to local history.';
    case 'ended': return 'Session ended and saved to local history.';
    default: return lifecycle === 'idle'
      ? 'Start the camera and calibrate to unlock the timer. Nothing leaves this device.'
      : 'Waiting for the next tracking sample.';
  }
}
export default function Study() {
  const { tracking, session, startSession, control, enableNotifications, notificationStatus } = useStudySession();
  const { videoRef, camera, modelStatus, calibration, progress, readout, stats, visibility, error, start, stop, calibrate, retryCalibrationPoint, cancelCalibration } = tracking;
  const [goal, setGoal] = useState('25'), [custom, setCustom] = useState('25');
  const minutes = Number(goal === 'custom' ? custom : goal);
  const validGoal = Number.isFinite(minutes * 60_000) && minutes > 0;
  const goalMs = minutes * 60_000;
  const active = session.lifecycle === 'running';
  const ready = modelStatus.startsWith('ready');
  const calibrated = calibration?.status === 'ready' && !progress;
  const paused = active && session.focus.manual;
  const displayState = session.lifecycle === 'idle' ? 'idle' : session.lifecycle === 'ended' ? 'ended' : session.lifecycle === 'completed' ? 'completed' : session.focus.state;
  const stateLabel = displayState === 'focused'
    ? (readout.focusLevel === 'high' ? 'Focused · high attention' : readout.focusLevel === 'medium' ? 'Focused · medium attention' : 'Focused')
    : displayState === 'manual_pause' ? 'Paused manually'
    : displayState === 'face_absent' ? 'Face not detected'
    : displayState === 'ended' ? 'Session ended'
    : displayState === 'completed' ? 'Session complete'
    : displayState === 'idle' ? 'Not tracking yet'
    : displayState === 'low' ? 'Attention away from screen'
    : displayState === 'unknown' ? 'Tracking uncertain'
    : String(displayState).replaceAll('_', ' ');
  const badgeState: StatusKind = displayState === 'focused' ? 'focused' : displayState === 'low' ? 'low' : displayState === 'manual_pause' ? 'paused' : displayState === 'completed' ? 'completed' : displayState === 'idle' ? 'idle' : displayState === 'ended' ? 'completed' : 'unknown';
  const liveDistraction = active && !paused && session.focus.nonFocusedCounted;
  const remaining = session.lifecycle === 'idle' && validGoal ? goalMs : remainingMs(session);
  const progressPercent = session.lifecycle === 'idle' ? 0 : Math.max(0, Math.min(100, (1 - remaining / Math.max(1, session.goalMs)) * 100));
  const caption = active ? (paused ? 'Paused' : 'In progress') : session.lifecycle === 'completed' ? 'Complete' : session.lifecycle === 'ended' ? 'Ended' : 'Ready';
  function end() { control('end'); stop(); }
  return <main className="page-container study-page">
    <PageHeader eyebrow="Your time, intentionally spent" title="Focus Session" description="Settle into your work. Visual attention is an estimate, not a measure of concentration." actions={<><Link className="app-button button-quiet" href="/history"><Icon name="history" />History</Link><Link className="app-button button-quiet" href="/diagnostics">Stage 1 diagnostics</Link></>} />
    <div className="study-workspace">
      <section className={`session-stage${active ? ' is-running' : ''}${paused ? ' is-paused' : ''}${session.lifecycle === 'idle' ? ' is-idle' : ''}`} aria-label="Study timer">
        <div className="stage-head">
          <p className="stage-kicker"><Icon name="focus" />Focus timer</p>
          <div className="stage-controls">
            <div className="goal-control"><label htmlFor="session-goal">Goal</label><select id="session-goal" value={goal} disabled={active} onChange={e => setGoal(e.target.value)}>{GOAL_MINUTES.map(m => <option key={m} value={m}>{m} minutes</option>)}<option value="custom">Custom duration</option></select></div>
            {goal === 'custom' && <div className="goal-control"><label htmlFor="session-goal-custom">Minutes</label><input id="session-goal-custom" type="number" min="0.01" step="any" value={custom} disabled={active} onChange={e => setCustom(e.target.value)} /></div>}
          </div>
        </div>
        {!validGoal && <p role="alert" className="field-error">Enter a positive, finite duration in minutes.</p>}
        <div className="session-hero">
          <div className="timer-ring" role="progressbar" aria-label="Session progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressPercent)} aria-valuetext={`${Math.round(progressPercent)} percent elapsed, ${clock(remaining, true)} remaining`}>
            <svg className="timer-ring-svg" viewBox="0 0 240 240" aria-hidden="true" focusable="false">
              <circle className="timer-ring-track" cx="120" cy="120" r="116" />
              <circle className="timer-ring-arc" cx="120" cy="120" r="116" pathLength={100} style={{ strokeDasharray: '100', strokeDashoffset: `${100 - progressPercent}` }} />
            </svg>
            <div className="timer-ring-inner">
              <p className="session-countdown" aria-label="Countdown">{clock(remaining, true)}</p>
              <span className="timer-caption">{caption}</span>
            </div>
          </div>
          <div className="session-hero-copy">
            <p role="status" data-focus-state={displayState} className="session-status">
              <StatusBadge status={badgeState} />
              <span className="session-status-label">{stateLabel}</span>
              {liveDistraction && <StatusBadge status="event" />}
            </p>
            <p className="session-feedback">{feedbackFor(displayState, session.lifecycle)}</p>
            <div className="session-toolbar">
              <Button className="button-start" disabled={active || !validGoal || !calibrated || !ready} onClick={() => startSession(minutes * 60_000)}>{session.lifecycle === 'idle' ? 'Start session' : 'Start new session'}</Button>
              <div className="session-secondary">
                <Button variant="ghost" disabled={!active || paused} onClick={() => control('pause')}><Icon name="pause" />Pause</Button>
                <Button variant="ghost" disabled={!active || !paused} onClick={() => control('resume')}><Icon name="play" />Resume</Button>
                <Button variant="ghost" disabled={!active} onClick={end}><Icon name="stop" />End session</Button>
              </div>
            </div>
          </div>
        </div>
        <section className="session-ledger" aria-label="Session measurements">
          <div className="ledger-primary">
            <div><p className="ledger-label">Credited Focus Time</p><p className="ledger-value">{clock(session.creditedMs)}</p></div>
            <p className="ledger-note">{CREDIT_DISCLOSURE}</p>
          </div>
          <dl className="ledger-grid">
            <div className="ledger-item"><dt>Distraction Count</dt><dd>{session.focus.distractionCount}<span className="ledger-note">Includes sustained tracking uncertainty.</span></dd></div>
            <div className="ledger-item"><dt>Current Focused Streak</dt><dd>{clock(session.currentStreakMs)}</dd></div>
            <div className="ledger-item"><dt>Elapsed Wall Time</dt><dd>{clock(elapsedMs(session))}</dd></div>
            <div className="ledger-item"><dt>Longest Focused Streak</dt><dd>{clock(session.longestStreakMs)}</dd></div>
          </dl>
        </section>
        <div className="stage-note">
          <p className="stage-disclaimer">The camera estimates whether your gaze is toward the screen. High and medium attention count as observed focused time. Low and unknown do not, and they share one 10-second non-focused threshold. Unknown can result from lighting or unreliable tracking. This is a visual-attention estimate, not a measure of concentration.</p>
          <details className="session-explanation"><summary>How focused time is credited</summary>
            <p>High and medium focus both earn focused time and maintain the focused streak once on-screen tracking is stable. Low-focus and unknown periods receive no focused-time credit.</p><p>High covers the calibrated inner screen region; medium includes screen edges, the expanded screen-facing region, and usable tracking during normal movement. Low means reliable gaze away; unknown means insufficient tracking. Both are non-focused and share one continuous 10-second distraction timer. Switching between them never resets the timer or records another event during the same episode.</p>
            <p>A non-focused episode records exactly one distraction after 10 seconds and resets the focused streak. Reliable focus for 300 ms clears the episode timer and counted flag. No-face tracking earns no credit and retains its separate face-absence diagnostic. Manual pause always overrides automatic resume.</p>
            <p>Only intervals between fresh inference samples are credited. Gaps of 500 ms or more are dropped entirely; camera shutdown and calibration loss pause credit immediately. The countdown can lag by one inference frame. Elapsed time includes pauses. Streak time does not grow during non-focused periods; it resets when the 10-second threshold is reached. Manual pause and inference gaps also clear the streak.</p>
            <div className="status-key" aria-label="Focus status key"><StatusBadge status="focused" /><StatusBadge status="low" /><StatusBadge status="unknown" /><StatusBadge status="paused" /><StatusBadge status="event" /></div>
          </details>
        </div>
      </section>
      <aside className="session-rail">
        <section className={`rail-panel${camera === 'active' ? ' panel-live' : ''}`} aria-label="Tracking setup">
          <div className="rail-head"><h2 className="panel-title"><Icon name="camera" />Camera and calibration</h2></div>
          <p className="panel-description">Start your camera, then calibrate for your natural sitting position. Everything stays on this device.</p>
          <p className="panel-description">Keep this tab visible in desktop Chrome for reliable camera tracking. Chrome may suspend background video frames; FocusFlow treats missing frames as tracking uncertainty, pauses calibration sampling, and waits for fresh frames when you return. The study session is not restarted.</p>
          <div className="camera-frame">
            <video ref={videoRef} autoPlay playsInline muted className="camera-preview aspect-video w-full -scale-x-100" aria-label="Mirrored live camera preview" />
            {camera !== 'active' && <div className="camera-placeholder"><LandmarkMesh /><strong>{camera === 'requesting' ? 'Starting camera…' : 'Camera is off'}</strong><p>Start the camera to enable local facial-landmark tracking. Nothing leaves this device.</p></div>}
          </div>
          <div className="rail-actions">
            <Button disabled={camera === 'active' || camera === 'requesting'} onClick={start}>Start camera</Button>
            <Button variant="outline" disabled={camera !== 'active'} onClick={stop}>Stop camera</Button>
            <Button variant="outline" disabled={!ready || !!progress} onClick={calibrate}>Calibrate nine points</Button>
          </div>
          <ul className="readiness" aria-label="Tracking setup status">
            <li><Icon name={camera === 'active' ? 'checkCircle' : 'camera'} className={camera === 'active' ? 'is-done' : 'is-pending'} /><span>Camera</span><strong>{camera}</strong></li>
            <li><Icon name={ready ? 'checkCircle' : 'unknown'} className={ready ? 'is-done' : 'is-pending'} /><span>Model</span><strong>{modelStatus}</strong></li>
            <li><Icon name={calibrated ? 'checkCircle' : 'target'} className={calibrated ? 'is-done' : 'is-pending'} /><span>Calibration</span><strong>{progress ? 'in progress' : calibration?.status ?? 'required'}</strong></li>
          </ul>
          <details className="telemetry"><summary>Tracking telemetry</summary>
            <p className="tracking-meta">Focus level: {readout.focusLevel} · Gaze: {readout.classification} · Quality: {readout.quality} · {stats.fps.toFixed(1)} FPS · Reason: {readout.reason}; {readout.reasons.join("; ")}</p>
            <p className="tracking-meta">Browser tab/window: {visibility} (separate from gaze)</p>
          </details>
          {error && <p role="alert">{error}</p>}
        </section>
        <ShieldRailPanel />
        <section className="rail-panel alerts-panel" aria-label="Focus alerts">
          <div className="rail-head"><h2 className="panel-title"><Icon name="bell" />Focus alerts</h2></div>
          <p className="alerts-note">One calm notification per non-focused episode. Browser and OS settings control delivery.</p>
          <Button variant="outline" disabled={notificationStatus === 'granted'} onClick={enableNotifications}>{notificationStatus === 'granted' ? 'Notifications enabled' : 'Enable notifications'}</Button>
          <p className="alerts-note">Status: {notificationStatus}</p>
        </section>
      </aside>
    </div>
    <section className="session-tools" aria-label="Session tools">
      <details className="tool-row study-diagnostics"><summary>Stage 2 transition and episode diagnostics</summary>
        <p>Input: {session.focus.signal}. Attention: {session.focus.attention}. Non-focused episode: {(nonFocusedDurationMs(session.focus) / 1000).toFixed(1)} / 10.0 s; counted: {session.focus.nonFocusedCounted ? "yes" : "no"}. Latest episode reason: {session.focus.episodeReason}</p>
        <p>Low and unknown share one elapsed-time episode, including missing-frame interruptions. Only 300 ms of reliable on-screen focus resets it. Face absence remains a diagnostic override; manual pause and completion retain precedence. Gaps never earn credit. Logs are temporary and also appear in the browser console.</p>
        <ol className="space-y-2 text-sm">{session.diagnostics.slice(-40).map((entry, i) => <li key={`${entry.at}-${i}`}><span className="font-mono">{entry.at.toFixed(0)} ms · {entry.state} · non-focused {(entry.nonFocusedMs / 1000).toFixed(1)} s</span>: {entry.message}</li>)}</ol>
      </details>
    </section>
    {progress && <CalibrationOverlay progress={progress} cancel={cancelCalibration} retry={retryCalibrationPoint} notice={error} />}
  </main>;
}
