export function ShieldInstall() {
  const demoUrl = process.env.NEXT_PUBLIC_SHIELD_DEMO_URL;
  const safeDemoUrl = demoUrl && /^https:\/\//.test(demoUrl) ? demoUrl : null;
  return <section className="shield-install" aria-labelledby="shield-install-title">
    <div className="shield-install-heading">
      <div><p className="section-eyebrow">Veritas AI Hackathon · Free Chrome extension</p>
        <h2 id="shield-install-title">Install Distraction Shield</h2>
        <p className="page-description">Give your focus session a quieter browser. Block selected websites while you study, with a free manual install.</p>
      </div>
      <div className="shield-install-actions">
        <a className="app-button" href="/downloads/focusflow-distraction-shield.zip" download>Download Shield ZIP <span aria-hidden="true">↓</span></a>
        {safeDemoUrl && <a className="link-quiet" href={safeDemoUrl} target="_blank" rel="noreferrer">Watch Demo <span aria-hidden="true">↗</span></a>}
      </div>
    </div>
    <ol className="shield-install-steps">
      <li><span className="shield-step-number" aria-hidden="true">01</span><div><h3>Download and extract</h3><p>Download the ZIP above and extract it into a folder you can keep on your computer.</p></div></li>
      <li><span className="shield-step-number" aria-hidden="true">02</span><div><h3>Enable Developer mode</h3><p>Open <code>chrome://extensions</code> in Chrome and enable <strong>Developer mode</strong> in the top right.</p></div></li>
      <li><span className="shield-step-number" aria-hidden="true">03</span><div><h3>Load unpacked</h3><p>Click <strong>Load unpacked</strong> and select the extracted folder containing <code>manifest.json</code>.</p></div></li>
    </ol>
    <p className="shield-install-note">After installing, reload FocusFlow. Open the Shield popup and grant website permissions, then start a focus session. No payment or Chrome Web Store registration required.</p>
  </section>;
}
