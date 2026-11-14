import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const version = '0.10.22-rc.20250304';
const modelUrl = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const root = fileURLToPath(new URL('../', import.meta.url));
const manifestPath = path.join(root, 'public/vision-assets.json');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function check() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.packageVersion !== version || manifest.modelUrl !== modelUrl) throw new Error('Asset version mismatch');
  for (const file of manifest.files) {
    const bytes = await readFile(path.join(root, 'public', file.path));
    if (hash(bytes) !== file.sha256 || bytes.length !== file.bytes) throw new Error(`Asset integrity mismatch: ${file.path}`);
  }
  console.log(`Verified ${manifest.files.length} self-hosted assets and SHA-256 hashes`);
}
try {
  if (process.argv.includes('--check')) { await check(); }
  else {
    const entry = require.resolve('@mediapipe/tasks-vision');
    const packageRoot = path.dirname(entry);
    const pkg = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
    if (pkg.version !== version) throw new Error(`Expected MediaPipe ${version}; found ${pkg.version}`);
    const names = ['vision_wasm_internal.js','vision_wasm_internal.wasm','vision_wasm_nosimd_internal.js','vision_wasm_nosimd_internal.wasm'];
    const files = [];
    for (const name of names) files.push({ path: `mediapipe/${version}/${name}`, bytes: await readFile(path.join(packageRoot, 'wasm', name)) });
    const response = await fetch(modelUrl, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Model download failed: HTTP ${response.status}`);
    const model = Buffer.from(await response.arrayBuffer());
    if (model.length < 1000000) throw new Error('Downloaded model is unexpectedly small');
    files.push({ path: 'models/face_landmarker-float16-v1.task', bytes: model });
    // Fixed upstream model version (float16/1), never latest. Preserve the first
    // downloaded integrity manifest; later downloads must match its hashes.
    let previous;
    try { previous = JSON.parse(await readFile(manifestPath, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    for (const file of files) {
      const expected = previous?.files.find(f => f.path === file.path);
      if (expected && expected.sha256 !== hash(file.bytes)) throw new Error(`Upstream bytes changed: ${file.path}`);
    }
    for (const file of files) {
      const target = path.join(root, 'public', file.path);
      await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, file.bytes);
    }
    await writeFile(manifestPath, JSON.stringify({ packageVersion: version, modelUrl, files: files.map(f => ({ path: f.path, bytes: f.bytes.length, sha256: hash(f.bytes) })) }, null, 2)+'\n');
    await check();
  }
} catch (error) { console.error(`Vision asset setup failed: ${error.message}`); process.exitCode = 1; }
