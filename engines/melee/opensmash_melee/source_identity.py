"""Canonical roster labels for rendered assets, without changing imported sources."""
import hashlib
import json
from pathlib import Path
import shutil
import tempfile


def presentation_source(root, source, display_name=None):
    source = Path(source).resolve()
    if not display_name:
        return source
    if not isinstance(display_name, str) or not display_name.strip() or len(display_name) > 80:
        raise ValueError('Invalid private roster display name.')
    display_name = display_name.strip()
    original = (source / 'character.json').read_bytes()
    identity = json.loads(original)
    if identity.get('name') == display_name and identity.get('display') == display_name:
        return source
    # All rendered name surfaces use the alias. The source signature, slug,
    # geometry, voice and original metadata remain owned by the source export.
    identity.update(name=display_name, display=display_name, short=display_name)
    assets = sorted(source.iterdir())
    key = hashlib.sha256(b'presentation-source-v1\0' + str(source).encode() + b'\0' + original + b'\0'
                         + display_name.encode() + b'\0' + json.dumps([p.name for p in assets]).encode()).hexdigest()
    directory = Path(root) / 'build/presentation-sources'
    destination = directory / key
    if destination.is_dir():
        return destination
    directory.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix='.identity-', dir=directory))
    try:
        for asset in assets:
            if asset.name != 'character.json':
                (staging / asset.name).symlink_to(asset, target_is_directory=asset.is_dir())
        (staging / 'character.json').write_text(json.dumps(identity) + '\n')
        try:
            staging.rename(destination)
        except OSError:
            if not destination.is_dir():
                raise
    finally:
        if staging.exists():
            shutil.rmtree(staging)
    return destination
