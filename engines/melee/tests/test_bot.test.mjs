import test from 'node:test';import assert from 'node:assert/strict';
import {createTestBot} from '../tools/netplay/test-bot.mjs';
import {EventEmitter} from 'node:events';
test('Stop during browser launch prevents stale join and lets the next session retry without duplicate browsers',async()=>{
 let release,launches=0,contexts=0;const pending=new Promise(resolve=>release=resolve),browser={async newContext(){contexts++;throw Error('fixture stops at context boundary');},async close(){}};
 const bot=createTestBot({chromium:{launch(){launches++;return pending;}},origin:'http://127.0.0.1:1',iso:'fixed-private-path'});
 const first=bot.start({room:'a'.repeat(32),session:'old'});bot.stop('old');
 const next=bot.start({room:'b'.repeat(32),session:'fresh'});release(browser);
 await assert.rejects(first,/stopped/);await assert.rejects(next,/context boundary/);assert.equal(launches,1);assert.equal(contexts,1);assert.equal(bot.activeSession,undefined);await bot.close();
});
test('failed Chrome launch permits a fresh-room retry and failed-launch shutdown',async()=>{
 let launches=0,contexts=0,closes=0;
 const browser={async newContext(){contexts++;throw Error('successful launch reached context');},async close(){closes++;}};
 const bot=createTestBot({chromium:{async launch(){if(++launches===1)throw Error('transient Chrome launch failure');return browser;}},origin:'http://127.0.0.1:1',iso:'fixed-private-path'});
 await assert.rejects(bot.start({room:'a'.repeat(32),session:'failed'}),/transient Chrome launch failure/);
 assert.equal(bot.activeSession,undefined);
 await assert.rejects(bot.start({room:'b'.repeat(32),session:'retry'}),/successful launch reached context/);
 assert.equal(launches,2);assert.equal(contexts,1);assert.equal(bot.activeSession,undefined);
 await bot.close();assert.equal(closes,1);
 const failed=createTestBot({chromium:{async launch(){throw Error('Chrome unavailable');}},origin:'http://127.0.0.1:1',iso:'fixed-private-path'});
 await assert.rejects(failed.start({room:'c'.repeat(32),session:'failed-close'}),/Chrome unavailable/);
 await failed.close();
});
test('disconnected cached Chrome is replaced on the next fresh room',async()=>{
 let launches=0,contexts=0;const browsers=[];
 const bot=createTestBot({chromium:{async launch(){launches++;const browser=new EventEmitter();browser.newContext=async()=>{contexts++;throw Error('context boundary');};browser.close=async()=>{};browsers.push(browser);return browser;}},origin:'http://127.0.0.1:1',iso:'fixed-private-path'});
 await assert.rejects(bot.start({room:'a'.repeat(32),session:'before-crash'}),/context boundary/);
 browsers[0].emit('disconnected');
 await assert.rejects(bot.start({room:'b'.repeat(32),session:'after-crash'}),/context boundary/);
 assert.equal(launches,2);assert.equal(contexts,2);await bot.close();
});

test('Stop cancels a standalone opponent waiting for cancelled predecessor cleanup',async()=>{
 let releaseCleanup,enteredCleanup,contexts=0,launches=0;
 const cleanup=new Promise(resolve=>releaseCleanup=resolve),entered=new Promise(resolve=>enteredCleanup=resolve);
 const page=new EventEmitter();page.addInitScript=async()=>{};page.goto=async()=>{throw Error('old fixture');};page.evaluate=async()=>{};
 const context={route:async()=>{},newPage:async()=>page,close:()=>{enteredCleanup();return cleanup;}};
 const browser={newContext:async()=>{if(++contexts===1)return context;throw Error('fresh fixture');},close:async()=>{}};
 const bot=createTestBot({chromium:{launch:async()=>{launches++;return browser;}},origin:'http://127.0.0.1:1',iso:'local'});
 const old=bot.start({room:'a'.repeat(32),session:'old'}),oldRejected=assert.rejects(old,/old fixture/);await entered;bot.stop('old');
 const cancelled=bot.start({room:'b'.repeat(32),session:'cancelled-waiter'}),cancelledRejected=assert.rejects(cancelled,/stopped/);bot.stop('cancelled-waiter');
 const fresh=bot.start({room:'c'.repeat(32),session:'fresh'}),freshRejected=assert.rejects(fresh,/fresh fixture/);releaseCleanup();
 await Promise.all([oldRejected,cancelledRejected,freshRejected]);assert.equal(contexts,2);assert.equal(launches,1);assert.equal(bot.activeSession,undefined);await bot.close();
});
