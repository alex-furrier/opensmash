import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateHandoff} from '../tools/netplay/handoff-api.mjs';
import {pairingFingerprint,startRomHandoffHost} from '../../../web-prototype/src/rom-handoff-client.js';
import {channelInbox,receiveGameFile} from '../../../web-prototype/shared/handoff-transfer.js';
const sdp=byte=>'v=0\r\na=fingerprint:sha-256 '+Array(32).fill(byte).join(':')+'\r\n';
test('private pairing is single receiver, exact key, expiring, signalling only',async()=>{
 let now=1;const h=createPrivateHandoff({now:()=>now}),host=await h.receive('/api/handoff/rooms',{},'local'),base='/api/handoff/rooms/'+host.code;
 await assert.rejects(h.receive('/api/handoff/rooms/ZZZZZZ/join',{}),/expired|never issued/);
 const guest=await h.receive(base+'/join',{});
 await assert.rejects(h.receive(base+'/join',{}),/Another device/);
 await assert.rejects(h.receive(base+'/messages',{poll:true,role:'guest',key:'wrong'}),/not part/);
 await assert.rejects(h.receive(base+'/messages',{role:'host',key:host.hostKey,message:{type:'file',path:'/private.iso'}}),/Only pairing/);
 await h.receive(base+'/messages',{role:'host',key:host.hostKey,message:{type:'offer',sdp:sdp('AA')}});
 assert.equal((await h.receive(base+'/messages',{poll:true,role:'guest',key:guest.guestKey})).messages.length,1);
 now+=5*60*1000;await assert.rejects(h.receive(base+'/messages',{poll:true,role:'host',key:host.hostKey}),/expired/);h.close();
});
test('pair confirmation binds actual SDP certificate fingerprints on both screens',async()=>{
 const a={localDescription:{sdp:sdp('AA')},remoteDescription:{sdp:sdp('BB')}};
 assert.equal(await pairingFingerprint(a),await pairingFingerprint({localDescription:a.remoteDescription,remoteDescription:a.localDescription}));
 assert.notEqual(await pairingFingerprint(a),await pairingFingerprint({...a,remoteDescription:{sdp:sdp('CC')}}));
 await assert.rejects(pairingFingerprint({...a,remoteDescription:{sdp:'peer supplied display token'}}),/fingerprint/);
 await assert.rejects(pairingFingerprint({...a,remoteDescription:{sdp:'a=fingerprint:sha-256 AA:BB\r\n'}}),/fingerprint/);
});
test('whole transfer deadline aborts a pending signalling fetch before file acquisition',async()=>{
 const original=globalThis.fetch;let loaded=false,aborted=false;
 try{
  globalThis.fetch=(_url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(new DOMException('deadline','AbortError'));},{once:true}));
  const host=startRomHandoffHost({game:'melee',iceServers:[],privatePolling:true,transferTimeoutMs:10,loadRom:async()=>{loaded=true;}});
  await assert.rejects(host.promise,{name:'AbortError'});assert.equal(aborted,true);assert.equal(loaded,false);
 }finally{globalThis.fetch=original;}
});
test('data-channel inbox rejects oversized frames and bounded queue overflow',async()=>{
 for(const data of [new ArrayBuffer(16385), 'x'.repeat(16385)]){const channel=new EventTarget(),inbox=channelInbox(channel);const wait=inbox.next();channel.dispatchEvent(new MessageEvent('message',{data}));await assert.rejects(wait,/bounded/);inbox.dispose();}
 const channel=new EventTarget(),inbox=channelInbox(channel,undefined,{maxQueuedFrames:2,maxQueuedBytes:4});
 for(let i=0;i<3;i++)channel.dispatchEvent(new MessageEvent('message',{data:new ArrayBuffer(2)}));
 await assert.rejects(inbox.next(),/bounded/);inbox.dispose();
});
test('wrong exact disc size rejects before OPFS allocation; partial writes clean up on error',async()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');let allocated=0,removed=false,cleanup;
 const channel={send(){}};
 try{
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{storage:{async getDirectory(){allocated++;return{async getDirectoryHandle(){return{async getFileHandle(){return{async createWritable(){return{async write(){throw new DOMException('disk full','QuotaExceededError');},async abort(){}};}};},async removeEntry(){removed=true;}};}};}}}});
  const wrong={next:async()=>JSON.stringify({type:'header',game:'melee',size:12})};
  await assert.rejects(receiveGameFile(channel,wrong,'melee',()=>{},()=>{},{expectedSize:1459978240}),/wrong disc size/);assert.equal(allocated,0);
  const frames=[JSON.stringify({type:'header',game:'melee',name:'fixture.iso',size:4}),new ArrayBuffer(4)];
  await assert.rejects(receiveGameFile(channel,{next:async()=>frames.shift()},'melee',()=>{},fn=>{cleanup=fn;},{expectedSize:4}),{name:'QuotaExceededError'});
  await cleanup();assert.equal(removed,true);
 }finally{Object.defineProperty(globalThis,'navigator',original);}
});
