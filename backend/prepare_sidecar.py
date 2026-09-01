"""Explicit release-only build; refuse stale or unverified sidecars."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT.parent / 'frontend' / 'src-tauri' / 'binaries'


def source_hash():
    sources = [p for folder in ('api', 'core', 'services') for p in (ROOT / folder).rglob('*.py')]
    sources += list(ROOT.glob('*.py')) + list(ROOT.glob('requirements*.txt')) + [ROOT / 'bemo-api.spec']
    digest = hashlib.sha256()
    for path in sorted(sources):
        digest.update(path.relative_to(ROOT).as_posix().encode() + b'\0' + path.read_bytes() + b'\0')
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--verify', action='store_true')
    parser.add_argument('--target', default=os.getenv('TAURI_ENV_TARGET_TRIPLE', 'x86_64-pc-windows-msvc'))
    args = parser.parse_args()
    if args.target != 'x86_64-pc-windows-msvc':
        parser.error('Only the Windows x64 desktop release is configured; do not reuse its binary on other targets.')
    target = OUTPUT / f'bemo-api-{args.target}.exe'
    manifest_path = OUTPUT / f'{args.target}.json'
    fingerprint = source_hash()
    if args.verify:
        manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {}
        if not target.exists() or manifest.get('source_sha256') != fingerprint or manifest.get('binary_sha256') != hashlib.sha256(target.read_bytes()).hexdigest():
            raise SystemExit('Sidecar missing or stale. Use npm run build:desktop with the pinned Python build environment.')
        print('Sidecar matches current source and binary digest.')
        return
    if sys.platform != 'win32':
        parser.error('Build the Windows sidecar on Windows.')
    OUTPUT.mkdir(parents=True, exist_ok=True)
    subprocess.run([sys.executable, '-m', 'PyInstaller', '--noconfirm', '--distpath', str(OUTPUT),
                    '--workpath', str(ROOT / 'build' / 'desktop'), str(ROOT / 'bemo-api.spec')], cwd=ROOT, check=True)
    built = OUTPUT / 'bemo-api.exe'
    os.replace(built, target)
    manifest_path.write_text(json.dumps({'source_sha256': fingerprint, 'binary_sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
                                         'target': args.target}, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
