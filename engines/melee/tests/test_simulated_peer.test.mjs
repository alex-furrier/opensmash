import test from 'node:test';import assert from 'node:assert/strict';
import {createSimulatedPeer} from '../server/simulated-peer.mjs';
import {EventEmitter} from 'node:events';
test('Stop during browser launch closes the old browser before a fresh session acquires its own browser',async()=>{
 let release,launches=0,contexts=0;const pending=new Promise(resolve=>release=resolve),browser={async newContext(){contexts++;throw Error('fixture stops at context boundary');},async close(){}};
 const bot=createSimulatedPeer({chromium:{launch(){launches++;return pending;}},origin:'http://127.0.0.1:1',iso:'fixed-private-path'});
 const first=bot.start({room:'a'.repeat(32),session:'old'});bot.stop('old');
 const next=bot.start({room:'b'.repeat(32),session:'fresh'});release(browser);
 await assert.rejects(first,/stopped/);await assert.rejects(next,/could not prepare/);assert.equal(launches,2);assert.equal(contexts,1);await bot.close();
});
test('failed Chrome launch permits a fresh-room retry and failed-launch shutdown',async()=>{
 let launches=0,contexts=0,closes=0;
 const browser={async newContext(){contexts++;throw Error('successful launch reached context');},async close(){closes++;}};
 const bot=createSimulatedPeer({chromium:{async launch(){if(++launches===1)throw Error('transient Chrome launch failure');return browser;}},origin:'http://127.0.0.1:1',iso:'fixed-private-path'});
 await assert.rejects(bot.start({room:'a'.repeat(32),session:'failed'}),/could not prepare/);

 await assert.rejects(bot.start({room:'b'.repeat(32),session:'retry'}),/could not prepare/);
 assert.equal(launches,2);assert.equal(contexts,1);
 await bot.close();assert.equal(closes,1);
 const failed=createSimulatedPeer({chromium:{async launch(){throw Error('Chrome unavailable');}},origin:'http://127.0.0.1:1',iso:'fixed-private-path'});
 await assert.rejects(failed.start({room:'c'.repeat(32),session:'failed-close'}),/could not prepare/);
 await failed.close();
});
test('each fresh room owns its browser and cannot reuse a previous closed instance',async()=>{
 let launches=0,contexts=0;const browsers=[];
 const bot=createSimulatedPeer({chromium:{async launch(){launches++;const browser=new EventEmitter();browser.newContext=async()=>{contexts++;throw Error('context boundary');};browser.close=async()=>{};browsers.push(browser);return browser;}},origin:'http://127.0.0.1:1',iso:'fixed-private-path'});
 await assert.rejects(bot.start({room:'a'.repeat(32),session:'before-crash'}),/could not prepare/);
 browsers[0].emit('disconnected');
 await assert.rejects(bot.start({room:'b'.repeat(32),session:'after-crash'}),/could not prepare/);
 assert.equal(launches,2);assert.equal(contexts,2);await bot.close();
});

test('shutdown during pending launch closes the owned browser after launch resolves',async()=>{
 let release,closes=0;const pending=new Promise(resolve=>release=resolve);
 const peer=createSimulatedPeer({chromium:{launch:()=>pending},origin:'http://127.0.0.1:1',iso:'local'});
 const start=peer.start({room:'a'.repeat(32),session:'pending'});const stopped=assert.rejects(start,/stopped/);const close=peer.close();
 release({close:async()=>{closes++;}});await stopped;await close;assert.equal(closes,1);
});

test('owned controller pulses down toward a lower opponent, releases between pulses, and returns neutral outside combat',async()=>{
 const {installSimulatedController}=await import('../server/simulated-peer.mjs');
 const names=['window','navigator','localStorage','sessionStorage'],saved=new Map(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]));let receive;
 try{
  const store={setItem(){}};
  Object.defineProperty(globalThis,'window',{configurable:true,value:{WebSocket:class{},addEventListener(type,callback){if(type==='message')receive=callback;}}});
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{}});
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:store});Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:store});
  installSimulatedController();
  const state=new Float32Array(48);state[3]=30;state[4]=0;state[15]=0;state[16]=50;
  const deliver=(scene,tick=5)=>receive({data:{type:'confirmed-tick',tick,selectedState:[0,scene,...new Uint32Array(state.buffer)]}});
  deliver(2,8);let pad=navigator.getGamepads()[0];assert.equal(pad.axes[0],.45);assert.equal(pad.axes[1],1);assert.ok(pad.buttons.every(b=>!b.pressed));
  deliver(2,10);assert.equal(navigator.getGamepads()[0].axes[1],0);
  state[16]=0;deliver(2,8);assert.equal(navigator.getGamepads()[0].axes[0],.45);
  state[16]=50;deliver(2,30);assert.equal(navigator.getGamepads()[0].axes[1],0);
  deliver(5);pad=navigator.getGamepads()[0];assert.deepEqual(pad.axes,[0,0,0,0]);assert.ok(pad.buttons.every(b=>!b.pressed));
 }finally{for(const name of names){const descriptor=saved.get(name);if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}}
});

test('Stop cancels a session waiting for predecessor teardown before it acquires browser resources',async()=>{
 let releaseCleanup,cleanupStarted,contexts=0,launches=0;
 const cleanup=new Promise(resolve=>releaseCleanup=resolve),entered=new Promise(resolve=>cleanupStarted=resolve);
 const context={route:async()=>{},newPage:async()=>({addInitScript:async()=>{},goto:async()=>{throw Error('old fixture');},locator:()=>({allTextContents:async()=>[]})}),close:()=>{cleanupStarted();return cleanup;}};
 const browser={newContext:async()=>{if(++contexts===1)return context;throw Error('fresh fixture');},close:async()=>{}};
 const peer=createSimulatedPeer({chromium:{launch:async()=>{launches++;return browser;}},origin:'http://127.0.0.1:1',iso:'local'});
 const old=peer.start({room:'a'.repeat(32),session:'old'});const oldRejected=assert.rejects(old,/could not prepare/);await entered;peer.stop('old');
 const cancelled=peer.start({room:'b'.repeat(32),session:'cancelled-waiter'});const waiterRejected=assert.rejects(cancelled,/stopped/);peer.stop('cancelled-waiter');
 const fresh=peer.start({room:'c'.repeat(32),session:'fresh'});const freshRejected=assert.rejects(fresh,/could not prepare/);releaseCleanup();
 await Promise.all([oldRejected,waiterRejected,freshRejected]);assert.equal(contexts,2);assert.equal(launches,2);await peer.close();
});

test('Stop interrupts stalled context acquisition by closing that session browser; retry launches a fresh browser',async()=>{
 let rejectContext,entered,launches=0,closes=0;
 const atContext=new Promise(resolve=>entered=resolve);
 const stalled={newContext:()=>new Promise((_,reject)=>{rejectContext=reject;entered();}),close:async()=>{closes++;rejectContext(Error('Browser closed'));}};
 const fresh={newContext:async()=>{throw Error('fresh context boundary');},close:async()=>{closes++;}};
 const peer=createSimulatedPeer({chromium:{launch:async()=>++launches===1?stalled:fresh},origin:'http://127.0.0.1:1',iso:'local'});
 const first=peer.start({room:'a'.repeat(32),session:'stalled'});const failed=assert.rejects(first,/Browser closed/);await atContext;peer.stop('stalled');await failed;
 await assert.rejects(peer.start({room:'b'.repeat(32),session:'retry'}),/could not prepare/);await peer.close();assert.equal(launches,2);assert.equal(closes,2);
});
