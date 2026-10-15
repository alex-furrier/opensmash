"""Stage an allowlisted source/frontend release, or verified private helper inputs.

No services are installed and no current-release pointer is changed.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import subprocess

SOURCE_PREFIXES = ('web-prototype/server/', 'web-prototype/shared/', 'engines/melee/server/',
                   'engines/melee/tools/', 'engines/melee/opensmash_melee/', 'engines/melee/runtime/',
                   'engines/melee/web/lib/', 'web-prototype/visual/assets/')
SOURCE_FILES = {'LICENSE', 'engines/melee/upstream.json', 'engines/melee/requirements.txt',
                'engines/melee/web/public/catalog.json', 'web-prototype/package.json',
                'web-prototype/config/characters.json', 'web-prototype/config/baked-assets.json',
                'web-prototype/config/demo.js', 'web-prototype/config/trailer.js',
                'web-prototype/package-lock.json', 'web-prototype/pnpm-lock.yaml'}
FORBIDDEN = {'.git', 'node_modules', '__pycache__', '.env', 'build', 'data', '.aws', '.codex'}
FORBIDDEN_SUFFIXES = {'.iso', '.gcm', '.rvz', '.pem', '.key', '.p12', '.pyc'}


def safe_name(name):
    path = PurePosixPath(name)
    if path.is_absolute() or '..' in path.parts or not path.parts or '\\' in name:
        raise ValueError('Invalid package path: ' + name)
    if name == 'engines/melee/build/direct-c/melee-audio.wasm':
        return path
    if any(part in FORBIDDEN or part.startswith('.env.') for part in path.parts) or path.suffix.lower() in FORBIDDEN_SUFFIXES:
        raise ValueError('Forbidden package path: ' + name)
    return path


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def regular(root, name):
    rel = PurePosixPath(name)
    if rel.is_absolute() or '..' in rel.parts or '\\' in name:
        raise ValueError('Invalid input path')
    if root.is_symlink():
        raise ValueError('Symlink input root')
    path = root
    for part in rel.parts:
        path = path / part
        if path.is_symlink():
            raise ValueError('Symlink input: ' + name)
    if not path.is_file():
        raise ValueError('Missing regular input: ' + name)
    return path


def write_file(root, name, raw):
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw)
    path.chmod(0o644)


def package(repo, frontend, output, audio_wasm=None, build_receipt=None):
    repo, frontend, output = map(lambda p: Path(p).absolute(), (repo, frontend, output))
    if output.exists():
        raise ValueError('Release destination already exists; preserve prior releases')
    if subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=no'], cwd=repo).strip():
        raise ValueError('Commit source changes before staging a release')
    commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip()
    tree = subprocess.check_output(['git', 'ls-tree', '-r', '-z', 'HEAD'], cwd=repo).split(b'\0')
    files = {}
    # Inspect the complete selection before creating output; Git blob modes prevent symlink escapes.
    for entry in tree:
        if not entry:
            continue
        meta, encoded = entry.split(b'\t', 1)
        name = encoded.decode()
        if name not in SOURCE_FILES and not name.startswith(SOURCE_PREFIXES):
            continue
        safe_name(name)
        mode, kind, blob = meta.split()
        if mode not in (b'100644', b'100755') or kind != b'blob':
            raise ValueError('Source must be regular Git blobs: ' + name)
        files[name] = subprocess.check_output(['git', 'cat-file', 'blob', blob.decode()], cwd=repo)
    if not frontend.is_dir() or frontend.is_symlink():
        raise ValueError('Built frontend directory required')
    for path in sorted(frontend.rglob('*')):
        name = path.relative_to(frontend).as_posix()
        safe_name(name)
        if path.is_symlink():
            raise ValueError('Frontend symlink: ' + name)
        if path.is_file():
            # Build output only; source maps can leak source and are unnecessary for serving.
            if path.suffix not in ('.html', '.js', '.css', '.svg', '.png', '.webp', '.ico', '.woff', '.woff2', '.webmanifest', '.json', '.txt', '.glb', '.wasm', '.mp3', '.wav', '.mp4'):
                raise ValueError('Unexpected frontend asset: ' + name)
            files['web-prototype/dist/' + name] = path.read_bytes()
    if 'web-prototype/dist/index.html' not in files:
        raise ValueError('Frontend index missing')
    if build_receipt is not None:
        receipt = json.loads(Path(build_receipt).read_text())
        dist_hashes = {n[len('web-prototype/dist/'):]: hashlib.sha256(v).hexdigest() for n, v in files.items() if n.startswith('web-prototype/dist/')}
        if receipt.get('sourceCommit') != commit or receipt.get('frontendFiles') != dist_hashes or not receipt.get('toolchain'):
            raise ValueError('Build receipt does not match source/frontend/toolchain')
        for name, expected in receipt.get('lockFiles', {}).items():
            if name not in files or hashlib.sha256(files[name]).hexdigest() != expected:
                raise ValueError('Build lock hash mismatch')
        if not receipt.get('lockFiles'):
            raise ValueError('Build receipt needs dependency lock hashes')
        files['build-receipt.json'] = (json.dumps(receipt, sort_keys=True) + '\n').encode()
    if audio_wasm is not None:

        audio_wasm = Path(audio_wasm)
        files['engines/melee/build/direct-c/melee-audio.wasm'] = regular(audio_wasm.parent, audio_wasm.name).read_bytes()
    manifest = {'schema': 1, 'sourceCommit': commit, 'files': {n: hashlib.sha256(v).hexdigest() for n, v in sorted(files.items())}}
    output.mkdir(parents=True, mode=0o700)
    for name, raw in files.items():
        write_file(output, name, raw)
    write_file(output, 'release.json', (json.dumps(manifest, indent=2) + '\n').encode())
    return manifest


def verify(release):
    release = Path(release)
    manifest = json.loads(regular(release, 'release.json').read_text())
    for name, expected in manifest['files'].items():
        safe_name(name)
        if digest(regular(release, name)) != expected:
            raise ValueError('Release hash mismatch: ' + name)
    dependencies = manifest.get('dependencies', {})
    for name, expected in dependencies.items():
        path = release / name
        if not name.startswith('web-prototype/node_modules/') or not path.resolve().is_relative_to((release / 'web-prototype/node_modules').resolve()):
            raise ValueError('Dependency escapes release')
        if digest(path) != expected:
            raise ValueError('Dependency hash mismatch: ' + name)
    listed = set(manifest['files']) | set(dependencies) | {'release.json'}
    for path in release.rglob('*'):
        if path.is_file() or path.is_symlink():
            name = path.relative_to(release).as_posix()
            if name not in listed:
                raise ValueError('Unexpected release file: ' + name)
    return manifest


def seal_dependencies(release):
    """Freeze an already installed dependency layer; does not run an installer."""
    release = Path(release)
    manifest = json.loads(regular(release, 'release.json').read_text())
    root = release / 'web-prototype/node_modules'
    if root.is_symlink() or not root.is_dir():
        raise ValueError('Install dependencies inside release, not an external symlink')
    dependencies = {}
    for path in root.rglob('*'):
        if path.is_symlink() and (not path.resolve().is_relative_to(root.resolve()) or not path.is_file()):
            raise ValueError('Dependency symlink escape/directory link')
        if path.is_file():
            dependencies[path.relative_to(release).as_posix()] = digest(path)
    if not dependencies:
        raise ValueError('Empty dependency layer')
    manifest['dependencies'] = dict(sorted(dependencies.items()))
    (release / 'release.json').write_text(json.dumps(manifest, indent=2) + '\n')
    verify(release)
    return manifest


def stage_helper(release, inputs, output):
    """Inputs is an owner-private receipt: {root, files:{relative:sha256}}.

    Only game templates and fitter outputs are accepted. No disc or private roster
    is captured; source imports/roster remain external command arguments.
    """
    verify(release)
    receipt = json.loads(Path(inputs).read_text())
    root, output = Path(receipt['root']), Path(output)
    if output.exists():
        raise ValueError('Helper destination exists')
    selected = {}
    for name, expected in receipt['files'].items():
        if not name.startswith(('assets/game/', 'build/web-game/', 'build/native-fit/', 'build/direct-c/')):
            raise ValueError('Input outside helper allowlist: ' + name)
        if Path(name).suffix.lower() in FORBIDDEN_SUFFIXES:
            raise ValueError('Disc/credential input forbidden')
        path = regular(root, name)
        if digest(path) != expected:
            raise ValueError('Helper input hash mismatch: ' + name)
        selected[name] = path
    output.mkdir(parents=True, mode=0o700)
    manifest = verify(release)
    prefix = 'engines/melee/'
    for name in manifest['files']:
        if name.startswith(prefix):
            write_file(output, name[len(prefix):], regular(Path(release), name).read_bytes())
    for name, path in selected.items():
        write_file(output, name, path.read_bytes())
    write_file(output, 'helper-inputs.json', (json.dumps({'sourceCommit': manifest['sourceCommit'], 'files': receipt['files']}, indent=2) + '\n').encode())
    return {'sourceCommit': manifest['sourceCommit'], 'inputCount': len(selected)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    p = sub.add_parser('package'); p.add_argument('--repo', type=Path, required=True); p.add_argument('--frontend', type=Path, required=True); p.add_argument('--output', type=Path, required=True); p.add_argument('--audio-wasm', type=Path, required=True); p.add_argument('--build-receipt', type=Path, required=True)
    p = sub.add_parser('verify'); p.add_argument('release', type=Path)
    p = sub.add_parser('seal-dependencies'); p.add_argument('release', type=Path)
    p = sub.add_parser('helper'); p.add_argument('--release', type=Path, required=True); p.add_argument('--inputs', type=Path, required=True); p.add_argument('--output', type=Path, required=True)
    a = parser.parse_args()
    result = package(a.repo, a.frontend, a.output, a.audio_wasm, a.build_receipt) if a.command == 'package' else verify(a.release) if a.command == 'verify' else seal_dependencies(a.release) if a.command == 'seal-dependencies' else stage_helper(a.release, a.inputs, a.output)
    print(json.dumps({'sourceCommit': result['sourceCommit'], 'verified': True}))


if __name__ == '__main__':
    main()
