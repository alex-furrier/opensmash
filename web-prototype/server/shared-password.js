import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {randomBytes, scrypt, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {sealData, unsealData} from 'iron-session';
import {RateLimiterMemory} from 'rate-limiter-flexible';

const derive = promisify(scrypt);
const SESSION = '__Host-opensmash-session';
const CSRF = '__Host-opensmash-login';
const TTL = 12 * 60 * 60;
const loopback = address => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);
const cookie = (req, name) => (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(name + '='))?.slice(name.length + 1);
const equal = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
const setCookie = (name, value, age) => `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;

export async function passwordRecord(password) {
  if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password) > 1024) throw Error('Use at least 8 characters and at most 1024 bytes.');
  const salt = randomBytes(32).toString('hex');
  const hash = (await derive(password, salt, 32, {N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024})).toString('hex');
  return {salt, hash, N: 32768, r: 8, p: 3};
}

export async function readSharedPasswordConfiguration(file) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 8192 || (stat.mode & 0o077) || stat.uid !== process.getuid()) throw Error('Invalid auth file permissions.');
    const value = JSON.parse(await handle.readFile('utf8'));
    const p = value.password;
    if (!/^[a-f0-9]{64}$/.test(value.helperKey) || !/^[a-f0-9]{64}$/.test(value.authVersion) || !/^[a-f0-9]{64}$/.test(value.sealKey) || !/^[a-f0-9]{64}$/.test(p?.salt) || !/^[a-f0-9]{64}$/.test(p?.hash) || p.N !== 32768 || p.r !== 8 || p.p !== 3) throw Error('Invalid auth file.');
    return value;
  } finally { await handle.close(); }
}

function noStore(res) {
  // Route and upstream headers cannot relax the outer authentication policy.
  const original = res.writeHead;
  res.writeHead = function(status, ...args) {
    const headers = typeof args[0] === 'string' ? args[1] : args[0];
    if (Array.isArray(headers)) {
      for (let i = headers.length - 2; i >= 0; i -= 2) if (/^(?:cache-control|cdn-cache-control|cloudflare-cdn-cache-control|expires|etag|last-modified)$/i.test(headers[i])) headers.splice(i, 2);
    } else if (headers) for (const key of Object.keys(headers)) if (/^(?:cache-control|cdn-cache-control|cloudflare-cdn-cache-control|expires|etag|last-modified)$/i.test(key)) delete headers[key];
    for (const name of ['Cache-Control', 'CDN-Cache-Control', 'Cloudflare-CDN-Cache-Control']) res.setHeader(name, 'no-store');
    for (const name of ['Expires', 'ETag', 'Last-Modified']) res.removeHeader(name);
    return original.call(this, status, ...args);
  };
}

function reply(res, status, body, type = 'application/json') {
  res.writeHead(status, {'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin'});
  res.end(body);
}

function loginPage(res, status = 200, message = "A private lobby for friends.") {
  const token = randomBytes(32).toString('hex');
  res.setHeader('Set-Cookie', setCookie(CSRF, token, 600));
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  reply(res, status, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OpenSmash · Private lobby</title><style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#10141a;color:#f5f2e9;font:18px system-ui}main{width:min(360px,85vw)}h1{font-size:36px}label,input,button{display:block;box-sizing:border-box;width:100%}input,button{margin-top:12px;padding:14px;border-radius:8px;font:inherit}button{background:#ffc853;color:#171717;border:0;font-weight:700}p{color:#b9c0cc}</style><main><h1>OpenSmash</h1><p${status === 200 ? '' : ' role="alert"'}>${message}</p><form action="/login" method="post"><input type="hidden" name="csrf" value="${token}"><label>Shared password<input name="password" type="password" required autocomplete="current-password" maxlength="1024" autofocus></label><button>Enter lobby</button></form></main></html>`, 'text/html; charset=utf-8');
}

function loginFailure(req, res, status, message = 'Unable to sign in. Check the shared password and try again.') {
  if (req.headers.accept?.includes('application/json')) reply(res, status, JSON.stringify({error: message}));
  else loginPage(res, status, message);
}

export function createSharedPasswordGate({file, origin, allowHostDisc = false, requireProxyHttps = false, now = Date.now, pollMs = 500} = {}) {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.origin !== origin || url.hostname !== 'smash.alexfurrier.dev' || !file) throw Error('Shared hosting requires its exact HTTPS origin and auth file.');
  let current, fingerprint, loading, generation = 0;
  const active = new Set();
  const globalLimit = new RateLimiterMemory({points: 40, duration: 60});
  const clientLimit = new RateLimiterMemory({points: 10, duration: 60});
  let hashing = 0;
  function invalidate() { generation++; for (const entry of active) entry.stop(); active.clear(); }
  async function refresh() {
    if (loading) return loading;
    loading = (async () => {
      try {
        const next = await readSharedPasswordConfiguration(file);
        const bytes = JSON.stringify(next);
        if (fingerprint && bytes !== fingerprint) invalidate();
        current = next; fingerprint = bytes;
      } catch { current = undefined; fingerprint = undefined; invalidate(); }
      return current;
    })();
    try { return await loading; } finally { loading = undefined; }
  }
  const timer = setInterval(() => void refresh(), pollMs); timer.unref();
  const hostAllowed = req => loopback(req.socket.remoteAddress) && req.headers.host === url.host;
  const originAllowed = req => req.headers.origin === origin;
  async function session(req) {
    const config = await refresh();
    if (!config || !hostAllowed(req)) return null;
    try {
      const sealed = cookie(req, SESSION) || '';
      if (sealed.length > 4096 || !/^Fe26\.2\*[A-Za-z0-9_*.-]+~2$/.test(sealed)) return null;
      const data = await unsealData(sealed, {password: config.sealKey, ttl: TTL});
      await refresh();
      return current?.authVersion === config.authVersion && current?.sealKey === config.sealKey && data.version === config.authVersion && Number.isSafeInteger(data.expires) && data.expires > now() && data.expires <= now() + TTL * 1000 ? {...data, generation} : null;
    } catch { return null; }
  }
  function track(stop, auth) {
    if (auth.generation !== generation || auth.version !== current?.authVersion || auth.expires <= now()) { stop(); return null; }
    const entry = {stop: () => { clearTimeout(expiry); active.delete(entry); stop(); }};
    const expiry = setTimeout(entry.stop, Math.max(0, auth.expires - now())); expiry.unref(); active.add(entry);
    return () => { clearTimeout(expiry); active.delete(entry); };
  }
  async function handle(req, res) {
    noStore(res);
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (!hostAllowed(req) || (req.headers.origin && !originAllowed(req))) { reply(res, 403, '{"error":"Forbidden"}'); return false; }
    if (requireProxyHttps) {
      // Only the exact-host loopback connector supplies Cloudflare's overwritten scheme header.
      if (req.headers['x-forwarded-proto'] !== 'https') {
        if (req.headers['x-forwarded-proto'] === 'http' && ['GET','HEAD'].includes(req.method)) {
          const target = new URL(req.url, origin);
          res.writeHead(308, {Location: origin + target.pathname + target.search});res.end();
        } else reply(res, 403, '{"error":"HTTPS required"}');
        return false;
      }
      res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    }
    const config = await refresh();
    if (!config) { reply(res, 503, '{"error":"Private hosting unavailable"}'); return false; }
    const pathname = new URL(req.url, origin).pathname;
    if (pathname === '/login' && req.method === 'GET') { loginPage(res); return false; }
    if (pathname === '/login' && req.method === 'POST') {
      if (!originAllowed(req)) { reply(res, 403, '{"error":"Forbidden"}'); return false; }
      // Trust Cloudflare client addresses only behind this loopback-only, exact-host connector.
      const forwarded = req.headers['cf-connecting-ip'];
      const client = typeof forwarded === 'string' && /^[0-9a-f:.]{3,45}$/i.test(forwarded) ? forwarded : req.socket.remoteAddress;
      try { await globalLimit.consume('all'); await clientLimit.consume(String(client)); }
      catch { res.setHeader('Retry-After', '60'); loginFailure(req, res, 429, 'Please wait a moment before trying again.'); return false; }
      if (hashing >= 2) { res.setHeader('Retry-After', '5'); loginFailure(req, res, 429, 'Please wait a moment before trying again.'); return false; }
      const chunks = []; let size = 0;
      req.setTimeout(10000, () => req.destroy());
      try { for await (const part of req) { size += part.length; if (size > 4096) { loginFailure(req, res, 413, 'Unable to sign in. Please try again.'); return false; } chunks.push(part); } }
      catch { return false; }
      const fields = new URLSearchParams(Buffer.concat(chunks).toString('utf8')), password = fields.get('password');
      if (!equal(fields.get('csrf'), cookie(req, CSRF)) || !/^[a-f0-9]{64}$/.test(fields.get('csrf') || '') || !password || Buffer.byteLength(password) > 1024) { loginFailure(req, res, 403); return false; }
      if (hashing >= 2) { res.setHeader('Retry-After', '5'); loginFailure(req, res, 429, 'Please wait a moment before trying again.'); return false; }
      hashing++;
      let hash;
      try { hash = (await derive(password, config.password.salt, 32, {N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024})).toString('hex'); }
      finally { hashing--; }
      await refresh();
      if (!equal(hash, config.password.hash) || current?.authVersion !== config.authVersion || current?.sealKey !== config.sealKey) { loginFailure(req, res, 401); return false; }
      const sealed = await sealData({version: config.authVersion, expires: now() + TTL * 1000}, {password: config.sealKey, ttl: TTL});
      await refresh();
      if (current?.authVersion !== config.authVersion || current?.sealKey !== config.sealKey) { loginFailure(req, res, 401); return false; }
      res.setHeader('Set-Cookie', [setCookie(SESSION, sealed, TTL), setCookie(CSRF, '', 0)]);
      res.writeHead(303, {Location: '/melee'}); res.end(); return false;
    }
    const auth = await session(req);
    if (!auth) {
      if (req.method === 'GET' && (pathname === '/' || pathname === '/melee')) { res.writeHead(303, {Location: '/login'}); res.end(); }
      else reply(res, 401, '{"error":"Sign in required"}');
      return false;
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !originAllowed(req)) { reply(res, 403, '{"error":"Forbidden"}'); return false; }
    if (pathname === '/logout' && req.method === 'POST') { res.setHeader('Set-Cookie', setCookie(SESSION, '', 0)); res.writeHead(303, {Location: '/login'}); res.end(); return false; }
    if (pathname.startsWith('/__/auth/') || (pathname.startsWith('/api/auth/') && pathname !== '/api/auth/config')) { reply(res, 404, '{"error":"Not found"}'); return false; }
    // Opt-in routes remain authenticated, uncached and tracked for revocation.
    if (allowHostDisc !== true && /^\/melee\/api\/disc(?:-source)?$/.test(pathname)) { reply(res, 404, '{"available":false}'); return false; }
    const release = track(() => res.destroy(), auth);
    if (!release) return false;
    res.once('close', release); res.once('finish', release);
    return true;
  }
  async function authorizeUpgrade(req) { return originAllowed(req) && (!requireProxyHttps || req.headers['x-forwarded-proto'] === 'https') ? session(req) : null; }
  return {handle, authorizeUpgrade, trackSocket(socket, auth) { const release = track(() => socket.terminate(), auth); if (release) socket.once('close', release); return !!release; }, close() { clearInterval(timer); invalidate(); }};
}
