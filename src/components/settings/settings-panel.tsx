'use client';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { StatusBadge } from '@/components/ui/status-badge';
import { clearHistory } from '@/lib/storage/history-store';
import { useHistory } from '@/hooks/useHistory';

const sections = [
  ['settings-calibration', 'Calibration'],
  ['settings-privacy', 'Privacy'],
  ['settings-storage', 'Local data'],
  ['settings-history', 'Clear history'],
  ['settings-application', 'Application'],
] as const;
export function SettingsPanel() {
  const history = useHistory();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  async function clear() {
    setPending(true);
    try {
      await clearHistory();
      setMessage('Saved session history was removed from this browser.');
      setConfirming(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Local history could not be cleared.');
    } finally { setPending(false); }
  }
  return <main className="page-container">
    <PageHeader eyebrow="On this device" title="Settings" description="Calibration, privacy, and the history stored in this browser. No extra tracking options are added here." />
    <div className="settings-layout">
      <nav className="settings-index" aria-label="Settings sections">
        <p className="meta-label">On this page</p>
        {sections.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
      </nav>
      <div className="settings-sections">
        <section id="settings-calibration" className="settings-section" aria-labelledby="settings-calibration-title">
          <div className="settings-heading"><Icon name="target" /><h2 id="settings-calibration-title">Calibration</h2></div>
          <p className="page-description">Calibration stays in memory for the current Focus Session. This page does not start the camera or change calibration targets, sample counts, or validation thresholds.</p>
          <p className="page-description">Open Focus Session, start the camera, and run the nine-point calibration again whenever you change seats or lighting.</p>
          <div className="settings-status"><StatusBadge status="unknown">Calibration status is per session</StatusBadge><span>Recalibrate whenever your camera position changes.</span></div>
          <div className="inline-actions"><Button asChild><Link href="/study"><Icon name="target" />Recalibrate on Focus Session</Link></Button></div>
        </section>
        <section id="settings-privacy" className="settings-section" aria-labelledby="settings-privacy-title">
          <div className="settings-heading"><Icon name="shield" /><h2 id="settings-privacy-title">Privacy</h2></div>
          <p className="page-description">MediaPipe facial landmarks run locally. Focus Flow estimates whether visual attention is directed toward the screen. It does not measure mental concentration.</p>
          <p className="page-description">Camera frames and landmark coordinates are not uploaded and are not written into session history.</p>
          <div className="settings-status"><Icon name="check" style={{ width: 14, height: 14, color: 'var(--teal)' }} /><strong>Nothing leaves this device</strong></div>
        </section>
        <section id="settings-storage" className="settings-section" aria-labelledby="settings-storage-title">
          <div className="settings-heading"><Icon name="history" /><h2 id="settings-storage-title">Local data storage</h2></div>
          <p className="page-description">Finished sessions are stored in this browser&apos;s IndexedDB database, focusflow-history. Records include timings, attention durations, episode summaries, and minimal calibration quality. No video is stored.</p>
          <div className="settings-status"><strong>{history.loading ? 'Checking saved sessions…' : `${history.sessions.length} saved session${history.sessions.length === 1 ? '' : 's'} in this browser.`}</strong></div>
        </section>
        <section id="settings-history" className="settings-section" aria-labelledby="settings-history-title">
          <div className="settings-heading"><Icon name="alert" /><h2 id="settings-history-title">Clear history</h2></div>
          <p className="page-description">This removes saved session records from this browser. It does not change how future sessions are measured.</p>
          {message && <p role="status" className="notice">{message}</p>}
          <div className="inline-actions"><Button variant="outline" disabled={history.loading || history.sessions.length === 0 || pending} onClick={() => setConfirming(true)}>Clear history</Button></div>
        </section>
        <section id="settings-application" className="settings-section" aria-labelledby="settings-application-title">
          <div className="settings-heading"><Icon name="focus" /><h2 id="settings-application-title">Application</h2></div>
          <p className="page-description">Focus Flow 0.1.0. Camera attention tracking is currently verified only on desktop Chrome.</p>
          <p className="page-description">Sessions are analysed with the existing Stage 2 and Stage 3 rules. Visual attention is an estimate, not a measure of concentration.</p>
        </section>
      </div>
    </div>
    {confirming && <div className="dialog-backdrop"><div className="dialog-card" role="alertdialog" aria-modal="true" aria-labelledby="clear-history-title" aria-describedby="clear-history-description">
      <h2 id="clear-history-title">Clear saved history?</h2>
      <p id="clear-history-description">This deletes the session records stored in this browser. The action cannot be undone from Focus Flow.</p>
      <div className="inline-actions"><Button variant="outline" disabled={pending} onClick={() => setConfirming(false)}>Cancel</Button><Button disabled={pending} onClick={clear}>Clear history</Button></div>
    </div></div>}
  </main>;
}
