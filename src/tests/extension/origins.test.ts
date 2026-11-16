import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { isAllowedShieldOrigin, SHIELD_ALLOWED_ORIGINS } from '@/lib/extension/bridge';
// The extension library also exports CommonJS for the Node test harness.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const F = require('../../../extension/lib.js');

describe('explicit Shield origin allowlist', () => {
  it('keeps the manifest, website, and extension allowlists aligned', () => {
    const manifest = JSON.parse(readFileSync('extension/manifest.json', 'utf8'));
    expect(F.ALLOWED_ORIGINS).toEqual(SHIELD_ALLOWED_ORIGINS);
    expect(manifest.host_permissions).toEqual(SHIELD_ALLOWED_ORIGINS.map(origin => origin + '/*'));
    expect(manifest.content_scripts[0].matches).toEqual(manifest.host_permissions);
  });
  it('accepts only matching sender and tab origins from the explicit list', () => {
    for (const origin of SHIELD_ALLOWED_ORIGINS) {
      expect(isAllowedShieldOrigin(origin)).toBe(true);
      expect(F.trustedWebsiteSender({ origin, tab: { url: origin + '/study' } })).toBe(true);
      expect(F.trustedWebsiteSender({ origin, tab: { url: 'https://evil.example/study' } })).toBe(false);
      for (const untrusted of [origin + '.evil.example', origin + '/study', 'https://preview.vercel.app', 'http://localhost:3001', 'http://127.0.0.1:3000']) {
        expect(isAllowedShieldOrigin(untrusted)).toBe(false);
        expect(F.trustedWebsiteSender({ origin: untrusted, tab: { url: untrusted + '/study' } })).toBe(false);
      }
    }
    expect(F.trustedWebsiteSender({})).toBe(false);
  });
});
