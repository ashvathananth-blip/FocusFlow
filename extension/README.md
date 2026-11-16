# FocusFlow Distraction Shield (localhost configuration)

This Manifest V3 companion uses the service worker as the only owner of session/blocking state. Install by opening `chrome://extensions`, enabling **Developer mode**, choosing **Load unpacked**, and selecting this `extension/` directory. Incognito is disabled by default. Disabling or removing the extension disables the shield; this is a productivity aid, not tamper-proof enforcement.

## Permissions

`storage` persists session state and preferences; `alarms` reconciles stale session status when the worker sleeps; `declarativeNetRequestWithHostAccess` provides dynamic redirects while requiring explicit host grants. The extension requests host access individually for each default/custom domain before enabling its rules. Chrome displays a site-access prompt. Custom entries are hostnames only; schemes, paths, wildcards, IPs, localhost and extension/internal names are rejected. Redirected `blocked.html` is web-accessible because Chrome requires it for extensionPath redirects. Only the blocked-page assets are exposed.

The only trusted FocusFlow origin is `http://localhost:3000`. Production integration is unconfigured. Later, add the exact HTTPS origin (not `*.vercel.app`) to `host_permissions` and `content_scripts.matches`, add its exact match to the page bridge allowlist, and test that deployed origin.

## Behavior and limitations

The popup's **Website Blocking** master switch defaults ON. OFF removes all managed rules and never changes per-site preferences or the FocusFlow session. ON allows rules only during a live session or while **Keep blocking without live session** is enabled. Manual pause remains a live session. The master switch replaces the former Emergency disable control; legacy emergency-disabled state migrates to master OFF. The website Settings page receives only the read-only master state and aggregate status, and cannot change the switch.

While connected, session start/pause/resume and heartbeat keep blocking active when the master switch permits it; pause does not disable blocking. End/completion disables session blocking unless the user enabled **Keep blocking**. Missing heartbeats for 90 seconds mark synchronization lost and disable session blocking unless the user enabled **Keep blocking**. Background tab timer throttling may delay heartbeat/staleness checks; the 90-second policy requires real Chrome testing. Pagehide is not an end signal. Alarms handle periodic cleanup. Chrome host permissions are scoped by domain and scheme. The page bridge is not authentication against third-party scripts executing on the trusted origin.

## Testing

From repository root run `npm test`; validate the manifest with `node -e "JSON.parse(require('fs').readFileSync('extension/manifest.json'))"` and syntax-check scripts with `node --check extension/background.js` etc. Unit tests do not prove browser blocking.

Manual checks: install unpacked; open localhost FocusFlow; start a session; verify youtube.com, its mobile/music/www subdomains, youtu.be and other defaults redirect, while an unrelated site works; approve and deny custom-domain permission; verify pause keeps blocking and end disables it; check master ON/OFF, the keep-blocking override, and enabled/disabled websites; switch tabs/apps for over 90 seconds; restart Chrome and inspect reconciliation; verify unrelated websites cannot message the worker; run FocusFlow without the extension. Production origin integration and background timing remain unverified.

## Default-domain permission flow

Open the extension popup and choose **Grant default website permissions**. Chrome asks for access to HTTP and HTTPS hosts for youtube.com, youtu.be, instagram.com, reddit.com and tiktok.com; Chrome's `*.domain` match patterns include the root host and its subdomains. You may grant all or only some. The popup lists missing domains, and the service worker installs redirects only for granted domains while a live session (including manual pause) is active. It reads the installed dynamic rules back from Chrome before reporting protection. Session end/completion removes those rules. The manifest uses `declarativeNetRequestWithHostAccess`, plus optional per-domain host permissions; Chrome requires host access for redirect actions. The redirect target files are declared web-accessible only for the blocked domain origins.

## Website preferences

Choose **Manage blocked websites** in the popup, or **Manage blocked websites** in FocusFlow Settings while the localhost extension connection is active. The extension options page is the only place that changes the domain list. It uses versioned records (`domain`, `enabled`, `isDefault`); legacy string lists migrate in place without changing session or domain preferences. The upgrade also removes obsolete temporary-access records and their alarms. Defaults can be disabled but not removed. Custom domains can be removed. Changes during a live session require confirmation before disabling/removing a domain. Each enabled domain needs explicit optional host access for HTTP and HTTPS; denied or revoked access leaves its rule uninstalled and is shown as missing. Disabled domains retain any previously granted Chrome permission so they can be re-enabled without prompting again.

The website's `status_request` bridge response is read-only and contains only connection/session/protection booleans and counts; it never returns domain names, storage, or rule IDs. Its `open_settings` bridge command has no destination arguments and only opens the extension-owned options page. Domain mutations are accepted only from extension pages by the service worker.

The blocked page does not retain or reconstruct the original URL. The DNR extensionPath redirect supplies the configured domain in its fixed redirect target, not the full intercepted URL. Capturing full main-frame destinations would require Chrome's broad `webNavigation` permission, which reports navigation URLs and triggers a permission warning. FocusFlow does not request that browsing-history-like capability; the blocked page offers a fixed **Return to FocusFlow** link. No unvalidated URL is navigated.
