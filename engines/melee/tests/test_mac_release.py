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


if __name__ == '__main__': unittest.main()
