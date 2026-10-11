// SPDX-License-Identifier: MIT
// One ordered, reliable, peer-only connection per fresh two-player session.
// This owns input confirmation, never the engine loop, disc or room registry.
const PAD_LIMITS = [[0, 65535], [-128, 127], [-128, 127], [-128, 127], [-128, 127],
  [0, 255], [0, 255], [0, 255], [0, 255], [-3, 0]];
export const neutralPad = () => [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
function padCopy(pad) {
  if (!Array.isArray(pad) || pad.length !== PAD_LIMITS.length ||
      !pad.every((n, i) => Number.isInteger(n) && n >= PAD_LIMITS[i][0] && n <= PAD_LIMITS[i][1]))
    throw Error('Invalid PADStatus');
  return pad.slice();
}
function token(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 256;
}
function identityKey(identity) {
  // Hash verified local values before constructing the session. Never send assets.
  const fields = ['engine', 'disc', 'rules', 'costumes', 'seed'];
  if (!identity || !fields.every(key => token(identity[key]))) throw Error('Incomplete identity');
  return JSON.stringify(fields.map(key => identity[key]));
}

/**
 * channel: {send(message), subscribe(receive, disconnect): unsubscribe}
 * subscribe must deliver messages asynchronously, in order, from the assigned peer.
 * player is the room-assigned engine slot, not a physical controller index.
 * state is a canonical selected-state digest supplied by the engine, not a snapshot.
 */
export function createConfirmedInput({channel, session, player, identity, timeoutMs = 5000}) {
  if (!token(session) || ![0, 1].includes(player) || !Number.isInteger(timeoutMs) || timeoutMs < 1)
    throw Error('Invalid session configuration');
  const key = identityKey(identity);
  let tick = 0, remoteTick = 0, started = false, peerReady = false, busy = false;
  let stopped, remote, unsubscribe, peerAccepted = false;
  let appliedRemote, appliedAck = false, appliedBusy = false, appliedTick = -1;
  const waiters = new Set();
  const wake = () => { for (const fn of [...waiters]) fn(); };
  function stop(reason = 'Session stopped', notify = true) {
    if (stopped) return;
    stopped = Error(String(reason)); remote = undefined;
    if (notify) { try { channel.send({type: 'stop', session}); } catch {} }
    unsubscribe?.(); wake();
  }
  function check() { if (stopped) throw stopped; }
  function waitFor(predicate,reason='Peer timed out') {
    check();
    if (predicate()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => stop(reason), timeoutMs);
      const poll = () => {
        if (!stopped && !predicate()) return;
        clearTimeout(timer); waiters.delete(poll);
        if (stopped) reject(stopped); else resolve();
      };
      waiters.add(poll); poll();
    });
  }
  function receive(message) {
    if (stopped) return;
    try {
      if (!message || message.session !== session) throw Error('Session mismatch');
      if (message.type === 'stop') { stop('Peer stopped', false); return; }
      if (message.player !== 1 - player) throw Error('Input ownership mismatch');
      if (message.type === 'ready') {
        if (peerReady || message.version !== 1 || message.identity !== key)
          throw Error('Ready identity mismatch');
        peerReady = true;
      } else if (message.type === 'input') {
        if (!started || !peerReady || remote || message.tick !== remoteTick || message.tick !== tick ||
            !Number.isSafeInteger(message.tick) || !token(message.state))
          throw Error('Input sequence mismatch');
        const preparation = message.preparation || [false, false];
        if (!Array.isArray(preparation) || preparation.length !== 2 || !preparation.every(n => typeof n === 'boolean'))
          throw Error('Invalid preparation readiness');
        remote = {pad: padCopy(message.pad), state: message.state, preparation};
        remoteTick++;
      } else if (message.type === 'accepted') {
        if (!busy || !remote || peerAccepted || message.tick !== tick)
          throw Error('Confirmation sequence mismatch');
        peerAccepted = true;
      } else if (message.type === 'applied') {
        if (!started || !peerReady || appliedRemote || !Number.isSafeInteger(message.tick) || message.tick <= appliedTick ||
            !(message.tick === tick - 1 || (busy && peerAccepted && message.tick === tick)) || !token(message.state))
          throw Error('Applied sequence mismatch');
        appliedRemote = {tick: message.tick, state: message.state};
      } else if (message.type === 'appliedAccepted') {
        if (!appliedBusy || appliedAck || message.tick !== tick - 1)
          throw Error('Applied confirmation mismatch');
        appliedAck = true;
      } else throw Error('Unknown input message');
      wake();
    } catch (error) { stop(error.message); }
  }
  unsubscribe = channel.subscribe(receive, () => stop('Peer disconnected', false));
  return {
    start() {
      check();
      if (started) return;
      started = true;
      try { channel.send({type: 'ready', session, player, version: 1, identity: key}); }
      catch (error) { stop(error.message); throw stopped; }
    },
    async synchronize(frame, acquireOwnedPad, state, preparation = [false, false]) {
      check();
      if (!started || busy || appliedBusy || frame !== tick || !Number.isSafeInteger(frame) || !token(state)) {
        stop('Invalid engine boundary'); throw stopped;
      }
      busy = true;
      try {
        await waitFor(() => peerReady);
        check();
        // Acquire once, here, after Ready. The callback cannot supply the peer's pad.
        if (!Array.isArray(preparation) || preparation.length !== 2 || !preparation.every(n => typeof n === 'boolean'))
          throw Error('Invalid preparation readiness');
        let acquired=false,value,acquisitionError;
        Promise.resolve(acquireOwnedPad()).then(pad=>{value=pad;acquired=true;wake();},error=>{acquisitionError=error;acquired=true;wake();});
        await waitFor(()=>acquired,'Owned input timed out');check();
        if(acquisitionError)throw acquisitionError;
        const local = padCopy(value);
        channel.send({type: 'input', session, player, tick, pad: local.slice(), state, preparation: preparation.slice()});
        await waitFor(() => Boolean(remote));
        check();
        if (remote.state !== state) throw Error('Selected state mismatch');
        channel.send({type: 'accepted', session, player, tick});
        await waitFor(() => peerAccepted);
        check();
        const pads = [neutralPad(), neutralPad(), neutralPad(), neutralPad()];
        pads[player] = local; pads[1 - player] = remote.pad.slice();
        Object.defineProperty(pads, 'preparation', {value: preparation.map((ready, i) => ready && remote.preparation[i])});
        remote = undefined; peerAccepted = false; tick++;
        return pads;
      } catch (error) { stop(error.message); throw stopped; }
      finally { busy = false; }
    },
    // Complete every consumed tick, including the final one. This confirms only
    // the caller's canonical selected-state digest, never a rollback snapshot.
    async confirmApplied(frame, state) {
      check();
      if (busy || appliedBusy || frame !== tick - 1 || frame !== appliedTick + 1 || !token(state)) {
        stop('Invalid applied boundary'); throw stopped;
      }
      appliedBusy = true;
      try {
        channel.send({type: 'applied', session, player, tick: frame, state});
        await waitFor(() => Boolean(appliedRemote));
        if (appliedRemote.tick !== frame || appliedRemote.state !== state) throw Error('Applied selected state mismatch');
        channel.send({type: 'appliedAccepted', session, player, tick: frame});
        await waitFor(() => appliedAck);
        appliedRemote = undefined; appliedAck = false; appliedTick = frame;
      } catch (error) { stop(error.message); throw stopped; }
      finally { appliedBusy = false; }
    },
    stop,
  };
}
