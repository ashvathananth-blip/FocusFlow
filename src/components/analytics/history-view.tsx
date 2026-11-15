'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { SavedSession } from '@/types/analytics';
import { historySummary, metrics } from '@/lib/analytics/metrics';
import { emptyDurations, STATES } from '@/lib/analytics/timeline';
import { ANALYTICS_CONFIG } from '@/lib/analytics/config';
import { AttentionBreakdown, AttentionTimeline, FocusTrend } from './charts';
import { Badge, ChartCard, CREDIT_DISCLOSURE, dateLabel, EmptyState, episodeLabel, formatDuration, percent, SCORE_DISCLOSURE, statusLabel } from './ui';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { EmptyLedger } from '@/components/ui/illustrations';
import { PageHeader } from '@/components/layout/page-header';

function ScoreMeter({ label }: { label: string }) {
  const value = Number(label);
  const known = Number.isFinite(value);
  return <div className="score-meter">
    <p className={`meter-label${known ? '' : ' is-muted'}`}>{label}</p>
    <div className="meter-track" role="img" aria-label={known ? `Focus score ${label} on a 0 to 100 display` : `Focus score ${label}`}>
      {known && <div className="meter-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />}
    </div>
    <p className="chart-description">{known ? 'Bar length matches the existing score. Pattern and the number above are both shown.' : 'No bar is drawn when the existing score selector returns a non-numeric result.'}</p>
  </div>;
}
function insightLines(session: SavedSession) {
  const reading = metrics(session);
  const lines = [
    'Visual-attention estimate, not a measure of concentration.',
    'Credited Focus Time uses the existing Stage 2 grace-period rules; may differ from observed focused time.',
  ];
  if (reading.focusPercentage !== null) lines.push(`Observed focused time is ${percent(reading.focusPercentage)} of eligible tracking time. High and medium attention both count as observed focused time.`);
  if (reading.unknownPercentage !== null) lines.push(`Tracking-uncertain time is ${percent(reading.unknownPercentage)} of eligible tracking time. Unknown can result from lighting or unreliable tracking and is not confirmed looking away.`);
  if (session.distractionCount > 0) lines.push('Distraction Count includes sustained tracking uncertainty. Low and unknown share the 10-second non-focused episode threshold.');
  if (!reading.valid) lines.push(reading.eligibleMs === 0 ? 'Normalized metrics are unavailable because eligible tracking time is zero.' : 'Too short to score.');
  return lines;
}
export function HistoryOverview({ sessions }: { sessions: SavedSession[] }) {
  const summary = historySummary(sessions);
  const totals = emptyDurations();
  for (const session of sessions) for (const key of STATES) totals[key] += session.durations[key];
  return <>
    <PageHeader eyebrow="Your sessions, in perspective" title="History" description="Review observed visual attention and tracking uncertainty. Your session history stays in this browser." meta={<Badge>Local storage · No video saved</Badge>} />
    {!sessions.length ? <EmptyState art={<EmptyLedger />} title="Your history starts with a session" description="Start the camera, calibrate, and run a study session. Finished and interrupted sessions will appear here with their actual measurements. Short sessions are saved too." /> : <>
      <section className="summary-band is-four" aria-label="History summary">
        <div className="summary-item"><p className="summary-label">Saved sessions</p><p className="summary-value">{sessions.length}</p><p className="summary-note">{summary.comparable.length} eligible for comparisons; short sessions remain in the list.</p></div>
        <div className="summary-item"><p className="summary-label">Credited Focus Time</p><p className="summary-value">{formatDuration(sessions.reduce((total, session) => total + session.creditedMs, 0))}</p><p className="summary-note">{CREDIT_DISCLOSURE}</p></div>
        <div className="summary-item"><p className="summary-label">Focus Percentage</p><p className="summary-value">{percent(summary.focusPercentage)}</p><p className="summary-note">Duration-weighted across validated eligible sessions. Pauses and dropped inference time are excluded.</p></div>
        <div className="summary-item"><p className="summary-label">Average Focus Score</p><p className="summary-value">{summary.averageScore === null ? 'Unavailable' : summary.averageScore.toFixed(1)}</p><p className="summary-note">{SCORE_DISCLOSURE} {!ANALYTICS_CONFIG.scoreFormula && 'The score formula has not been supplied.'}</p></div>
      </section>
      <div className="chart-grid">
        <ChartCard title="Observed focus trend" description="Focus percentage uses eligible tracking time, never wall time. Only validated live sessions with at least 2 eligible minutes appear."><FocusTrend sessions={sessions} /></ChartCard>
        <ChartCard title="All recorded time" description="Raw durations from all saved sessions, including short and interrupted sessions. Excluded time is shown separately."><AttentionBreakdown durations={totals} /></ChartCard>
      </div>
      <section className="notice" aria-label="How to read these charts">
        <strong>How to read these charts</strong>
        <ul className="reading">
          <li>{SCORE_DISCLOSURE}</li>
          <li>Credited Focus Time uses the existing Stage 2 grace-period rules; may differ from observed focused time.</li>
          <li>Chart colors are paired with labels, stripes, dots, or a numbered list so the values can be read without color.</li>
        </ul>
      </section>
      <section className="records" aria-labelledby="saved-sessions">
        <div className="section-head"><h2 id="saved-sessions">Sessions</h2><p className="chart-description">Interrupted means the saved record stops at the last checkpoint; missing time is never filled in.</p></div>
        <ul className="record-list">{sessions.map(session => {
          const reading = metrics(session);
          return <li key={session.id}><Link href={`/history/${encodeURIComponent(session.id)}`} className="record-row is-session">
            <div className="session-head"><h3>{dateLabel(session.startedAt)}</h3><div className="session-badges"><Badge tone={session.status === 'interrupted' ? 'warning' : session.status === 'completed' ? 'good' : 'neutral'}>{statusLabel[session.status]}</Badge>{reading.eligibleMs < 120000 && <Badge>Under 2 eligible minutes</Badge>}</div></div>
            <dl className="metric-grid"><div><dt>Observed Focused Time</dt><dd>{formatDuration(session.durations.focused)}</dd></div><div><dt>Eligible tracking</dt><dd>{formatDuration(reading.eligibleMs)}</dd></div><div><dt>Focus Percentage</dt><dd>{percent(reading.focusPercentage)}</dd></div><div><dt>Focus Score</dt><dd>{reading.scoreLabel}</dd></div></dl>
            <span className="link-quiet">View session analytics <Icon name="arrow" /></span>
          </Link></li>;
        })}</ul>
      </section>
    </>}
  </>;
}
function Episodes({ session }: { session: SavedSession }) {
  const [page, setPage] = useState(0);
  const size = 25;
  const episodes = [...session.episodes, ...(session.currentEpisode ? [session.currentEpisode] : [])].filter(episode => episode.durationMs > 0);
  const items = episodes.slice(page * size, (page + 1) * size);
  if (!episodes.length) return <p className="chart-description">No measurable non-focused episodes were recorded.</p>;
  return <><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><caption className="pb-4 text-left text-xs leading-relaxed">Labels summarize measured state durations, not intentions. Episode spans may include explicitly unobserved gaps; classification uses only measured low/unknown durations. Mixed means neither dominates, or no measured state is available. A counted episode contributes to Stage 2&apos;s combined Distraction Count, including sustained tracking uncertainty.</caption><thead><tr><th>Start / end</th><th>Duration</th><th>Low / unknown</th><th>Classification</th><th>Threshold</th></tr></thead><tbody>{items.map(episode => <tr key={episode.id}><td className="whitespace-nowrap">{new Date(Date.parse(session.startedAt) + episode.startMs).toLocaleTimeString()}<br /><span className="chart-description">{new Date(Date.parse(session.startedAt) + episode.endMs).toLocaleTimeString()}</span></td><td>{formatDuration(episode.durationMs)}{episode.unobservedMs > 0 && <p className="chart-description">{formatDuration(episode.unobservedMs)} unobserved</p>}</td><td>{formatDuration(episode.lowMs)} / {formatDuration(episode.unknownMs)}</td><td><Badge>{episodeLabel[episode.classification]}</Badge></td><td>{episode.counted ? <Badge tone="warning">Counted once</Badge> : episode.belowThreshold ? <Badge>Below 10 seconds</Badge> : <Badge>Not counted</Badge>}</td></tr>)}</tbody></table></div>{episodes.length > size && <div className="mt-4 flex items-center justify-between gap-3 text-sm"><Button variant="outline" disabled={page === 0} onClick={() => setPage(current => current - 1)}>Previous</Button><span>{page + 1} / {Math.ceil(episodes.length / size)}</span><Button variant="outline" disabled={(page + 1) * size >= episodes.length} onClick={() => setPage(current => current + 1)}>Next</Button></div>}</>;
}
export function SessionDetail({ session }: { session: SavedSession }) {
  const reading = metrics(session);
  return <div className="detail">
    <header className="detail-header">
      <Link href="/history" className="link-quiet detail-back"><Icon name="arrow" />All sessions</Link>
      <div className="detail-title-row"><h1>Session review</h1><Badge tone={session.status === 'interrupted' ? 'warning' : 'neutral'}>{statusLabel[session.status]}</Badge></div>
      <p className="detail-date">{dateLabel(session.startedAt)}{session.endedAt ? ` — ${dateLabel(session.endedAt)}` : ' · Active checkpoint'}</p>
      {session.status === 'interrupted' && <p className="notice notice-warning" style={{ marginTop: 16 }}>Interrupted. Measurements stop at the last saved checkpoint; no time after it has been reconstructed.</p>}
    </header>
    <section className="detail-score" aria-label="Focus Score">
      <div><p className="meta-label" style={{ marginBottom: 10 }}>Focus Score</p><ScoreMeter label={reading.scoreLabel} /></div>
      <div className="score-side">
        <div><p className="ledger-label">Credited Focus Time</p><p className="score-figure">{formatDuration(session.creditedMs)}</p><p className="ledger-note">{CREDIT_DISCLOSURE}</p></div>
        <div><p className="ledger-label">Eligible Tracking Time</p><p className="score-figure">{formatDuration(reading.eligibleMs)}</p><p className="ledger-note">Observed focused + low + unknown. Excludes pauses, calibration/setup, and unobserved gaps.</p></div>
      </div>
    </section>
    <section className="metric-groups" aria-label="Session measurements">
      <div className="metric-group"><h2>Attention</h2><dl>
        <div><dt>Observed Focused Time</dt><dd>{formatDuration(session.durations.focused)}<span className="metric-note">Measured time classified focused during verified active tracking.</span></dd></div>
        <div><dt>Focus Percentage</dt><dd>{percent(reading.focusPercentage)}<span className="metric-note">Observed Focused Time ÷ eligible tracking time.</span></dd></div>
        <div><dt>Tracking-Uncertain Time</dt><dd>{formatDuration(session.durations.unknown)}<span className="metric-note">Tracking could not reliably determine gaze; this is not confirmed looking away.</span></dd></div>
      </dl></div>
      <div className="metric-group"><h2>Session</h2><dl>
        <div><dt>Distraction Count</dt><dd>{session.distractionCount}<span className="metric-note">Combined Stage 2 count; includes sustained tracking uncertainty.</span></dd></div>
        <div><dt>Elapsed Wall Time</dt><dd>{formatDuration(session.elapsedMs)}<span className="metric-note">Session span including pauses and gaps; never the normalized-metric denominator.</span></dd></div>
      </dl></div>
    </section>
    {reading.eligibleMs < 120000 && <p className="notice">{reading.eligibleMs === 0 ? 'Normalized metrics are unavailable because eligible tracking time is zero.' : 'Too short to score.'} Sessions need at least 120 eligible seconds for scores, averages, and trends. Raw statistics remain saved.</p>}
    {!ANALYTICS_CONFIG.scoreFormula && reading.eligibleMs >= 120000 && <p className="notice">Focus Score is unavailable because no documented score formula was supplied. Focus Percentage and raw measurements remain available.</p>}
    <div className="chart-grid">
      <ChartCard title="Rule-based insights" description="These sentences restate the existing metrics. They do not recompute scores or eligibility."><ul className="reading">{insightLines(session).map(line => <li key={line}>{line}</li>)}</ul></ChartCard>
      <ChartCard title="Session context" description="Minimal calibration metadata helps explain uncertainty without saving biometric samples."><dl className="context-list"><dt>Calibration</dt><dd>{session.calibration.calibrated ? 'Calibrated' : 'Not available / not ready'}</dd><dt>Quality / residual error</dt><dd>{session.calibration.quality} / {session.calibration.residualError === null ? 'Unavailable' : session.calibration.residualError.toFixed(3)}</dd><dt>Method</dt><dd>{session.calibration.method ?? 'Unavailable'}</dd><dt>Distractions per hour</dt><dd>{reading.distractionsPerHour === null ? 'Unavailable' : reading.distractionsPerHour.toFixed(2)}</dd><dt>Average measured non-focused episode</dt><dd>{formatDuration(reading.averageEpisodeMs)}</dd><dt>Longest focused streak</dt><dd>{formatDuration(session.longestStreakMs)}</dd><dt>Comparison eligibility</dt><dd>{reading.valid ? 'Validated · at least 120 eligible seconds' : 'Excluded from comparisons'}</dd><dt>Last checkpoint</dt><dd>{dateLabel(session.checkpointedAt)}</dd></dl></ChartCard>
    </div>
    <ChartCard title="Attention timeline" description="Measured classifications and explicitly excluded intervals. Long timelines are deterministically compacted to at most 500 segments; mixed bins retain state durations and event markers."><AttentionTimeline session={session} /></ChartCard>
    <ChartCard title="Time breakdown" description="Measured attention is separated from manual pauses and unobserved intervals."><AttentionBreakdown durations={session.durations} /></ChartCard>
    <ChartCard title="Non-Focused Episodes" description="All measurable episodes, including those shorter than 10 seconds. Looking-away and uncertain labels use the measured 60% dominance rule; neither dominant state produces a mixed label."><Episodes session={session} /></ChartCard>
  </div>;
}
export function HistoryFrame({ sessions, sessionId, error = '', invalid = 0, refresh }: { sessions: SavedSession[]; sessionId?: string; error?: string; invalid?: number; refresh?: () => void }) {
  const session = sessionId ? sessions.find(item => item.id === sessionId) : undefined;
  return <main className="page-container stack">
    {error && <div role="alert" className="notice"><p>{error}</p>{refresh && <Button variant="outline" className="mt-3" onClick={refresh}>Retry local storage</Button>}</div>}
    {invalid > 0 && <p role="alert" className="notice notice-warning">{invalid} stored record(s) failed schema validation and are excluded from analytics.</p>}
    {sessionId ? (session ? <SessionDetail session={session} /> : <EmptyState title="Session not found" description="This session is not available in this browser, or its data failed validation. Return to History to view locally saved sessions." action={false} />) : <HistoryOverview sessions={sessions} />}
    <footer className="page-footer">Local measurements only. No camera frames, facial landmarks, or calibration models are saved. Comparative analytics use validated live sessions with at least 120 eligible seconds; interrupted sessions must meet the same rules.</footer>
  </main>;
}
