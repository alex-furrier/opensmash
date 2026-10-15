import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp, writeFile, chmod, rename, unlink, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {sealData} from 'iron-session';
import {createSharedPasswordGate, passwordRecord} from './shared-password.js';
import {EventEmitter, once} from 'node:events';

const origin = 'https://smash.alexfurrier.dev';
const password = 'isolated-test-only-password';
const config = async () => ({helperKey: randomBytes(32).toString('hex'), authVersion: randomBytes(32).toString('hex'), sealKey: randomBytes(32).toString('hex'), password: await passwordRecord(password)});
async function fixture(t, {missing = false, allowHostDisc = false, protectedHandler} = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'opensmash-auth-'));
  const file = path.join(directory, 'auth.json'); let value = await config();
  if (!missing) await writeFile(file, JSON.stringify(value), {mode: 0o600});
  const gate = createSharedPasswordGate({file, origin, allowHostDisc, pollMs: 10});
  const server = http.createServer(async (req, res) => {
    if (!await gate.handle(req, res)) return;
    if (protectedHandler) return protectedHandler(req, res);
    if (req.url === '/stream') { res.writeHead(200, {'Cache-Control': 'public,max-age=100', 'CDN-Cache-Control': 'public'}); res.write('data'); return; }
    res.writeHead(200, {'Cache-Control': 'public,max-age=100', 'CDN-Cache-Control': 'public'}); res.end('protected');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => {gate.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(directory, {recursive: true, force: true});});
  const request = (url = '/', {headers = {}, method = 'GET', body = ''} = {}) => new Promise((resolve, reject) => {
    const req = http.request({host: '127.0.0.1', port: server.address().port, path: url, method, headers: {Host: 'smash.alexfurrier.dev', ...headers}}, res => {
      let text = '';res.on('data', chunk => text += chunk);res.on('end', () => resolve({status: res.statusCode, headers: res.headers, text}));
    }); req.on('error', reject); req.end(body);
  });
  const session = async (overrides = {}) => '__Host-opensmash-session=' + await sealData({version: value.authVersion, expires: Date.now() + 3600000, ...overrides}, {password: value.sealKey, ttl: 43200});
  const rotate = async next => {value = next || await config(); await writeFile(file + '.tmp', JSON.stringify(value), {mode: 0o600}); await rename(file + '.tmp', file);};
  return {gate, request, session, rotate, file, server, get value() {return value;}};
}

test('anonymous GET/HEAD assets, encoded paths, API and spoofed authority are denied', async t => {
  const f = await fixture(t);
  for (const route of ['/assets/app.js', '/melee/engine/main.wasm', '/melee/api/imports', '/%6delee/engine/main.wasm', '/api/session', '/livez']) for (const method of ['GET', 'HEAD']) assert.equal((await f.request(route, {method})).status, 401);
  assert.equal((await f.request('/')).status, 303);
  assert.equal((await f.request('/login', {headers: {Host: 'localhost'}})).status, 403);
  assert.equal((await f.request('/login', {headers: {Origin: 'https://evil.example'}})).status, 403);
});

test('explicit hosted disc remains authenticated for GET/HEAD, rejects ranges and cancels on rotation', {timeout: 15000}, async t => {
  const {createHostDisc, HOST_DISC_PATH, HOST_DISC_CONFIG_PATH} = await import('../../engines/melee/server/host-disc.mjs');
  const {createHash} = await import('node:crypto');
  const directory = await mkdtemp(path.join(tmpdir(), 'opensmash-auth-disc-'));
  const file = path.join(directory, 'synthetic.iso'), bytes = Buffer.alloc(16 * 1024 * 1024, 71);
  const digest = createHash('sha256').update(bytes).digest('hex');
  await writeFile(file, bytes);
  const disc = await createHostDisc({file, expectedSize: bytes.length, expectedHash: digest});
  t.after(async () => {await disc.close();await rm(directory, {recursive: true, force: true});});
  const f = await fixture(t, {allowHostDisc: true, protectedHandler: (req, res) => {
    if (req.url === HOST_DISC_CONFIG_PATH) {res.writeHead(200, {'Content-Type':'application/json'});res.end(JSON.stringify(disc.metadata));return;}
    void disc.respond(req, res).catch(() => res.destroy());
  }});
  for (const route of [HOST_DISC_PATH, HOST_DISC_CONFIG_PATH]) for (const method of ['GET','HEAD']) assert.equal((await f.request(route, {method})).status, 401);
  const cookie = await f.session(), headers = {Cookie: cookie};
  const metadata = await f.request(HOST_DISC_CONFIG_PATH, {headers});assert.equal(JSON.parse(metadata.text).sha256, digest);assert.equal(metadata.headers['cache-control'],'no-store');
  const head = await f.request(HOST_DISC_PATH, {method:'HEAD',headers});assert.equal(head.status,200);assert.equal(head.headers['content-length'],String(bytes.length));assert.equal(head.text,'');
  const get = await f.request(HOST_DISC_PATH, {headers});assert.equal(get.status,200);assert.equal(get.headers['cdn-cache-control'],'no-store');assert.equal(createHash('sha256').update(get.text).digest('hex'),digest);
  for (const [route, options] of [[HOST_DISC_PATH+'?file=other',{}],[HOST_DISC_PATH,{headers:{...headers,Range:'bytes=0-99'}}],[HOST_DISC_PATH,{method:'POST',headers:{...headers,Origin:origin}}]]) {
    const denied = await f.request(route,{headers,...options});assert.equal(denied.status,404);assert.equal(denied.text,'');
  }
  assert.equal((await f.request(HOST_DISC_PATH,{headers:{...headers,Origin:'https://other.example'}})).status,403);
  const next = await config();
  const stream = await new Promise(resolve => http.get({host:'127.0.0.1',port:f.server.address().port,path:HOST_DISC_PATH,headers:{Host:'smash.alexfurrier.dev',...headers}},resolve));
  assert.equal(stream.statusCode,200);const aborted=once(stream,'aborted');await f.rotate(next);await f.request('/login');stream.resume();await aborted;
  assert.equal((await f.request(HOST_DISC_PATH,{method:'HEAD',headers})).status,401);
});

test('production startup rejects an unverified configured disc before listening', async t => {
  const {execFile} = await import('node:child_process');const {promisify} = await import('node:util');const {fileURLToPath} = await import('node:url');
  const directory = await mkdtemp(path.join(tmpdir(),'opensmash-invalid-disc-')), file = path.join(directory,'synthetic.iso');
  const bytes = 'synthetic-invalid-disc-content';await writeFile(file,bytes);t.after(()=>rm(directory,{recursive:true,force:true}));
  const env={PATH:process.env.PATH,HOME:directory,NODE_ENV:'production',HOST:'127.0.0.1',PORT:'0',CREATION_ENABLED:'0',MELEE_SHARED_HOSTING:'1',MELEE_SHARED_AUTH_FILE:path.join(directory,'unused-auth.json'),MELEE_PRIVATE_ORIGIN:origin,MELEE_HOST_DISC_FILE:file};
  await assert.rejects(promisify(execFile)(process.execPath,[fileURLToPath(new URL('./index.js',import.meta.url))],{env,timeout:10000}),error=>{
    assert.match(error.stderr,/unexpected size/);assert.ok(!error.stdout.includes('OpenSmash web:'));assert.ok(!error.stderr.includes(bytes));return true;
  });
});

test('login CSRF/origin, wrong password, valid cookie, logout and forced private caching', async t => {
  const f = await fixture(t);
  const form = await f.request('/login');assert.equal(form.headers['referrer-policy'], 'same-origin');const csrf = /name="csrf" value="([a-f0-9]+)"/.exec(form.text)[1];const csrfCookie = form.headers['set-cookie'][0].split(';')[0];
  const login = (pw, headers = {}) => f.request('/login', {method: 'POST', headers: {Origin: origin, Cookie: csrfCookie, ...headers}, body: new URLSearchParams({csrf, password: pw}).toString()});
  assert.equal((await login(password, {Origin: ''})).status, 403);
  assert.equal((await login(password, {Cookie: ''})).status, 403);
  const wrong=await login('<script>secret-password</script>');assert.equal(wrong.status,401);assert.match(wrong.headers['content-type'],/text\/html/);assert.match(wrong.text,/role="alert"/);assert.ok(!wrong.text.includes('<script>secret-password</script>'));
  const apiFailure=await login('wrong',{Accept:'application/json'});assert.equal(apiFailure.status,401);assert.match(apiFailure.headers['content-type'],/application\/json/);assert.equal(typeof JSON.parse(apiFailure.text).error,'string');
  const signed = await login(password);assert.equal(signed.status, 303);
  const cookie = signed.headers['set-cookie'][0].split(';')[0];assert.match(signed.headers['set-cookie'][0], /Secure; HttpOnly; SameSite=Lax/);
  const protectedResponse = await f.request('/assets/a.js', {headers: {Cookie: cookie}});
  assert.equal(protectedResponse.status, 200);assert.equal(protectedResponse.headers['cache-control'], 'no-store');assert.equal(protectedResponse.headers['cdn-cache-control'], 'no-store');
  assert.equal((await f.request('/logout', {method: 'POST', headers: {Cookie: cookie}})).status, 403);
  assert.equal((await f.request('/logout', {method: 'POST', headers: {Cookie: cookie, Origin: origin}})).status, 303);
  for (const route of ['/melee/api/disc', '/melee/api/disc-source', '/__/auth/handler', '/api/auth/session']) assert.equal((await f.request(route, {headers: {Cookie: cookie}})).status, 404);
});

test('tampered/expired cookies and upgrade missing cookie/origin are denied; rotation invalidates old cookies', async t => {
  const f = await fixture(t);const cookie = await f.session();
  for (const bad of [cookie + 'tampered', await f.session({expires: Date.now() - 1})]) assert.equal((await f.request('/asset', {headers: {Cookie: bad}})).status, 401);
  const req = headers => ({headers: {host: 'smash.alexfurrier.dev', origin, ...headers}, socket: {remoteAddress: '127.0.0.1'}});
  assert.equal(await f.gate.authorizeUpgrade(req({})), null);
  assert.equal(await f.gate.authorizeUpgrade(req({cookie, origin: 'https://evil.example'})), null);
  const auth = await f.gate.authorizeUpgrade(req({cookie}));assert.ok(auth);
  const socket = new EventEmitter();let stopped = false; socket.terminate = () => {stopped = true;socket.emit('close');};f.gate.trackSocket(socket, auth);
  await f.rotate();assert.equal((await f.request('/asset', {headers: {Cookie: cookie}})).status, 401);assert.equal(stopped, true);
  assert.equal((await f.request('/asset', {headers: {Cookie: await f.session()}})).status, 200);
});

test('rotation cancels in-flight downloads; missing, malformed, deleted and unsafe auth files fail closed', async t => {
  const f = await fixture(t);const cookie = await f.session();
  const stream = await new Promise(resolve => http.get({host: '127.0.0.1', port: f.server.address().port, path: '/stream', headers: {Host: 'smash.alexfurrier.dev', Cookie: cookie}}, resolve));
  const aborted = once(stream, 'aborted');stream.resume();await f.rotate();await aborted;
  await writeFile(f.file, '{');assert.equal((await f.request('/login')).status, 503);
  await f.rotate();await chmod(f.file, 0o644);assert.equal((await f.request('/login')).status, 503);
  await unlink(f.file);assert.equal((await f.request('/login')).status, 503);
  const missing = await fixture(t, {missing: true});assert.equal((await missing.request('/login')).status, 503);
});

test('login is throttled before password hashing', async t => {
  const f = await fixture(t);
  for (let n = 0; n < 10; n++) assert.equal((await f.request('/login', {method: 'POST', headers: {Origin: origin}})).status, 403);
  const blocked = await f.request('/login', {method: 'POST', headers: {Origin: origin}});assert.equal(blocked.status, 429);assert.equal(blocked.headers['retry-after'], '60');
});

test('real friend upgrade owner rejects missing/tampered sessions and closes an accepted socket on rotation', async t => {
  const f = await fixture(t);
  const {createRequire} = await import('node:module');
  const require = createRequire(new URL('../../engines/melee/tools/netplay/package.json', import.meta.url));
  const {WebSocket} = require('ws');
  const {attachFriendRooms} = await import('../../engines/melee/server/friend-rooms.mjs');
  const previous = [process.env.MELEE_SHARED_HOSTING, process.env.MELEE_SHARED_AUTH_FILE];
  process.env.MELEE_SHARED_HOSTING = '1'; process.env.MELEE_SHARED_AUTH_FILE = f.file;
  const rooms = attachFriendRooms(f.server, {engine: 'fixture', privateOrigin: origin, sharedPassword: f.gate});
  t.after(() => {rooms.close();for (const [n, v] of [['MELEE_SHARED_HOSTING',previous[0]], ['MELEE_SHARED_AUTH_FILE',previous[1]]]) {if(v===undefined)delete process.env[n];else process.env[n]=v;}});
  const connect = cookie => new WebSocket(`ws://127.0.0.1:${f.server.address().port}/melee/room`, {headers: {Host: 'smash.alexfurrier.dev', Origin: origin, Cookie: cookie || ''}});
  for (const cookie of ['', 'bad']) {
    const socket = connect(cookie);socket.on('error', () => {});
    const [req, response] = await once(socket, 'unexpected-response');assert.equal(response.statusCode, 401);response.resume();socket.terminate();
  }
  const socket = connect(await f.session());await once(socket, 'open');const closed = once(socket, 'close');
  await f.rotate();await closed;
});

test('actual production Node router gates all early/static/helper routes and disables account auth', async t => {
  const {spawn} = await import('node:child_process');const {fileURLToPath} = await import('node:url');
  const directory = await mkdtemp(path.join(tmpdir(), 'opensmash-router-auth-'));const file = path.join(directory, 'auth.json');
  const value = await config();await writeFile(file, JSON.stringify(value), {mode: 0o600});
  const env = {PATH: process.env.PATH, HOME: directory, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '0', SERVE_BUILT_FRONTEND: '1', FIGHTER_WORKER_DISABLED: '1', FIREBASE_AUTH_ENABLED: '1', CREATION_ENABLED: '0', OBJECT_STORE: 'local', JOB_DATABASE: 'local', HANDOFF_ROOMS: 'local', OBJECT_STORE_ROOT: path.join(directory,'objects'), FIGHTER_JOBS_ROOT: path.join(directory,'jobs'), MELEE_SHARED_HOSTING: '1', MELEE_SHARED_AUTH_FILE: file, MELEE_PRIVATE_ORIGIN: origin, COOKIE_SECRET: randomBytes(32).toString('hex')};
  const child = spawn(process.execPath, [fileURLToPath(new URL('./index.js', import.meta.url))], {env, stdio: ['ignore','pipe','pipe']});let output = '', errors = '';
  child.stderr.on('data', part => errors += part);const exit = once(child,'exit');
  t.after(async () => {child.kill('SIGTERM');await exit;await rm(directory,{recursive:true,force:true});});
  const port = await new Promise((resolve,reject) => {
    const timer = setTimeout(() => reject(Error('Server startup timed out: '+errors)), 10000);
    child.once('exit', () => {clearTimeout(timer);reject(Error('Server exited: '+errors));});
    child.stdout.on('data', chunk => {output += chunk;const match = /OpenSmash web: http:\/\/127.0.0.1:(\d+)/.exec(output);if(match){clearTimeout(timer);resolve(Number(match[1]));}});
  });
  const request = (route, headers = {}, method = 'GET') => new Promise((resolve,reject) => {const req = http.request({host:'127.0.0.1',port,path:route,method,headers:{Host:'smash.alexfurrier.dev',...headers}}, res => {let text='';res.on('data',part=>text+=part);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text}));});req.on('error',reject);req.end();});
  for(const route of ['/assets/app.js','/melee/api/netplay/config','/melee/api/disc','/melee/engine/a.wasm','/api/session','/livez','/__/auth/handler']) for(const method of ['GET','HEAD']) assert.equal((await request(route,{},method)).status,401);
  const cookie='__Host-opensmash-session='+await sealData({version:value.authVersion,expires:Date.now()+3600000},{password:value.sealKey,ttl:43200});
  const authConfig=await request('/api/auth/config',{Cookie:cookie});assert.equal(authConfig.status,200);assert.equal(JSON.parse(authConfig.text).enabled,false);
  const characters=await request('/api/characters',{Cookie:cookie});assert.equal(characters.status,200);assert.ok(Array.isArray(JSON.parse(characters.text).characters));
  const netplay=await request('/melee/api/netplay/config',{Cookie:cookie});assert.equal(netplay.status,200);assert.equal(netplay.headers['cache-control'],'no-store');
  assert.equal((await request('/api/session',{Cookie:cookie})).status,200);
  assert.equal((await request('/melee/api/game/PlMr.dat',{Cookie:cookie})).status,404);
  await writeFile(file,'{');assert.equal((await request('/login')).status,503);
  assert.ok(!output.includes(value.sealKey)&&!errors.includes(value.sealKey));
});

test('rotation at the native password acquisition boundary prevents issuing an obsolete session', async t => {
  const f = await fixture(t), next = await config();
  const {createHook} = await import('node:async_hooks');const {writeFileSync,renameSync} = await import('node:fs');
  const form = await f.request('/login');const csrf = /name="csrf" value="([a-f0-9]+)"/.exec(form.text)[1];
  let changed = false;
  const hook = createHook({init(_id,type) {if(type==='SCRYPTREQUEST'&&!changed){changed=true;hook.disable();writeFileSync(f.file+'.rotate',JSON.stringify(next),{mode:0o600});renameSync(f.file+'.rotate',f.file);}}});
  hook.enable();t.after(()=>hook.disable());
  const response = await f.request('/login',{method:'POST',headers:{Origin:origin,Cookie:form.headers['set-cookie'][0].split(';')[0]},body:new URLSearchParams({csrf,password}).toString()});
  assert.equal(changed,true);assert.equal(response.status,401);assert.ok(!(response.headers['set-cookie']||[]).some(value=>value.startsWith('__Host-opensmash-session=')));
});

test('stale resource registration is rejected, socket expiry closes, and rotated cookies remain invalid after gate restart', async t => {
  const f = await fixture(t);const old = await f.session();
  const req = cookie => ({headers:{host:'smash.alexfurrier.dev',origin,cookie},socket:{remoteAddress:'127.0.0.1'}});
  const auth = await f.gate.authorizeUpgrade(req(old));await f.rotate();await f.request('/login');
  const stale = new EventEmitter();let terminated=false;stale.terminate=()=>{terminated=true;stale.emit('close');};
  assert.equal(f.gate.trackSocket(stale,auth),false);assert.equal(terminated,true);
  const restarted = createSharedPasswordGate({file:f.file,origin});t.after(()=>restarted.close());
  assert.equal(await restarted.authorizeUpgrade(req(old)),null);
  const short = await f.session({expires:Date.now()+100});const shortAuth=await f.gate.authorizeUpgrade(req(short));assert.ok(shortAuth);
  const socket=new EventEmitter();socket.terminate=()=>socket.emit('close');const closed=once(socket,'close');
  f.gate.trackSocket(socket,shortAuth);await closed;
});

test('concurrent complete login bodies cannot exceed the two-hash admission bound', async t => {
  const f = await fixture(t);const form=await f.request('/login');const csrf=/name="csrf" value="([a-f0-9]+)"/.exec(form.text)[1];
  const headers={Origin:origin,Cookie:form.headers['set-cookie'][0].split(';')[0]};
  const results=await Promise.all(Array.from({length:4},()=>f.request('/login',{method:'POST',headers,body:new URLSearchParams({csrf,password}).toString()})));
  assert.deepEqual(results.map(row=>row.status).sort(),[303,303,429,429]);
});
