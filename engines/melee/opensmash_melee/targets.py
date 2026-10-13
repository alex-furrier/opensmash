"""Shared target metadata and collision-free on-demand costume cache keys."""
import hashlib
import json
from pathlib import Path

OPTIONS = json.loads((Path(__file__).resolve().parents[1] / 'runtime/retarget-options.json').read_text())
BY_SLUG = {row['slug']: row for row in OPTIONS}
PLAYABLE = {key: row for key, row in BY_SLUG.items() if key != 'nana'}
STABLE = {'mario', 'luigi', 'captain-falcon', 'fox', 'marth', 'link'}
COMPANIONS = json.loads((Path(__file__).resolve().parents[1] / 'runtime/launch-options.json').read_text()).get('companions',{})

def costume_target_allowed(row,target):
    supported=row.get('supportedTargets')
    return supported is None or target in supported or any(COMPANIONS.get(base,{}).get('slug')==target for base in supported)

def cache_id(slug, target, default):
    if target not in BY_SLUG:
        raise ValueError('Unknown retarget')
    base = 'web-v1-' + hashlib.sha256(slug.encode()).hexdigest()[:16]
    return base if target == default else base + '-target-' + target
