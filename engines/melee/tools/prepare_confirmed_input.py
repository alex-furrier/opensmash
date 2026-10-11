#!/usr/bin/env python3
"""Validate/apply the optional source patch in an isolated pinned engine checkout.

No clone, tool installation, build, network, or asset access is performed.
The normal clean-pin build path remains unchanged.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('checkout', type=Path)
parser.add_argument('--apply', action='store_true', help='Apply to an otherwise clean pinned checkout')
args = parser.parse_args()
root = args.checkout.resolve()
bundle = Path(__file__).resolve().parents[1] / 'runtime/patches/browser'
manifest = json.loads((bundle / 'confirmed-input.json').read_text())
patch = bundle / 'confirmed-input.patch'
if hashlib.sha256(patch.read_bytes()).hexdigest() != manifest['patchSha256']:
    raise SystemExit('Source patch hash mismatch.')
def git(*args):
    return subprocess.check_output(['git', *args], cwd=root, text=True).strip()
if git('rev-parse', 'HEAD') != manifest['baseRevision']:
    raise SystemExit('Use a separate checkout at the exact pinned engine revision.')
dirty = git('status', '--porcelain', '--untracked-files=normal')
if not dirty:
    subprocess.run(['git', 'apply', '--check', str(patch)], cwd=root, check=True)
    if not args.apply:
        print('Clean pin verified. Pass --apply to prepare the candidate source.')
        raise SystemExit(0)
    subprocess.run(['git', 'apply', str(patch)], cwd=root, check=True)
# A previously prepared candidate is accepted only when every changed file
# matches the reviewed bundle and no unrelated working-tree change exists.
changed = set(git('diff', '--name-only', 'HEAD').splitlines())
changed.update(git('ls-files', '--others', '--exclude-standard').splitlines())
if changed != set(manifest['files']):
    raise SystemExit('Candidate contains missing or unrelated source changes.')
for path, expected in manifest['files'].items():
    if hashlib.sha256((root / path).read_bytes()).hexdigest() != expected:
        raise SystemExit('Candidate source differs from the patch: ' + path)
subprocess.run(['git', 'apply', '--reverse', '--check', str(patch)], cwd=root, check=True)
print('Confirmed-input source verified: ' + manifest['patchSha256'])
print('Build with the existing pinned toolchain; start at two jobs.')
