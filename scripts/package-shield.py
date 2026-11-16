"""Build a reproducible unpacked-extension ZIP with manifest.json at its root."""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parents[1]
source = root / 'extension'
manifest = json.loads((source / 'manifest.json').read_text())
output = root / 'public/downloads/focusflow-distraction-shield.zip'
output.parent.mkdir(parents=True, exist_ok=True)
files = sorted(p for p in source.iterdir() if p.suffix in {'.js', '.json', '.html', '.css', '.md'})
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in files:
        info = zipfile.ZipInfo(path.name, (2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, path.read_bytes())
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert json.loads(archive.read('manifest.json')) == manifest
    for name in ['background.js', 'lib.js', 'content.js', 'popup.html', 'options.html', 'blocked.html']:
        assert name in archive.namelist()
checksum = hashlib.sha256(output.read_bytes()).hexdigest()
(root / 'release/SHA256SUMS').write_text(f'{checksum}  {output.name}\n')
print(f'{output.relative_to(root)} ({output.stat().st_size} bytes), v{manifest["version"]}\nSHA256 {checksum}')
