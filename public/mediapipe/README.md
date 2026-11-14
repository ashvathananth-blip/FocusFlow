# MediaPipe WASM

Pinned package: `@mediapipe/tasks-vision@0.10.22-rc.20250304`.
Run `npm install` then `npm run assets:prepare` from the repository root.
This copies SIMD and non-SIMD WASM binaries and their JS loaders from the exact
installed package to `public/mediapipe/0.10.22-rc.20250304/`. There is no runtime CDN.
`npm run assets:check` verifies the generated SHA-256 manifest.

The implementation environment had network access disabled. These binaries are
NOT currently present. This README is not a WASM asset.
