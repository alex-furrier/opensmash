#!/usr/bin/env node
// Owner-operated secure handoff. Passwords are read only from a local TTY.
import {createInterface} from 'node:readline';
import {Writable} from 'node:stream';
import {randomBytes} from 'node:crypto';
import {mkdir, open, rename, unlink, lstat} from 'node:fs/promises';
import path from 'node:path';
import {passwordRecord} from './shared-password.js';

const file = process.argv[2];
if (!file || process.argv.length !== 3 || !path.isAbsolute(file) || !process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('Run locally in a terminal: node server/shared-password-cli.js /absolute/private/auth.json');
  process.exit(1);
}
const directory = path.dirname(file);
const quiet = new Writable({write(_chunk, _encoding, done) { done(); }});
const input = createInterface({input: process.stdin, output: quiet, terminal: true});
const ask = prompt => { process.stdout.write(prompt); return new Promise(resolve => input.question('', answer => {process.stdout.write('\n'); resolve(answer);})); };
let password, confirmation;
try {
  process.stdout.write(`This will create or rotate the private password at ${file}.\nExisting sessions, WebSockets and active downloads will be invalidated.\n`);
  if (await ask('Type CONFIRM to continue: ') !== 'CONFIRM') { input.close(); process.exit(1); }
  password = await ask('Shared password (hidden, at least 16 characters): ');
  confirmation = await ask('Confirm shared password (hidden): ');
} finally { input.close(); }
if (password !== confirmation) throw Error('Passwords did not match. No configuration was changed.');
await mkdir(directory, {recursive: true, mode: 0o700});
const parent = await lstat(directory);
if (!parent.isDirectory() || parent.isSymbolicLink() || parent.uid !== process.getuid() || parent.mode & 0o077) throw Error('Use an owner-only private directory (mode 0700).');
try {
  const existing = await lstat(file);
  if (!existing.isFile() || existing.isSymbolicLink() || existing.uid !== process.getuid() || existing.mode & 0o077) throw Error('Existing configuration must be an owner-only regular file.');
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const config = {authVersion: randomBytes(32).toString('hex'), sealKey: randomBytes(32).toString('hex'), password: await passwordRecord(password)};
password = confirmation = undefined;
const temporary = path.join(directory, `.auth-${randomBytes(16).toString('hex')}.tmp`);
try {
  const handle = await open(temporary, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(config) + '\n'); await handle.sync(); } finally { await handle.close(); }
  await rename(temporary, file);
  const parentHandle = await open(directory, 'r');
  try { await parentHandle.sync(); } finally { await parentHandle.close(); }
} finally { await unlink(temporary).catch(() => {}); }
console.log('Private password configuration saved. Existing sessions and connections will be invalidated.');
