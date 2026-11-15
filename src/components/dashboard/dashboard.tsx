'use client';
import Link from 'next/link';
import { historySummary } from '@/lib/analytics/metrics';
import { CREDIT_DISCLOSURE, SCORE_DISCLOSURE, dateLabel, episodeLabel, formatDuration, percent } from '@/components/analytics/ui';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { AttentionFlow, CameraStep, CalibrationStep, LandmarkMesh, StudyScene } from '@/components/ui/illustrations';
import { useHistory } from '@/hooks/useHistory';
import type { SavedSession } from '@/types/analytics';

function sameLocalDay(iso: string, now = new Date()) {
  const date = new Date(iso);
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}
function recentEpisodes(sessions: SavedSession[]) {
  return sessions.flatMap(session => [...session.episodes, ...(session.currentEpisode ? [session.currentEpisode] : [])]
    .filter(episode => episode.durationMs > 0)
    .map(episode => ({ session, episode }))).slice(0, 4);
}
export function Dashboard() {
  const history = useHistory();
  const sessions = history.sessions;
  const summary = historySummary(sessions);
  const today = sessions.filter(session => sameLocalDay(session.startedAt)).reduce((total, session) => total + session.creditedMs, 0);
  const episodes = recentEpisodes(sessions);
  return <main className="page-container">
    <PageHeader eyebrow="Study with a quieter screen" title="Welcome to Focus Flow" description="Focus Flow estimates whether your visual attention is directed toward the screen, then keeps a local record of your study sessions. It does not measure mental concentration." actions={<><Button asChild><Link href="/study"><Icon name="focus" />Start Focus Session</Link></Button><Link className="app-button button-quiet" href="/history">History</Link></>} />
    <div className="dashboard">
      <section className="today-band" aria-label="Today at a glance">
        <div className="today-main">
          <p className="meta-label">Saved in this browser</p>
          <p className="today-number">{history.loading ? '…' : formatDuration(today)}</p>
          <p className="today-caption">credited focus time today</p>
          <p className="today-copy">Your focus, kept on this device. Today&apos;s credited time, session counts, and scores come from sessions already saved here. High and medium attention both count as observed focused time; low and unknown do not.</p>
          <p className="fine-print">{CREDIT_DISCLOSURE}</p>
          <div className="today-actions"><a className="link-quiet" href="#how-focus-flow-works">How Focus Flow works <Icon name="arrow" /></a></div>
        </div>
        <div className="today-art"><StudyScene /></div>
      </section>
      {history.error && <p role="alert" className="notice">{history.error}</p>}
      <section className="summary-band" aria-label="Saved history summary">
        <div className="summary-item"><p className="summary-label">Total study sessions</p><p className="summary-value">{history.loading ? '…' : sessions.length}</p><p className="summary-note">Every saved session in this browser, including short and interrupted records.</p></div>
        <div className="summary-item"><p className="summary-label">Average focus score</p><p className="summary-value">{history.loading ? '…' : summary.averageScore === null ? 'Unavailable' : summary.averageScore.toFixed(1)}</p><p className="summary-note">{SCORE_DISCLOSURE}</p></div>
        <div className="summary-item"><p className="summary-label">Eligible focus percentage</p><p className="summary-value">{history.loading ? '…' : percent(summary.focusPercentage)}</p><p className="summary-note">From the existing history summary. Pauses and dropped inference time stay out of the denominator.</p></div>
      </section>
      <div className="dashboard-columns">
        <section className="section-block" aria-labelledby="recent-sessions">
          <div className="section-head"><h2 id="recent-sessions">Recent sessions</h2><Link className="link-quiet" href="/history">All history <Icon name="arrow" /></Link></div>
          {!sessions.length
            ? <div className="section-empty"><p className="chart-description">Your history starts with a session. Finished and interrupted sessions are both saved.</p><div className="inline-actions" style={{ marginTop: 14 }}><Button asChild variant="outline"><Link href="/study">Start a session</Link></Button></div></div>
            : <ul className="record-list">{sessions.slice(0, 5).map(session => <li key={session.id}><Link className="record-row" href={`/history/${encodeURIComponent(session.id)}`}><span><span className="record-date">{dateLabel(session.startedAt)}</span><span className="record-meta">Credited {formatDuration(session.creditedMs)} · {session.distractionCount} distractions</span></span><span className="record-tail"><Icon name="arrow" /></span></Link></li>)}</ul>}
        </section>
        <section className="section-block" aria-labelledby="recent-episodes">
          <div className="section-head"><h2 id="recent-episodes">Recent non-focused episodes</h2></div>
          <p className="chart-description" style={{ marginTop: 12 }}>Low and unknown share a 10-second threshold. Unknown can come from lighting or unreliable tracking. These rows use the saved episode records.</p>
          {!episodes.length
            ? <p className="chart-description" style={{ marginTop: 16 }}>No measurable non-focused episodes are saved yet.</p>
            : <ul className="episode-list" style={{ marginTop: 8 }}>{episodes.map(({ session, episode }) => <li key={`${session.id}-${episode.id}`} className="episode-row"><span><span className="episode-when">{dateLabel(session.startedAt)}</span><span className="episode-note">{episodeLabel[episode.classification]}{episode.counted ? ' · counted once' : ''}</span></span><span className="episode-time">{formatDuration(episode.durationMs)}</span></li>)}</ul>}
        </section>
      </div>
      <section aria-labelledby="how-focus-flow-works" className="onboarding">
        <div className="onboarding-intro">
          <div>
            <p className="section-eyebrow">Onboarding</p>
            <h2 id="how-focus-flow-works">How Focus Flow Works</h2>
            <p className="page-description">Three steps. The camera looks for facial landmarks on this device and estimates gaze toward the screen. It does not read thoughts or measure concentration.</p>
            <ul className="rule-list" aria-label="What counts as focused time">
              <li><Icon name="check" />High and medium attention both count toward observed focused time.</li>
              <li><Icon name="check" />Low and unknown states do not count as observed focused time.</li>
              <li><Icon name="check" />Low and unknown share a 10-second non-focused episode threshold.</li>
              <li><Icon name="check" />Unknown can result from lighting or unreliable tracking.</li>
              <li><Icon name="check" />Credited Focus Time uses the existing Stage 2 grace-period rules and may differ from observed focused time.</li>
            </ul>
          </div>
          <div className="onboarding-art"><AttentionFlow /></div>
        </div>
        <div className="flow-steps">
          <article className="flow-step"><div className="step-top"><CameraStep /><p className="step-index">01</p></div><h3>Enable Your Camera</h3><p>Allow webcam access so MediaPipe can detect facial landmarks locally.</p></article>
          <article className="flow-step"><div className="step-top"><CalibrationStep /><p className="step-index">02</p></div><h3>Calibrate Your Focus</h3><p>Follow the calibration steps while looking at the indicated screen positions.</p></article>
          <article className="flow-step"><div className="step-top"><LandmarkMesh /><p className="step-index">03</p></div><h3>Start Studying</h3><p>Focus Flow estimates whether your visual attention is directed toward the screen and tracks your focus sessions.</p></article>
        </div>
      </section>
    </div>
  </main>;
}
