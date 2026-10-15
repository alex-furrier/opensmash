"""Exercise only temporary, synthetic credentials through the real owner TTY."""
import hashlib
import json
import os
from pathlib import Path
import pty
import select
import shutil
import subprocess
import tempfile
import time
import unittest

CLI = Path(__file__).resolve().parents[3] / 'web-prototype/server/shared-password-cli.js'


@unittest.skipUnless(shutil.which('node'), 'Node is required for the owner CLI')
class SharedPasswordCliTests(unittest.TestCase):
    def run_cli(self, target, password):
        previous = target.read_bytes() if target.exists() else None
        master, slave = pty.openpty()
        process = subprocess.Popen(['node', str(CLI), str(target)], stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
        os.close(slave)
        output, sent, deadline = b'', 0, time.monotonic() + 10
        try:
            while time.monotonic() < deadline:
                if select.select([master], [], [], .1)[0]:
                    try:
                        output += os.read(master, 4096)
                    except OSError:
                        break
                if sent == 0 and b'Type CONFIRM' in output:
                    self.assertEqual(target.read_bytes() if target.exists() else None, previous)
                    os.write(master, b'CONFIRM\n')
                    sent = 1
                elif sent == 1 and b'Shared password (hidden' in output:
                    os.write(master, password + b'\n')
                    sent = 2
                elif sent == 2 and b'Confirm shared password' in output:
                    os.write(master, password + b'\n')
                    sent = 3
                if process.poll() is not None:
                    break
            self.assertEqual(process.wait(timeout=1), 0)
            self.assertNotIn(password, output)
            self.assertIn(b'private helper access credential', output)
            value = json.loads(target.read_text())
            self.assertNotIn(value['helperKey'].encode(), output)
            self.assertNotIn(value['sealKey'].encode(), output)
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)
            self.assertEqual(target.parent.stat().st_mode & 0o777, 0o700)
            record = value['password']
            derived = hashlib.scrypt(password, salt=record['salt'].encode(), n=record['N'], r=record['r'], p=record['p'], maxmem=64 * 1024 * 1024, dklen=32)
            self.assertEqual(derived.hex(), record['hash'])
            return value
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()
            os.close(master)

    def test_hidden_setup_and_rotation_preserve_only_helper_credential(self):
        with tempfile.TemporaryDirectory(prefix='opensmash-cli-') as root:
            target = Path(root) / 'private/auth.json'
            first = self.run_cli(target, b'ephemeral-first-test-password')
            second = self.run_cli(target, b'ephemeral-second-test-password')
            self.assertEqual(first['helperKey'], second['helperKey'])
            self.assertNotEqual(first['sealKey'], second['sealKey'])
            self.assertNotEqual(first['authVersion'], second['authVersion'])
            self.assertNotEqual(first['password']['hash'], second['password']['hash'])


if __name__ == '__main__':
    unittest.main()
