'use client';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { StatusBadge, type StatusKind } from '@/components/ui/status-badge';
import { Icon } from '@/components/ui/icon';
import { StatCard, CREDIT_DISCLOSURE } from '@/components/analytics/ui';
import { Button } from '@/components/ui/button';
import { CalibrationOverlay } from '@/components/calibration/calibration-overlay';
import { useStudySession } from '@/hooks/useStudySession';
import { nonFocusedDurationMs } from '@/lib/focus/state-machine';
import { elapsedMs, GOAL_MINUTES, remainingMs } from '@/lib/focus/timer-engine';

function clock(ms: number, countdown = false) {
  const seconds = countdown ? Math.ceil(ms / 1000) : Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
export default function Study() {
  const { tracking, session, startSession, control, enableNotifications, notificationStatus } = useStudySession();
  const { videoRef, camera, modelStatus, calibration, progress, readout, stats, visibility, error, start, stop, calibrate, cancelCalibration } = tracking;
  const [goal, setGoal] = useState('25'), [custom, setCustom] = useState('25');
  const minutes = Number(goal === 'custom' ? custom : goal);
  const validGoal = Number.isFinite(minutes * 60_000) && minutes > 0;
  const active = session.lifecycle === 'running';
  const ready = modelStatus.startsWith('ready');
  const calibrated = calibration?.status === 'ready' && !progress;
  const paused = session.focus.manual;
  const displayState = session.lifecycle === 'idle' ? 'idle' : session.lifecycle === 'ended' ? 'ended' : session.focus.state;
  const stateLabel = displayState === 'focused' ? readout.focusLevel : displayState.replaceAll('_', ' ');
  const badgeState: StatusKind = displayState === 'focused' ? 'focused' : displayState === 'low' ? 'low' : displayState === 'manual_pause' ? 'paused' : displayState === 'completed' ? 'completed' : displayState === 'idle' ? 'idle' : displayState === 'ended' ? 'completed' : 'unknown';
  function end() { control('end'); stop(); }
  return <main className="page-container study-page">
    <PageHeader eyebrow="Your time, intentionally spent" title="Focus Session" description="Settle into your work. Visual attention is an estimate, not a measure of concentration." actions={<><Link className="app-button button-outline" href="/history"><Icon name="history" />History</Link><Link className="app-button button-outline" href="/diagnostics">Stage 1 diagnostics</Link></>} />
    <div className="study-workspace">
    <section className="study-camera session-panel" aria-label="Tracking setup">
      <h2 className="panel-title"><Icon name="camera" />Camera and calibration</h2><p className="panel-description">Start your camera, then calibrate for your natural sitting position.</p>
      <div className="flex flex-wrap gap-2"><Button disabled={camera === 'active' || camera === 'requesting'} onClick={start}>Start camera</Button><Button variant="outline" disabled={camera !== 'active'} onClick={stop}>Stop camera</Button><Button variant="outline" disabled={!ready || !!progress} onClick={calibrate}>Calibrate nine points</Button></div>
      <video ref={videoRef} autoPlay playsInline muted className="camera-preview aspect-video w-full -scale-x-100" aria-label="Mirrored live camera preview" />
      <p className="tracking-meta">Camera: {camera} · Model: {modelStatus} · Calibration: {calibration?.status ?? 'required'}</p>
      <p className="tracking-meta">Focus level: {readout.focusLevel} · Gaze: {readout.classification} · Quality: {readout.quality} · {stats.fps.toFixed(1)} FPS · Reason: {readout.reason}; {readout.reasons.join("; ")}</p>
      <p className="tracking-meta">Browser tab/window: {visibility} (separate from gaze)</p>
      {error && <p role="alert">{error}</p>}
    </section>
    <section className="study-timer session-panel" aria-label="Study timer">
      <label className="block">Session goal <select className="rounded border p-2" value={goal} disabled={active} onChange={e => setGoal(e.target.value)}>{GOAL_MINUTES.map(m => <option key={m} value={m}>{m} minutes</option>)}<option value="custom">Custom duration</option></select></label>
      {goal === 'custom' && <label className="block">Custom minutes <input className="rounded border p-2" type="number" min="0.01" step="any" value={custom} disabled={active} onChange={e => setCustom(e.target.value)} /></label>}
      {!validGoal && <p role="alert">Enter a positive, finite duration in minutes.</p>}
      <p className="session-countdown" aria-label="Countdown">{clock(session.lifecycle === 'idle' && validGoal ? minutes * 60_000 : remainingMs(session), true)}</p>
      <p>Tracking lifecycle: {progress ? 'calibration' : calibrated ? 'ready' : 'setup required'}</p>
      <p role="status" data-focus-state={displayState}><StatusBadge status={badgeState} /> <span className="tracking-meta">State: {stateLabel}</span></p>
      <div className="flex flex-wrap gap-2"><Button disabled={active || !validGoal || !calibrated || !ready} onClick={() => startSession(minutes * 60_000)}>{session.lifecycle === 'idle' ? 'Start session' : 'Start new session'}</Button><Button variant="outline" disabled={!active || paused} onClick={() => control('pause')}><Icon name="pause" />Pause</Button><Button variant="outline" disabled={!active || !paused} onClick={() => control('resume')}><Icon name="play" />Resume</Button><Button variant="outline" disabled={!active} onClick={end}><Icon name="stop" />End session</Button></div>
      <div className="session-statistics">
        <StatCard label="Credited focus time" value={clock(session.creditedMs)} note={CREDIT_DISCLOSURE} />
        <StatCard label="Distraction Count" value={session.focus.distractionCount} note="Includes sustained tracking uncertainty." />
        <StatCard label="Current focused streak" value={clock(session.currentStreakMs)} />
        <StatCard label="Elapsed wall time" value={clock(elapsedMs(session))} />
        <StatCard label="Longest focused streak" value={clock(session.longestStreakMs)} />
      </div>
      <details className="session-explanation"><summary>How focused time is credited</summary>
      <p>High and medium focus both earn focused time and maintain the focused streak once on-screen tracking is stable. Low-focus and unknown periods receive no focused-time credit.</p><p>High covers the calibrated inner screen region; medium includes screen edges, the expanded screen-facing region, and usable tracking during normal movement. Low means reliable gaze away; unknown means insufficient tracking. Both are non-focused and share one continuous 10-second distraction timer. Switching between them never resets the timer or records another event during the same episode.</p>
      <p className="text-sm">A non-focused episode records exactly one distraction after 10 seconds and resets the focused streak. Reliable focus for 300 ms clears the episode timer and counted flag. No-face tracking earns no credit and retains its separate face-absence diagnostic. Manual pause always overrides automatic resume.</p>
      <p className="text-sm">Only intervals between fresh inference samples are credited. Gaps of 500 ms or more are dropped entirely; camera shutdown and calibration loss pause credit immediately. The countdown can lag by one inference frame. Elapsed time includes pauses. Streak time does not grow during non-focused periods; it resets when the 10-second threshold is reached. Manual pause and inference gaps also clear the streak.</p>
      </details>
    </section>
    </div>
    <details className="session-panel study-diagnostics"><summary>Stage 2 transition and episode diagnostics</summary>
      <p>Input: {session.focus.signal}. Attention: {session.focus.attention}. Non-focused episode: {(nonFocusedDurationMs(session.focus) / 1000).toFixed(1)} / 10.0 s; counted: {session.focus.nonFocusedCounted ? "yes" : "no"}. Latest episode reason: {session.focus.episodeReason}</p>
      <p>Low and unknown share one elapsed-time episode, including missing-frame interruptions. Only 300 ms of reliable on-screen focus resets it. Face absence remains a diagnostic override; manual pause and completion retain precedence. Gaps never earn credit. Logs are temporary and also appear in the browser console.</p>
      <ol className="space-y-2 text-sm">{session.diagnostics.slice(-40).map((entry, i) => <li key={`${entry.at}-${i}`}><span className="font-mono">{entry.at.toFixed(0)} ms · {entry.state} · non-focused {(entry.nonFocusedMs / 1000).toFixed(1)} s</span>: {entry.message}</li>)}</ol>
    </details>
    <section className="session-panel study-notifications" aria-label="Distraction notifications"><Button variant="outline" onClick={enableNotifications}>Enable distraction notifications</Button><p>Notifications: {notificationStatus}. One attempt per combined non-focused episode; browser and OS settings control delivery.</p></section>
    {progress && <CalibrationOverlay progress={progress} cancel={cancelCalibration} />}
  </main>;
}
