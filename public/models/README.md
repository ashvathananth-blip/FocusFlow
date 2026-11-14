# Face Landmarker model

Runtime path: `/models/face_landmarker-float16-v1.task`.
Pinned source: https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task

Run `npm install` then `npm run assets:prepare` from the repository root.
The script downloads version float16/1 (never latest), generates a SHA-256
manifest in `public/vision-assets.json`, and checks subsequent downloads against
that manifest. Commit the downloaded assets and manifest for a self-hosted demo.

The implementation environment had network access disabled. The binary was NOT
downloaded. This README is not a model and cannot enable inference.
