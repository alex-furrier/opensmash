import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import {createRequire} from 'node:module';
import {installedMatchIdentity} from '../runtime/web/netplay/match-identity.mjs';
import {disc,seed} from '../runtime/web/netplay/identity.mjs';
import {attachFriendRooms} from '../server/friend-rooms.mjs';
import {connectFriendRoom} from '../web/lib/friend-room.mjs';
const require=createRequire(new URL('../tools/netplay/package.json',import.meta.url)),WS=require('ws');
const launch={mode:0,stage:31,level:9,stocks:4,minutes:8,packedPorts:[1,2,768,768],ports:[{character:'vanilla:1'},{character:'vanilla:2'},{character:'vanilla:0'},{character:'vanilla:0'}],costumes:[]};
const engine='a'.repeat(64),options={verifiedDisc:disc,installedSeed:seed,freshSaves:true};
const asset=(name,byte)=>({filename:name,blob:new Blob([new Uint8Array(64).fill(byte)])});
test('prepared costume/CSS identity is independent of array ordering and rejects changed bytes or dirty saves',async()=>{
 const costumes=[asset('PlDk.dat',1),asset('PlFx.dat',2)],cssAssets=[asset('MnSlChr.dat',3)];
 const a=await installedMatchIdentity(engine,launch,{...options,costumes,cssAssets});
 assert.deepEqual(a,await installedMatchIdentity(engine,launch,{...options,costumes:costumes.toReversed(),cssAssets}));
 const altered=await installedMatchIdentity(engine,launch,{...options,costumes:[costumes[0],asset('PlFx.dat',9)],cssAssets});assert.notEqual(a.costumes,altered.costumes);
 await assert.rejects(installedMatchIdentity(engine,launch,{...options,freshSaves:false}),/Unverified/);
 await assert.rejects(installedMatchIdentity(engine,launch,{...options,costumes:[costumes[0],costumes[0]]}),/Invalid/);
});
test('two launcher clients require both identical Ready identities, Stop ends both and fresh retry gets a new session',async()=>{
 const server=createServer(),rooms=attachFriendRooms(server,{engine});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 class BrowserSocket extends WS{constructor(url){super(url,{origin});}}
 const events=[[],[]],owner=connectFriendRoom({type:'create',match:launch},e=>events[0].push(e),{origin,WebSocketImpl:BrowserSocket});let friend;
 try{
  const first=await owner.assignment;friend=connectFriendRoom({type:'join',room:first.room},e=>events[1].push(e),{origin,WebSocketImpl:BrowserSocket});const second=await friend.assignment;
  assert.equal(first.player,0);assert.equal(second.player,1);assert.deepEqual(first.launch,second.launch);
  const identity=await installedMatchIdentity(engine,launch,options);let started=false;const a=owner.ready(identity).then(value=>{started=true;return value;});await new Promise(r=>setTimeout(r,20));assert.equal(started,false);
  const b=friend.ready(identity);const [left,right]=await Promise.all([a,b]);assert.equal(left.session,right.session);assert.notEqual(left.player,right.player);
  owner.stop();await new Promise(r=>setTimeout(r,20));assert.equal(events[1].at(-1).type,'stopped');
  const retry=connectFriendRoom({type:'create',match:launch},()=>{},{origin,WebSocketImpl:BrowserSocket});const fresh=await retry.assignment;assert.notEqual(first.session,fresh.session);retry.stop();
 }finally{owner.stop();friend?.stop();rooms.close();await new Promise(r=>server.close(r));}
});
test('installed identity mismatch closes both real launcher connections before either starts',async()=>{
 const server=createServer(),rooms=attachFriendRooms(server,{engine});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 class BrowserSocket extends WS{constructor(url){super(url,{origin});}}
 const owner=connectFriendRoom({type:'create',match:launch},()=>{},{origin,WebSocketImpl:BrowserSocket});let friend;
 try{
  const first=await owner.assignment;friend=connectFriendRoom({type:'join',room:first.room},()=>{},{origin,WebSocketImpl:BrowserSocket});await friend.assignment;
  const good=await installedMatchIdentity(engine,launch,options);const left=owner.ready(good),right=friend.ready({...good,costumes:'b'.repeat(64)});
  const outcomes=await Promise.allSettled([left,right]);assert.ok(outcomes.every(result=>result.status==='rejected'));
 }finally{owner.stop();friend?.stop();rooms.close();await new Promise(r=>server.close(r));}
});
test('unverified runtime and invalid human-port layout cannot ready/start a friend match',async()=>{
 const server=createServer(),rooms=attachFriendRooms(server,{engine});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 class BrowserSocket extends WS{constructor(url){super(url,{origin});}}
 const bad=connectFriendRoom({type:'create',match:{...launch,packedPorts:[257,2,768,768]}},()=>{},{origin,WebSocketImpl:BrowserSocket});const owner=connectFriendRoom({type:'create',match:launch},()=>{},{origin,WebSocketImpl:BrowserSocket});
 try{await assert.rejects(bad.assignment,/two human/);await owner.assignment;const good=await installedMatchIdentity(engine,launch,options);await assert.rejects(owner.ready({...good,engine:'c'.repeat(64)}),/identity mismatch/);}
 finally{bad.stop();owner.stop();rooms.close();await new Promise(r=>server.close(r));}
});

test('local friend input selects the configured human device independently of game slot zero',async()=>{
 const {localFriendDevice}=await import('../web/lib/friend-room.mjs');
 assert.equal(localFriendDevice([{device:'cpu'},{device:'keyboard'},{device:'off'}]),'keyboard');
 assert.equal(localFriendDevice([{device:'off'},{device:'cpu'},{device:'gamepad2'}]),'gamepad2');
 assert.equal(localFriendDevice([{device:'cpu'},{device:'off'}]),undefined);
});
test('friend proposal retains validated Ice Climbers and Zelda companion metadata',async()=>{
 const {validateFriendProposal}=await import('../server/friend-rooms.mjs');
 const companion={character:'existing',target:'nana',fighter:14,color:0,filename:'PlNnNr.dat',companion:true};
 assert.equal(validateFriendProposal({...launch,costumes:[companion]}).costumes[0].companion,true);
 assert.equal(validateFriendProposal({...launch,costumes:[{...companion,target:'sheik',fighter:19,filename:'PlSkNr.dat'}]}).costumes[0].companion,true);
 assert.throws(()=>validateFriendProposal({...launch,costumes:[{...companion,target:'fox',fighter:2}]}),/companion/);
});
