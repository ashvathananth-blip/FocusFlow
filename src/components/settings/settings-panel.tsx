'use client';
import Link from 'next/link';
import { useState, useSyncExternalStore } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { StatusBadge } from '@/components/ui/status-badge';
import { clearHistory } from '@/lib/storage/history-store';
import { useHistory } from '@/hooks/useHistory';
import { WebsiteBlockerStatus } from './website-blocker-status';

const sections = [
  ['settings-tracking', 'Camera & tracking'],
  ['settings-calibration', 'Calibration'],
  ['settings-notifications', 'Notifications'],
  ['settings-website-blocker', 'Website blocker'],
  ['settings-storage', 'Local data'],
  ['settings-application', 'Application'],
] as const;
function notificationPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}
function subscribePermission(callback: () => void) {
  window.addEventListener('focus', callback);
  return () => window.removeEventListener('focus', callback);
}
export function SettingsPanel() {
  const history = useHistory();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const permission = useSyncExternalStore(subscribePermission, notificationPermission, () => 'checking');
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
    <PageHeader eyebrow="On this device" title="Settings" description="Tracking, calibration, notifications, the website blocker, and the data stored in this browser." />
    <div className="settings-layout">
      <nav className="settings-index" aria-label="Settings sections">
        <p className="meta-label">On this page</p>
        {sections.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
      </nav>
      <div className="settings-sections">
        <section id="settings-tracking" className="settings-section" aria-labelledby="settings-tracking-title">
          <div className="settings-heading"><Icon name="camera" /><h2 id="settings-tracking-title">Camera and gaze tracking</h2></div>
          <p className="page-description">MediaPipe facial landmarks run locally. Focus Flow estimates whether visual attention is directed toward the screen. It does not measure mental concentration.</p>
          <p className="page-description">Camera frames and landmark coordinates are never uploaded and are not written into session history. Only timings, attention durations, episode summaries, and minimal calibration quality are saved.</p>
          <div className="settings-status"><Icon name="lock" style={{ width: 14, height: 14, color: 'var(--teal)' }} /><strong>Nothing leaves this device</strong><span>Desktop Chrome is the only verified browser for tracking.</span></div>
          <div className="inline-actions"><Button asChild variant="outline"><Link href="/study"><Icon name="camera" />Open Focus Session</Link></Button></div>
        </section>
        <section id="settings-calibration" className="settings-section" aria-labelledby="settings-calibration-title">
          <div className="settings-heading"><Icon name="target" /><h2 id="settings-calibration-title">Calibration</h2></div>
          <p className="page-description">Calibration stays in memory for the current Focus Session. This page does not start the camera or change calibration targets, sample counts, or validation thresholds. Recalibrate whenever you change seats, lighting, or camera position.</p>
          <div className="settings-status"><StatusBadge status="unknown">Calibration status is per session</StatusBadge><span>Nine points are sampled in order.</span></div>
          <div className="inline-actions"><Button asChild><Link href="/study"><Icon name="target" />Recalibrate on Focus Session</Link></Button></div>
        </section>
        <section id="settings-notifications" className="settings-section" aria-labelledby="settings-notifications-title">
          <div className="settings-heading"><Icon name="bell" /><h2 id="settings-notifications-title">Notifications</h2></div>
          <p className="page-description">Focus Flow sends one calm notification per non-focused episode. Browser and operating-system settings decide whether it appears. The permission prompt is requested from Focus Session so it stays tied to an active session.</p>
          <div className="settings-status">
            <StatusBadge status={permission === 'granted' ? 'focused' : permission === 'denied' ? 'low' : 'unknown'}>{permission === 'checking' ? 'Checking permission' : permission === 'unsupported' ? 'Not supported in this browser' : `Permission: ${permission}`}</StatusBadge>
            <span>{permission === 'denied' ? 'Blocked notifications must be re-enabled in your browser site settings.' : 'Sound is controlled by your system.'}</span>
          </div>
          <div className="inline-actions"><Button asChild variant="outline"><Link href="/study"><Icon name="bell" />Manage on Focus Session</Link></Button></div>
        </section>
        <WebsiteBlockerStatus />
        <section id="settings-storage" className="settings-section" aria-labelledby="settings-storage-title">
          <div className="settings-heading"><Icon name="history" /><h2 id="settings-storage-title">Local data</h2></div>
          <p className="page-description">Finished sessions are stored in this browser&apos;s IndexedDB database, focusflow-history. Records include timings, attention durations, episode summaries, and minimal calibration quality. No video is stored.</p>
          <div className="settings-status"><strong>{history.loading ? 'Checking saved sessions…' : `${history.sessions.length} saved session${history.sessions.length === 1 ? '' : 's'} in this browser.`}</strong><span>Clearing removes every saved record.</span></div>
          {message && <p role="status" className="notice">{message}</p>}
          <div className="inline-actions"><Button variant="outline" disabled={history.loading || history.sessions.length === 0 || pending} onClick={() => setConfirming(true)}>Clear history</Button></div>
        </section>
        <section id="settings-application" className="settings-section" aria-labelledby="settings-application-title">
          <div className="settings-heading"><Icon name="focus" /><h2 id="settings-application-title">Application</h2></div>
          <p className="page-description">Focus Flow 0.1.0. Camera attention tracking is currently verified only on desktop Chrome.</p>
          <p className="page-description">Sessions are analysed with the existing Stage 2 and Stage 3 rules. Visual attention is an estimate, not a measure of concentration.</p>
          <div className="settings-status"><Link className="link-quiet" href="/diagnostics">Open Stage 1 diagnostics <Icon name="arrow" /></Link></div>
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
