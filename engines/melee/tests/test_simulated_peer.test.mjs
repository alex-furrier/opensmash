import test from 'node:test';import assert from 'node:assert/strict';
import {createSimulatedPeer} from '../server/simulated-peer.mjs';
import {EventEmitter} from 'node:events';
test('Stop during browser launch prevents stale join and lets the next session retry without duplicate browsers',async()=>{
 let release,launches=0,contexts=0;const pending=new Promise(resolve=>release=resolve),browser={async newContext(){contexts++;throw Error('fixture stops at context boundary');},async close(){}};
 const bot=createSimulatedPeer({chromium:{launch(){launches++;return pending;}},origin:'http://127.0.0.1:1',iso:'fixed-private-path'});
 const first=bot.start({room:'a'.repeat(32),session:'old'});bot.stop('old');
 const next=bot.start({room:'b'.repeat(32),session:'fresh'});release(browser);
 await assert.rejects(first,/stopped/);await assert.rejects(next,/could not prepare/);assert.equal(launches,1);assert.equal(contexts,1);await bot.close();
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
test('disconnected cached Chrome is replaced on the next fresh room',async()=>{
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
