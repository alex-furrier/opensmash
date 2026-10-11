// SPDX-License-Identifier: MIT
import {createConfirmedInput} from './confirmed-input.mjs';

async function selectedDigest(state, previousApplied) {
  if (!Array.isArray(state) || state.length !== 50 || !state.every(n => Number.isInteger(n) && n >= 0 && n <= 0xffffffff))
    throw Error('Invalid selected engine state');
  const values = [...state, ...(previousApplied || [])], bytes = new ArrayBuffer(values.length * 4);
  const view = new DataView(bytes);
  values.forEach((n, i) => view.setUint32(i * 4, n >>> 0, true));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
}

/** Install before callMain. The runtime/room owns the assigned reliable channel.
 * Optional acquisition/observation callbacks support owned-input gameplay proof;
 * they never run the game or supply the remote controller. */
export function installConfirmedInput(Module, config, {acquireOwnedPad, onTick, onError} = {}) {
  if (Module._opensmash_confirmed_input_version?.() !== 1)
    throw Error('This Melee runtime lacks the confirmed-input boundary.');
  if (Module.onConfirmedInput || Module.ENV.MELEE_BROWSER_CONFIRMED_INPUT)
    throw Error('This runtime already owns an input session.');
  if (['MELEE_NET', 'MELEE_NET_RECORD', 'MELEE_NET_REPLAY', 'MELEE_NET_SYNCTEST'].some(k => Module.ENV[k]))
    throw Error('Confirmed input cannot share native netplay or replay ownership.');
  const session = createConfirmedInput(config);
  let pendingTick, appliedTick = -1, previousApplied;
  Module.onConfirmedInputError = message => { session.stop(message); onError?.(message); };
  Module.onConfirmedInput = async (tick, local, state) => {
    if (pendingTick !== undefined || tick !== appliedTick + 1) throw Error('Engine tick ownership mismatch');
    const digest = await selectedDigest(state, previousApplied);
    const pads = await session.synchronize(tick, () => acquireOwnedPad ? acquireOwnedPad(tick, local.slice()) : local.slice(), digest, Module.confirmedPreparationReady || [false, false]);
    // Both readiness values travel with the confirmed tick, so graphics timing
    // cannot release the simulation on different logical ticks.
    if (pads.preparation[0]) Module._opensmash_finish_intro_preparation?.();
    if (pads.preparation[1]) Module._opensmash_finish_preparation?.();
    pendingTick = tick;
    return pads;
  };
  Module.onConfirmedTick = async (tick, pads, state) => {
    if (tick !== pendingTick || tick !== appliedTick + 1 || !Array.isArray(pads) || pads.length !== 40)
      throw Error('Consumed engine tick ownership mismatch');
    await session.confirmApplied(tick, await selectedDigest(state, pads));
    previousApplied = pads.slice(); appliedTick = tick; pendingTick = undefined;
    onTick?.({tick, pads: pads.slice(), selectedState: state.slice()});
  };
  Module.ENV.MELEE_BROWSER_CONFIRMED_INPUT = '1';
  return {start: () => session.start(), stop: reason => session.stop(reason)};
}

/** MessagePort is a peer transport, not a room registry. Close reports failure. */
export function messagePortChannel(port) {
  return {
    send: message => port.postMessage(message),
    subscribe(receive, disconnected) {
      const message = ({data}) => receive(data);
      port.addEventListener('message', message);
      port.addEventListener('messageerror', disconnected);
      port.addEventListener('close', disconnected);
      port.start();
      return () => {
        port.removeEventListener('message', message);
        port.removeEventListener('messageerror', disconnected);
        port.removeEventListener('close', disconnected);
      };
    },
  };
}
