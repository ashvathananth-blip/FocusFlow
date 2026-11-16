# Release preparation

Status: local release materials only; no GitHub Release created or published.

Before release, configure and verify the owner's exact production origin in the website and extension allowlists and manifest. Never use a wildcard Vercel origin. Run `npm test`, `npm run lint`, `npm run build`, then `python3 scripts/package-shield.py`. Verify the unpacked extension in Chrome on both allowed origins using `extension/README.md`.

The website downloads the same ZIP from `/downloads/focusflow-distraction-shield.zip`, so it does not depend on unpublished GitHub assets. Rebuild the ZIP after every extension edit and before the website build.

Optional demo: set `NEXT_PUBLIC_SHIELD_DEMO_URL` to an HTTPS video URL before building. The Watch Demo link is hidden when no URL is provided.

When GitHub write access is available, create a **draft** release targeting the commit containing the verified source, use `RELEASE_NOTES.md`, and attach the ZIP and checksum. Publishing requires the owner's explicit approval. Do not publish an outdated source tag.
