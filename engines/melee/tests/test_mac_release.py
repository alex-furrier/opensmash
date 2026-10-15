import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

TOOLS = Path(__file__).resolve().parents[1] / 'tools'
sys.path.insert(0, str(TOOLS))
import package_mac_release as package
import mac_hosting_service as service


class MacReleaseTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.repo = self.root / 'repo'; self.repo.mkdir()
        subprocess.run(['git', 'init', '-q', str(self.repo)], check=True)
        self.git('config', 'user.name', 'Fixture'); self.git('config', 'user.email', 'fixture@example.invalid')
        self.put('LICENSE', 'license')
        self.put('web-prototype/server/index.js', 'source')
        self.put('engines/melee/tools/serve_melee.py', 'helper')
        self.put('engines/melee/requirements.txt', 'numpy==2.0')
        self.put('web-prototype/package-lock.json', '{}')
        self.put('web-prototype/pnpm-lock.yaml', 'lockfileVersion: 9')
        self.put('engines/melee/tools/netplay/package-lock.json', '{}')
        self.put('private/password.json', 'never capture')
        self.put('secrets.iso', 'never capture')
        self.git('add', '.'); self.git('commit', '-qm', 'Fixture')
        self.frontend = self.root / 'dist'; self.frontend.mkdir()
        (self.frontend / 'index.html').write_text('frontend')
        (self.frontend / 'assets').mkdir(); (self.frontend / 'assets/main.js').write_text('compiled')
        self.release = self.root / 'release'

    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.repo)

    def put(self, name, text):
        path = self.repo / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_text(text)

    def stage(self):
        return package.package(self.repo, self.frontend, self.release)

    def test_allowlisted_git_blobs_and_hashes(self):
        result = self.stage()
        self.assertIn('web-prototype/dist/assets/main.js', result['files'])
        self.assertNotIn('private/password.json', result['files'])
        self.assertNotIn('secrets.iso', result['files'])
        self.assertEqual(package.verify(self.release), result)
        (self.release / 'LICENSE').write_text('mutation')
        with self.assertRaisesRegex(ValueError, 'hash mismatch'): package.verify(self.release)

    def test_preserves_old_release_and_rejects_dirty_source(self):
        self.stage()
        with self.assertRaisesRegex(ValueError, 'already exists'): self.stage()
        self.put('LICENSE', 'changed')
        with self.assertRaisesRegex(ValueError, 'Commit source'): package.package(self.repo, self.frontend, self.root / 'second')

    def test_rejects_source_and_frontend_symlinks(self):
        (self.repo / 'engines/melee/tools/link.py').symlink_to('/etc/passwd')
        self.git('add', '.'); self.git('commit', '-qm', 'Symlink')
        with self.assertRaisesRegex(ValueError, 'regular Git blobs'): self.stage()
        self.git('rm', 'engines/melee/tools/link.py'); self.git('commit', '-qm', 'Remove')
        (self.frontend / 'assets/link.js').symlink_to('/etc/passwd')
        with self.assertRaisesRegex(ValueError, 'symlink'): self.stage()
        self.assertFalse(self.release.exists())

    def test_rejects_frontend_secrets_rom_dependencies_and_maps(self):
        for name in ('.env', 'game.iso', 'node_modules/leak.js', 'main.js.map'):
            path = self.frontend / name; path.parent.mkdir(exist_ok=True); path.write_text('private')
            with self.assertRaises(ValueError): self.stage()
            path.unlink()
            if path.parent.name == 'node_modules': path.parent.rmdir()

    def test_helper_explicit_inputs_hashes_and_no_disc(self):
        self.stage()
        source = self.root / 'inputs'; (source / 'build/native-fit').mkdir(parents=True)
        fitter = source / 'build/native-fit/fit.wasm'; fitter.write_bytes(b'fitter')
        receipt = self.root / 'inputs.json'
        receipt.write_text(json.dumps({'root': str(source), 'files': {'build/native-fit/fit.wasm': package.digest(fitter)}}))
        helper = self.root / 'helper'
        package.stage_helper(self.release, receipt, helper)
        self.assertEqual((helper / 'build/native-fit/fit.wasm').read_bytes(), b'fitter')
        self.assertTrue((helper / 'tools/serve_melee.py').is_file())
        with self.assertRaises(ValueError): package.stage_helper(self.release, receipt, helper)
        for name in ('build/native-fit/game.iso', 'assets/game/link.dat', '../escape'):
            receipt.write_text(json.dumps({'root': str(source), 'files': {name: '0' * 64}}))
            with self.assertRaises(ValueError): package.stage_helper(self.release, receipt, self.root / 'bad')
        (source / 'assets/game').mkdir(parents=True)
        (source / 'assets/game/link.dat').symlink_to('/etc/passwd')
        receipt.write_text(json.dumps({'root': str(source), 'files': {'assets/game/link.dat': '0' * 64}}))
        with self.assertRaisesRegex(ValueError, 'Symlink'): package.stage_helper(self.release, receipt, self.root / 'bad')

    def test_unlisted_files_and_sealed_dependency_mutation(self):
        self.stage()
        deps = self.release / 'web-prototype/node_modules/pkg'; deps.mkdir(parents=True)
        (deps / 'index.js').write_text('dependency')
        with self.assertRaisesRegex(ValueError, 'Unexpected release file'): package.verify(self.release)
        netplay = self.release / 'engines/melee/tools/netplay/node_modules/ws'; netplay.mkdir(parents=True)
        (netplay / 'index.js').write_text('websocket dependency')
        package.seal_dependencies(self.release)
        package.verify(self.release)
        (deps / 'index.js').write_text('mutation')
        with self.assertRaisesRegex(ValueError, 'Dependency hash mismatch'): package.verify(self.release)

    def test_dependency_symlink_escape(self):
        self.stage()
        deps = self.release / 'web-prototype/node_modules'; deps.mkdir(parents=True)
        (deps / 'escape').symlink_to('/etc/passwd')
        with self.assertRaisesRegex(ValueError, 'escape'): package.seal_dependencies(self.release)

    def test_build_receipt_requires_exact_commit_dist_and_lock(self):
        receipt = self.root / 'build.json'
        receipt.write_text(json.dumps({'sourceCommit': 'wrong'}))
        with self.assertRaisesRegex(ValueError, 'Build receipt'): package.package(self.repo, self.frontend, self.release, build_receipt=receipt)
        self.assertFalse(self.release.exists())

    def test_receipt_requires_both_dependency_owner_locks(self):
        receipt = {
            'sourceCommit': self.git('rev-parse', 'HEAD').decode().strip(),
            'toolchain': {'node': 'fixture'},
            'frontendFiles': {p.relative_to(self.frontend).as_posix(): package.digest(p) for p in self.frontend.rglob('*') if p.is_file()},
            'lockFiles': {'web-prototype/pnpm-lock.yaml': package.digest(self.repo / 'web-prototype/pnpm-lock.yaml')},
        }
        file = self.root / 'receipt.json'; file.write_text(json.dumps(receipt))
        with self.assertRaisesRegex(ValueError, 'website and netplay'): package.package(self.repo, self.frontend, self.release, build_receipt=file)
        name = 'engines/melee/tools/netplay/package-lock.json'
        receipt['lockFiles'][name] = package.digest(self.repo / name)
        file.write_text(json.dumps(receipt))
        package.package(self.repo, self.frontend, self.release, build_receipt=file)
        package.verify(self.release)

    def test_both_dependency_layers_required_and_websocket_mutation(self):
        self.stage()
        web = self.release / 'web-prototype/node_modules/pkg'; web.mkdir(parents=True)
        (web / 'index.js').write_text('web')
        with self.assertRaisesRegex(ValueError, 'both dependency layers'): package.seal_dependencies(self.release)
        ws = self.release / 'engines/melee/tools/netplay/node_modules/ws'; ws.mkdir(parents=True)
        (ws / 'index.js').write_text('ws')
        package.seal_dependencies(self.release)
        self.assertIn('engines/melee/tools/netplay/node_modules/ws/index.js', package.verify(self.release)['dependencies'])
        (ws / 'index.js').write_text('mutation')
        with self.assertRaisesRegex(ValueError, 'Dependency hash mismatch'): package.verify(self.release)

    def test_helper_token_is_private_validated_and_never_in_plists(self):
        file = self.root / 'auth.json'
        file.write_text(json.dumps({'helperKey': '0' * 64})); file.chmod(0o600)
        self.assertEqual(service.helper_token(file), '0' * 64)
        file.write_text(json.dumps({'helperKey': 'bad'}))
        with self.assertRaisesRegex(ValueError, 'helperKey'): service.helper_token(file)
        file.chmod(0o644)
        with self.assertRaisesRegex(ValueError, '0600'): service.helper_token(file)

    def test_service_environments_authenticate_helper_without_broad_inheritance(self):
        value = {key: str(self.root / key) for key in ('helper', 'authFile', 'engineRoot', 'characterRoot')}
        token = '0' * 64
        helper = service.service_environment(value, 'helper', token)
        web = service.service_environment(value, 'web', token)
        self.assertEqual(helper['OPENSMASH_DESKTOP_TOKEN'], token)
        self.assertEqual(web['MELEE_SERVICE_TOKEN'], token)
        self.assertEqual(web['MELEE_SERVICE_ORIGIN'], 'http://127.0.0.1:8818')
        self.assertEqual(web['OBJECT_STORE_ROOT'], str(Path(value['helper']) / 'build/objects'))
        self.assertEqual(web['CREATION_ENABLED'], '0')
        self.assertEqual(web['HOST'], '127.0.0.1')
        self.assertNotIn('MELEE_LOCAL_ORIGIN', web)
        self.assertNotIn('MELEE_HOST_DISC_FILE', web)
        self.assertNotIn('MELEE_SIMULATED_PEER_ISO', web)
        self.assertNotIn('MELEE_SHARED_AUTH_FILE', helper)
        self.assertNotEqual(web['COOKIE_SECRET'], token)

    def test_launchd_dryrun_has_no_secrets_install_or_public_bind(self):
        config = {key: str(self.root / key) for key in ('release', 'helper', 'node', 'python', 'authFile', 'engineRoot', 'characterRoot', 'roster', 'logs')}
        file = self.root / 'service.json'; file.write_text(json.dumps(config)); file.chmod(0o600)
        jobs = service.plists(file)
        self.assertEqual(len(jobs), 2)
        for job in jobs.values():
            self.assertEqual(job['ThrottleInterval'], 30)
            self.assertEqual(job['KeepAlive'], {'SuccessfulExit': False})
            self.assertNotIn('secret', json.dumps(job).lower())
            self.assertNotIn('launchctl', job['ProgramArguments'])
            self.assertEqual(job['ProgramArguments'][-2], '--role')
        file.chmod(0o644)
        with self.assertRaisesRegex(ValueError, '0600'): service.plists(file)
        file.chmod(0o600); config['authFile'] = str(self.root / 'release/auth.json'); file.write_text(json.dumps(config))
        with self.assertRaisesRegex(ValueError, 'outside source'): service.plists(file)

    def test_host_disc_is_explicit_external_file_and_web_only(self):
        value = {key: str(self.root / key) for key in ('release', 'helper', 'node', 'python', 'authFile', 'engineRoot', 'characterRoot', 'roster', 'logs')}
        file = self.root / 'service.json'
        file.write_text(json.dumps(value)); file.chmod(0o600)
        disc = self.root / 'private.iso'; disc.write_bytes(b'synthetic fixture only')
        value['hostDiscFile'] = str(disc); file.write_text(json.dumps(value))
        accepted = service.config(file)
        self.assertEqual(service.service_environment(accepted, 'web', '0' * 64)['MELEE_HOST_DISC_FILE'], str(disc))
        self.assertNotIn('MELEE_HOST_DISC_FILE', service.service_environment(accepted, 'helper', '0' * 64))
        self.assertNotIn(str(disc), json.dumps(service.plists(file)))
        release_disc = self.root / 'release/private.iso'
        release_disc.parent.mkdir(); release_disc.write_bytes(b'not packaged')
        link = self.root / 'linked.iso'; link.symlink_to(disc)
        for invalid in ('relative.iso', '', 1, str(self.root), str(link), str(release_disc), str(self.root / 'absent.iso')):
            value['hostDiscFile'] = invalid; file.write_text(json.dumps(value))
            with self.subTest(invalid=invalid), self.assertRaises(ValueError): service.config(file)


if __name__ == '__main__': unittest.main()
