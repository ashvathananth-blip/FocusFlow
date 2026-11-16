'use client';
import Link from 'next/link';
import {Button} from '@/components/ui/button';
import {Icon} from '@/components/ui/icon';
import {StatusBadge} from '@/components/ui/status-badge';
import {useShieldSettingsStatus, type ShieldConnection} from '@/hooks/useShieldSettingsStatus';

function tone(connection: ShieldConnection, blocking: boolean) {
  if (connection === 'connected' && blocking) return 'is-live';
  if (connection === 'checking' || connection === 'reconnecting') return 'is-warn';
  return '';
}
function headline(connection: ShieldConnection, blocking: boolean, sessionActive: boolean, masterEnabled = true, permissionMissingCount = 0, hasStatus = false) {
  if (connection === 'missing') return 'Extension not detected';
  if (connection === 'checking') return 'Checking extension connection';
  if (connection === 'reconnecting') return hasStatus ? 'Extension connected · reconnecting' : 'Looking for the extension…';
  if (blocking) return sessionActive ? 'Blocking active' : 'Blocking active outside session';
  if (!masterEnabled) return 'Blocking turned off manually';
  if (permissionMissingCount > 0) return 'Permissions required';
  return sessionActive ? 'Session active · no enabled sites to block' : 'Ready — starts with study session';
}
function SetupSteps() {
  return <div className="shield-setup">
    <p className="page-description">Focus Flow stays fully usable without the extension. To connect it, load the Distraction Shield from this project&apos;s <code>extension/</code> folder.</p>
    <ol className="shield-steps">
      <li>Open <code>chrome://extensions</code> and enable Developer mode.</li>
      <li>Choose Load unpacked and select the <code>extension</code> folder.</li>
      <li>Reload this page, then grant website access in the extension popup.</li>
    </ol>
  </div>;
}
export function WebsiteBlockerStatus() {
  const { connection, status, manage, manageError } = useShieldSettingsStatus();
  const connected = connection === 'connected';
  return <section id="settings-website-blocker" className="settings-section" aria-labelledby="website-blocker-title">
    <div className="settings-heading"><Icon name="shield" /><h2 id="website-blocker-title">Website blocker</h2></div>
    <div className="shield-state" aria-live="polite" role="status">
      <span className={`connection ${tone(connection, !!status?.blockingActive)}`}><span className="connection-dot" aria-hidden="true" />{headline(connection, !!status?.blockingActive, !!status?.sessionActive, status?.masterEnabled, status?.permissionMissingCount, !!status)}</span>
      {connected && status && <StatusBadge status={status.blockingActive ? 'focused' : 'unknown'}>{`Website Blocking ${status.masterEnabled ? 'ON' : 'OFF'} · ${status.sessionActive ? 'Study session active' : 'No live session'}`}</StatusBadge>}
    </div>
    {connected && status
      ? <>
          <dl className="shield-counts">
            <div><dt>Blocked now</dt><dd>{status.activelyBlockedDomainCount}</dd></div>
            <div><dt>Enabled sites</dt><dd>{status.enabledDomainCount}</dd></div>
            <div><dt>Configured</dt><dd>{status.configuredDomainCount}</dd></div>
            <div><dt>Permitted</dt><dd>{status.permittedDomainCount}</dd></div>
            <div><dt>Rules installed</dt><dd>{status.installedRuleCount}</dd></div>
            <div><dt>Missing access</dt><dd className={status.permissionMissingCount > 0 ? 'shield-permission' : ''}>{status.permissionMissingCount}</dd></div>
          </dl>
          <p className="page-description">Focus Flow reads connection, session and rule counts only. Website names and extension storage stay inside the Chrome extension.</p>
          <div className="inline-actions"><Button onClick={manage}><Icon name="external" />Manage blocked websites</Button></div>
        </>
      : <SetupSteps />}
    {connected && status?.permissionMissingCount ? <p className="page-description shield-permission">{status.permissionMissingCount} enabled site{status.permissionMissingCount === 1 ? '' : 's'} still need Chrome host access. Grant it from the extension popup or options page. Without it, that site is not blocked.</p> : null}
    {manageError && <p className="page-description shield-permission" role="alert" aria-live="assertive">{manageError}</p>}
    <p className="shield-note">Editing the website list happens only in the extension. Focus Flow cannot add or remove domains.</p>
  </section>;
}
export function ShieldRailPanel() {
  const { connection, status, manage, manageError } = useShieldSettingsStatus();
  const connected = connection === 'connected';
  return <section className="rail-panel shield-panel" aria-label="Distraction Shield">
    <div className="rail-head"><h2 className="panel-title"><Icon name="shield" />Distraction Shield</h2></div>
    <div className="shield-state" aria-live="polite" role="status">
      <span className={`connection ${tone(connection, !!status?.blockingActive)}`}><span className="connection-dot" aria-hidden="true" />{headline(connection, !!status?.blockingActive, !!status?.sessionActive, status?.masterEnabled, status?.permissionMissingCount, !!status)}</span>
      {connected && status && <span className="shield-note">{status.activelyBlockedDomainCount} of {status.enabledDomainCount} blocked</span>}
    </div>
    {connected && status
      ? <>
          <dl className="shield-counts">
            <div><dt>Blocked</dt><dd>{status.activelyBlockedDomainCount}</dd></div>
            <div><dt>Sites</dt><dd>{status.enabledDomainCount}</dd></div>
            <div><dt>Missing access</dt><dd className={status.permissionMissingCount > 0 ? 'shield-permission' : ''}>{status.permissionMissingCount}</dd></div>
          </dl>
          <Button variant="outline" onClick={manage}><Icon name="external" />Manage websites</Button>
        </>
      : <p className="shield-note">{connection === 'missing' ? <>Install the companion extension to block distracting sites during sessions. <Link href="/settings#settings-website-blocker">Setup steps</Link>.</> : 'Waiting for the extension to acknowledge this page.'}</p>}
    <p className="shield-note">The website list is edited in the Chrome extension.</p>
    {manageError && <p className="shield-note shield-permission" role="alert">{manageError}</p>}
  </section>;
}
