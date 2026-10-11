import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfirmedInput, neutralPad} from '../web/lib/netplay/confirmed-input.mjs';

const identity = {engine: 'engine-hash', disc: 'disc-hash', rules: 'rules-hash', costumes: 'stock', seed: '17'};
function pair({session = 'fresh', change = x => x, delay = () => 0, timeoutMs = 1000, otherIdentity = identity} = {}) {
  const ports = new MessageChannel(), sent = [[], []];
  let chain = [Promise.resolve(), Promise.resolve()];
  const channels = [ports.port1, ports.port2].map((port, player) => ({
    send(message) {
      sent[player].push(structuredClone(message));
      const copy = change(structuredClone(message), player);
      chain[player] = chain[player].then(async () => {
        const ms = delay(message, player);
        if (ms) await new Promise(resolve => setTimeout(resolve, ms));
        if (copy) port.postMessage(copy);
      });
    },
    subscribe(receive) {
      const fn = ({data}) => receive(data);
      port.addEventListener('message', fn); port.start();
      return () => port.removeEventListener('message', fn);
    },
  }));
  const peers = channels.map((channel, player) => createConfirmedInput({
    channel, session, player, identity: player ? otherIdentity : identity, timeoutMs,
  }));
  peers.forEach(p => p.start());
  return {peers, sent, channels, close() { peers.forEach(p => p.stop()); ports.port1.close(); ports.port2.close(); }};
}
const owned = (player, tick) => [tick % 11 === player ? 256 << player : 0,
  player ? -tick % 80 : tick % 80, player ? -13 : 17, 12, -9, 33, 44, 55, 66, 0];
async function step(peers, tick, states = ['same', 'same']) {
  return Promise.all(peers.map((p, player) => p.synchronize(tick, () => owned(player, tick), states[player])));
}

test('4000 ticks acquire distinct owned pads once; applied traces and canonical fixture states match', async () => {
  let seed = 101;
  const p = pair({delay: (m, player) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return m.type === 'input' && m.tick % 200 === 0 ? (m.tick === 400 ? 15 : (seed % 4) + player) : 0;
  }});
  const states = [[0, 0], [0, 0]], calls = [0, 0];
  try {
    for (let tick = 0; tick < 4000; tick++) {
      const applied = await Promise.all(p.peers.map((peer, player) => peer.synchronize(tick, () => {
        calls[player]++; return owned(player, tick);
      }, JSON.stringify(states[player]))));
      assert.deepEqual(applied[0], applied[1]);
      assert.deepEqual(applied[0], [owned(0, tick), owned(1, tick), neutralPad(), neutralPad()]);
      applied.forEach((pads, player) => pads.slice(0, 2).forEach((pad, slot) => {
        states[player][slot] += pad[1] + pad[0];
      }));
      assert.deepEqual(states[0], states[1]);
    }
    await step(p.peers, 4000, states.map(JSON.stringify)); // confirm the final fixture state
    assert.deepEqual(calls, [4000, 4000]);
    assert.notEqual(states[0][0], 0); assert.notEqual(states[0][1], 0);
  } finally { p.close(); }
});

test('Ready verifies identity before acquiring input', async () => {
  const p = pair({otherIdentity: {...identity, disc: 'wrong'}, timeoutMs: 100}); let acquired = 0;
  try {
    const results = await Promise.allSettled(p.peers.map(peer => peer.synchronize(0, () => { acquired++; return neutralPad(); }, 'initial')));
    assert.ok(results.every(r => r.status === 'rejected')); assert.equal(acquired, 0);
  } finally { p.close(); }
});

test('state mutation blocks both peers before the next fixture tick', async () => {
  const p = pair();
  try {
    await step(p.peers, 0);
    const results = await Promise.allSettled(p.peers.map((peer, i) => peer.synchronize(1, () => owned(i, 1), i ? 'mutated' : 'same')));
    assert.ok(results.every(r => r.status === 'rejected'));
  } finally { p.close(); }
});

test('valid input mutation changes applied traces and next state confirmation catches it', async () => {
  const p = pair({change: (m, i) => { if (i === 1 && m.type === 'input' && m.tick === 0) m.pad[0] = 256; return m; }});
  try {
    const pads = await step(p.peers, 0);
    assert.notDeepEqual(pads[0], pads[1]);
    const state = pads.map(value => JSON.stringify(value));
    const results = await Promise.allSettled(p.peers.map((peer, i) => peer.synchronize(1, () => owned(i, 1), state[i])));
    assert.ok(results.every(r => r.status === 'rejected'));
  } finally { p.close(); }
});

for (const [name, mutate] of [
  ['stale session', m => { m.session = 'old'; }],
  ['wrong owner', m => { m.player = 0; }],
  ['future tick', m => { m.tick = 2; }],
  ['invalid pad', m => { m.pad[1] = 128; }],
]) test(`${name} fails closed`, async () => {
  const p = pair({change: (m, i) => { if (i === 1 && m.type === 'input') mutate(m); return m; }});
  try {
    const results = await Promise.allSettled(p.peers.map((peer, i) => peer.synchronize(0, () => owned(i, 0), 'same')));
    assert.ok(results.every(r => r.status === 'rejected'));
  } finally { p.close(); }
});

test('ordered hold makes no progress until actual peer input arrives', async () => {
  const p = pair({delay: (m, i) => m.type === 'input' && i === 1 ? 40 : 0});
  try {
    let finished = false; const pending = step(p.peers, 0).then(() => { finished = true; });
    await new Promise(resolve => setTimeout(resolve, 10)); assert.equal(finished, false);
    await pending; assert.equal(finished, true);
  } finally { p.close(); }
});

test('duplicate consumed input cannot enter the next logical tick', async () => {
  const p = pair();
  try {
    await step(p.peers, 0);
    p.channels[1].send(p.sent[1].find(m => m.type === 'input'));
    const results = await Promise.allSettled(p.peers.map((peer, i) => peer.synchronize(1, () => owned(i, 1), 'same')));
    assert.ok(results.every(r => r.status === 'rejected'));
  } finally { p.close(); }
});

test('missing application message times out; stop rejects the pending gate; fresh session starts neutral', async () => {
  const p = pair({change: (m, i) => m.type !== 'ready' && i === 1 ? null : m, timeoutMs: 25});
  try {
    const results = await Promise.allSettled(p.peers.map((peer, i) => peer.synchronize(0, () => owned(i, 0), 'same')));
    assert.ok(results.every(r => r.status === 'rejected'));
    assert.match(results[0].reason.message, /timed out/);
  } finally { p.close(); }
  const fresh = pair({session: 'new'});
  try {
    const pads = await Promise.all(fresh.peers.map(peer => peer.synchronize(0, neutralPad, 'initial')));
    assert.ok(pads.every(value => value.every(pad => pad.every(n => n === 0))));
    const pending = fresh.peers[0].synchronize(1, neutralPad, 'initial');
    fresh.peers[1].stop(); await assert.rejects(pending, /stopped/);
  } finally { fresh.close(); }
});

test('disconnect and concurrent engine boundaries reject without fallback', async () => {
  let disconnected;
  const peer = createConfirmedInput({channel: {send() {}, subscribe(_receive, close) { disconnected = close; return () => {}; }}, session: 'alone', player: 0, identity});
  peer.start(); const pending = peer.synchronize(0, neutralPad, 'initial');
  disconnected(); await assert.rejects(pending, /disconnected/);
  const p = pair();
  try {
    const first = p.peers[0].synchronize(0, neutralPad, 'initial');
    await assert.rejects(p.peers[0].synchronize(0, neutralPad, 'initial'), /boundary/);
    await assert.rejects(first, /boundary/);
  } finally { p.close(); }
});
