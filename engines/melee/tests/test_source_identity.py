import hashlib
import json
from pathlib import Path
import struct
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image

from opensmash_melee.archive import Archive
from opensmash_melee.character_select import catalog_identities, character_select_assets, extend_menu, SYMBOL
from opensmash_melee.native_source import prepare
from opensmash_melee.presentation import panel
from opensmash_melee.source_identity import presentation_source
from opensmash_melee.targets import BY_SLUG, cache_id


class SourceIdentityTests(unittest.TestCase):
    slug = 'import-0123456789abcdef01234567'
    source_name = 'Legacy Source'
    display_name = 'Canonical Display'
    short_name = 'CANONICAL'

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.source = self.root / 'assets/characters' / cache_id(self.slug, 'marth', 'marth')
        self.source.mkdir(parents=True)
        self.original = {'name': self.source_name, 'display': self.source_name, 'short': self.short_name}
        (self.source / 'character.json').write_text(json.dumps(self.original))
        (self.source / 'rigged.glb').write_bytes(b'unchanged geometry')
        Image.new('RGBA', (80, 100), 'red').save(self.source / 'portrait_raw.png')
        Image.new('RGBA', (32, 32), 'blue').save(self.source / 'stock_raw.png')
        Image.new('L', (32, 32), 'white').save(self.source / 'emblem_stencil.png')
        (self.source / 'announcer.wav').write_bytes(b'unchanged audio')

    def test_alias_changes_rendered_identity_without_touching_source_or_assets(self):
        before = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in self.source.iterdir()}
        canonical = presentation_source(self.root, self.source, self.display_name)
        identity = json.loads((canonical / 'character.json').read_text())
        self.assertEqual(identity, {'name': self.display_name, 'display': self.display_name, 'short': self.display_name})
        self.assertEqual((canonical / 'rigged.glb').resolve(), self.source / 'rigged.glb')
        self.assertEqual(before, {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in self.source.iterdir()})
        self.assertEqual(canonical, presentation_source(self.root, self.source, self.display_name))
        # Exercise the real raster title consumer, using independently authored
        # canonical metadata as the reference rather than only checking JSON.
        reference = self.root / 'reference'
        reference.mkdir()
        for p in self.source.iterdir():
            if p.name != 'character.json': (reference / p.name).symlink_to(p)
        (reference / 'character.json').write_text(json.dumps(identity))
        self.assertEqual(panel(canonical).info['title'].tobytes(), panel(reference).info['title'].tobytes())
        self.assertNotEqual(panel(canonical).info['title'].tobytes(), panel(self.source).info['title'].tobytes())

    def test_no_alias_preserves_existing_short_and_source(self):
        self.assertEqual(presentation_source(self.root, self.source), self.source)
        regular = dict(self.original, name=self.display_name, display=self.display_name)
        (self.source / 'character.json').write_text(json.dumps(regular))
        self.assertEqual(presentation_source(self.root, self.source, self.display_name), self.source)
        self.assertEqual(json.loads((self.source / 'character.json').read_text())['short'], self.short_name)

    def test_native_revision_includes_alias_and_never_reuses_stale_baked_identity(self):
        built = []
        def build(args, **kwargs):
            source = Path(args[args.index('--source') + 1])
            identity = json.loads((source / 'character.json').read_text())
            built.append(identity['display'])
            output = Path(args[args.index('--output') + 1]) / 'sources'
            output.mkdir()
            for suffix in ('.json', '.rgba8', '.identity.dat'):
                (output / (self.slug + suffix)).write_bytes(identity['display'].encode())
            return subprocess.CompletedProcess(args, 0, '', '')
        with patch('opensmash_melee.native_source.subprocess.run', side_effect=build):
            original = prepare(self.root, self.source, self.slug)
            revision = self.root / 'build/native-fit/local/revisions' / original['base'].split('/')[-3]
            # Simulate a portable package baked with the old source identity.
            for suffix in ('.json', '.rgba8', '.identity.dat'):
                (self.source / ('melee-source' + suffix)).write_bytes((revision / 'sources' / (self.slug + suffix)).read_bytes())
            (self.source / 'melee-source-ready.json').write_bytes((revision / 'ready.json').read_bytes())
            canonical = prepare(self.root, self.source, self.slug, display_name=self.display_name)
            self.assertNotEqual(original['base'], canonical['base'])
            self.assertEqual(built, [self.source_name, self.display_name])
            self.assertTrue(prepare(self.root, self.source, self.slug, display_name=self.display_name)['cached'])
            overlay = presentation_source(self.root, self.source, self.display_name)
            (self.source / 'melee-source-pivot.json').write_text('{"version":1}')
            refreshed = presentation_source(self.root, self.source, self.display_name)
            self.assertNotEqual(refreshed, overlay)
            self.assertEqual((refreshed / 'melee-source-pivot.json').read_text(), '{"version":1}')
            with_asset = prepare(self.root, self.source, self.slug, display_name=self.display_name)
            self.assertNotEqual(with_asset['base'], canonical['base'])
            self.assertFalse(with_asset['cached'])
            self.assertEqual(built[-1], self.display_name)
            changed = prepare(self.root, self.source, self.slug, display_name='Updated Display')
            self.assertNotEqual(changed['base'], canonical['base'])
            self.assertEqual(built[-1], 'Updated Display')

    def test_selected_player_header_uses_alias_for_all_six_validated_targets(self):
        catalog = {self.slug: {'slug': self.slug, 'name': self.source_name, 'target': 'marth',
                              'displayName': self.display_name, 'imported': True}}
        a = Archive(struct.pack('>5I', 32, 0, 0, 0, 0) + bytes(12))
        table = a.alloc(144)
        for offset in (64, 112):
            root, child = a.alloc(64), a.alloc(64)
            a.pointer(root + 8, child)
            a.pointer(table + offset, root)
        a.public.append((table, 0)); a.strings = b'MnSelectChrDataTable\0'
        original = a.serialize()
        for target in ['marth', 'captain-falcon', 'mario', 'falco', 'ness', 'ganondorf']:
            with self.subTest(target=target):
                spec = BY_SLUG[target]
                costume = {'character': self.slug, 'target': target, 'fighter': spec['fighter'],
                           'color': 0, 'filename': spec['costumes'][0]['filename']}
                variant = self.source.parent / cache_id(self.slug, target, 'marth')
                if variant != self.source: variant.symlink_to(self.source, target_is_directory=True)
                for source_only in [True, False]:
                    entries = catalog_identities(self.root, catalog, [costume], source_root=self.root / 'unused' if source_only else None)
                    result = Archive(extend_menu(original, entries, [318]))
                    record = result.roots()[SYMBOL]
                    start = result.ptr(record + 16 + 24)
                    raw = bytes(result.data[start:]).split(b'\0', 1)[0]
                    expected = ''.join('\u3000' if c == ' ' else chr(ord(c) + 0xFEE0) for c in self.display_name).encode('shift_jis')
                    self.assertEqual(raw, expected)
                    self.assertNotIn(self.source_name, json.dumps(json.loads((entries[0][2] / 'character.json').read_text())))
        self.assertEqual(json.loads((self.source / 'character.json').read_text()), self.original)

    def test_character_select_cache_invalidates_when_canonical_display_changes(self):
        game = self.root / 'game'
        for name in ['audio/nr_select.ssm', 'audio/us/nr_select.ssm', 'MnSlChr.dat', 'MnSlChr.usd']:
            path = game / 'files' / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b'original game')
        def menu(raw, entries, *args):
            return (entries[0][2] / 'character.json').read_bytes()
        with patch('opensmash_melee.character_select.extend_menu', side_effect=menu) as build, \
             patch('opensmash_melee.character_select.extend_sound_bank', return_value=(b'bank', [318])), \
             patch('opensmash_melee.character_select.dsp_clip', return_value=(b'', 32000, 0, [])):
            def run(label):
                source = presentation_source(self.root, self.source, label)
                return character_select_assets(game, [(8, 0, source)], cache=self.root / 'menu-cache')
            first = run(self.display_name)
            self.assertEqual(run(self.display_name), first)
            self.assertEqual(build.call_count, 2)
            self.assertNotEqual(run('Updated Display'), first)
            self.assertEqual(build.call_count, 4)


if __name__ == '__main__': unittest.main()
