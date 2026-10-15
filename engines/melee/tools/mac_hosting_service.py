"""Render login-only launchd jobs or run one verified local service.

Rendering is a dry run: this tool never installs, loads, unloads or edits jobs.
"""
import argparse
import json
import os
from pathlib import Path
import plistlib
import stat
import secrets
import re
import sys
import time
from urllib.request import Request, urlopen
from package_mac_release import verify, digest, regular

ORIGIN = 'https://smash.alexfurrier.dev'
REQUIRED_ENGINE_FILES = {
    'platforms/browser/' + name for name in ('runtime.mjs', 'runtime.html', 'gpu-preflight.mjs', 'disc-cache.mjs', 'save-migration.mjs', 'initial_pipeline_cache.db')
} | {'build/browser/runtime/platforms/browser/' + name for name in ('melee_browser.js', 'melee_browser.wasm')}



def config(path):
    path = Path(path)
    if path.is_symlink() or not path.is_file() or stat.S_IMODE(path.stat().st_mode) != 0o600 or path.stat().st_uid != os.getuid():
        raise ValueError('Service config must be owner-owned, regular and mode 0600')
    value = json.loads(path.read_text())
    for key in ('release', 'helper', 'node', 'python', 'authFile', 'engineRoot', 'characterRoot', 'roster', 'logs'):
        if not isinstance(value.get(key), str) or not Path(value[key]).is_absolute():
            raise ValueError('Absolute configured path required: ' + key)
    release = Path(value['release']).resolve()
    for key in ('helper', 'authFile', 'characterRoot', 'roster', 'logs', 'engineRoot'):
        if Path(value[key]).resolve().is_relative_to(release):
            raise ValueError('Private state/runtime must be outside source release: ' + key)
    return value


def plists(path):
    value = config(path)
    runner = str(Path(__file__).resolve())
    result = {}
    for role in ('helper', 'web'):
        label = 'dev.alexfurrier.smash.' + role
        result[label + '.plist'] = {
            'Label': label,
            'ProgramArguments': [value['python'], runner, 'run', '--config', str(Path(path).absolute()), '--role', role],
            'WorkingDirectory': value['helper'] if role == 'helper' else str(Path(value['release']) / 'web-prototype'),
            'RunAtLoad': True,
            'KeepAlive': {'SuccessfulExit': False},
            'ThrottleInterval': 30,
            'ExitTimeOut': 20,
            'ProcessType': 'Background',
            'StandardOutPath': str(Path(value['logs']) / (role + '.log')),
            'StandardErrorPath': str(Path(value['logs']) / (role + '.error.log')),
            'EnvironmentVariables': {'PATH': '/usr/bin:/bin:/usr/sbin:/sbin', 'PYTHONUNBUFFERED': '1', 'PYTHONDONTWRITEBYTECODE': '1'},
        }
    return result


def helper_token(path):
    auth = Path(path)
    if auth.is_symlink() or not auth.is_file() or stat.S_IMODE(auth.stat().st_mode) != 0o600 or auth.stat().st_uid != os.getuid():
        raise ValueError('Auth file must be owner-owned and mode 0600')
    helper_key = json.loads(auth.read_text()).get('helperKey')
    if not isinstance(helper_key, str) or not re.fullmatch('[a-f0-9]{64}', helper_key):
        raise ValueError('Private authentication configuration needs helperKey')
    return helper_key


def service_environment(value, role, helper_key):
    env = {'PATH': '/usr/bin:/bin:/usr/sbin:/sbin', 'PYTHONUNBUFFERED': '1', 'PYTHONDONTWRITEBYTECODE': '1', 'HOME': str(Path.home())}
    helper = Path(value['helper'])
    if role == 'helper':
        env.update(OPENSMASH_CHARACTER_ROOT=value['characterRoot'], MELEE_PC_ROOT=value['engineRoot'], OPENSMASH_DESKTOP_TOKEN=helper_key)
    else:
        env.update(NODE_ENV='production', HOST='127.0.0.1', PORT='4198', FIGHTER_WORKER_DISABLED='1', CREATION_ENABLED='0',
                   MELEE_SHARED_HOSTING='1', MELEE_SHARED_AUTH_FILE=value['authFile'], MELEE_PRIVATE_ORIGIN=ORIGIN,
                   MELEE_SERVICE_ORIGIN='http://127.0.0.1:8818', MELEE_SERVICE_TOKEN=helper_key, MELEE_NETPLAY_ENGINE_ROOT=value['engineRoot'],
                   OPENSMASH_CHARACTER_ROOT=value['characterRoot'],
                   FIGHTER_JOBS_ROOT=str(helper / 'build/fighter-jobs'), OBJECT_STORE_ROOT=str(helper / 'build/objects'))
        # Legacy app cookies have a separate purpose and expire on service restart.
        env['COOKIE_SECRET'] = secrets.token_hex(32)
    return env


def run(path, role):
    value = config(path)
    release_manifest = verify(value['release'])
    # Exact toolchain versions are captured by operator-local staging, checked on every launch.
    import subprocess
    for key, flag in (('node', '--version'), ('python', '--version')):
        version = subprocess.check_output([value[key], flag], text=True).strip()
        if version != value.get(key + 'Version'):
            raise ValueError('Pinned toolchain version differs: ' + key)
    packages = value.get('pythonPackages')
    if not isinstance(packages, dict) or not {'numpy', 'Pillow', 'scipy'} <= packages.keys():
        raise ValueError('Exact Python package versions required')
    actual = json.loads(subprocess.check_output([value['python'], '-I', '-c',
        'import importlib.metadata,json,sys;print(json.dumps({n:importlib.metadata.version(n) for n in json.loads(sys.argv[1])}))', json.dumps(list(packages))], text=True))
    if actual != packages:
        raise ValueError('Pinned Python dependencies differ')
    helper = Path(value['helper'])
    identity = json.loads(regular(helper, 'helper-inputs.json').read_text())
    if identity['sourceCommit'] != release_manifest['sourceCommit']:
        raise ValueError('Helper source does not match release')
    for name, expected in identity['files'].items():
        if digest(regular(helper, name)) != expected:
            raise ValueError('Helper input changed: ' + name)
    for name, expected in release_manifest['files'].items():
        if name.startswith('engines/melee/') and digest(regular(helper, name[len('engines/melee/'):])) != expected:
            raise ValueError('Helper code differs from release: ' + name)
    engine_files = value.get('engineFiles')
    if not isinstance(engine_files, dict) or not REQUIRED_ENGINE_FILES <= engine_files.keys():
        raise ValueError('Pinned runtime file hashes required')
    for name, expected in engine_files.items():
        if digest(regular(Path(value['engineRoot']), name)) != expected:
            raise ValueError('Pinned runtime hash mismatch: ' + name)
    helper_key = helper_token(value['authFile'])
    env = service_environment(value, role, helper_key)
    if role == 'helper':
        os.chdir(helper)
        args = [value['python'], str(helper / 'tools/serve_melee.py'), '--upstream', '--port', '8818', '--characters', value['characterRoot'], '--private-roster', value['roster']]
    else:
        # Never forward an inherited ISO delivery or simulated-peer environment setting.
        for _ in range(30):
            try:
                with urlopen(Request('http://127.0.0.1:8818/api/imports?roster=active', headers={'X-OpenSmash-Token': helper_key}), timeout=2) as response:
                    if response.status == 200:
                        break
            except OSError:
                time.sleep(1)
        else:
            raise ValueError('Private helper is not healthy')
        os.chdir(Path(value['release']) / 'web-prototype')
        args = [value['node'], 'server/index.js']
    os.execve(args[0], args, env)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['render', 'run'])
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--role', choices=['web', 'helper'])
    a = parser.parse_args()
    if a.command == 'run':
        if not a.role:
            parser.error('--role required')
        run(a.config, a.role)
    else:
        if not a.output or a.output.exists():
            parser.error('--output must be a new directory')
        jobs = plists(a.config)
        a.output.mkdir(parents=True, mode=0o700)
        for name, job in jobs.items():
            (a.output / name).write_bytes(plistlib.dumps(job))
        print('Rendered two login-only jobs; no services installed or started.')


if __name__ == '__main__':
    main()
