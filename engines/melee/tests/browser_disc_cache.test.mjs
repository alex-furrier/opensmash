import test from 'node:test';
import assert from 'node:assert/strict';
import {cacheDisc,restoreCachedDisc,removeCachedDisc} from '../web/lib/disc-cache.ts';
import {stickVector} from '../web/lib/touch-pad.ts';
const missing=()=>new DOMException('missing','NotFoundError');
class Directory {
 entries=new Map();fail=false;
 async getDirectoryHandle(n,{create=false}={}){if(!this.entries.has(n)){if(!create)throw missing();this.entries.set(n,new Directory());}return this.entries.get(n);}
 async getFileHandle(n,{create=false}={}){
  if(!this.entries.has(n)){if(!create)throw missing();this.entries.set(n,new File([],n));}
  return {getFile:async()=>this.entries.get(n),createWritable:async()=>{
   let parts=[];return {write:async b=>{if(this.fail)throw new DOMException('quota','QuotaExceededError');parts.push(b);},close:async()=>this.entries.set(n,new File(parts,n)),abort:async()=>{parts=[];}};
  }};
 }
 async removeEntry(n){if(!this.entries.delete(n))throw missing();}
 async *keys(){yield* this.entries.keys();}
}
test('saving a verified disc checks existing persistence without requesting a blocking permission',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator'),root=new Directory();let requests=0,checks=0;
 try{
  for(const persistent of [false,true]){
   Object.defineProperty(globalThis,'navigator',{configurable:true,value:{storage:{getDirectory:async()=>root,persisted:async()=>{checks++;return persistent;},persist:async()=>{requests++;return true;}}}});
   const message=await cacheDisc(new File(['verified copy'],'disc.iso'),new AbortController().signal,()=>{});
   assert.equal(requests,0);assert.equal(await(await restoreCachedDisc()).text(),'verified copy');
   assert.match(message,persistent?/Disc saved/:/Disc cached/);
  }
  assert.equal(checks,2);
 }finally{if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;}
});
test('disc cache commits complete files, preserves old copy on abort/quota, and clears only its directory',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator'),root=new Directory();
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{storage:{getDirectory:async()=>root,persist:async()=>false}}});
 try{
  root.entries.set('saves',new Directory());assert.equal(await restoreCachedDisc(),undefined);
  await cacheDisc(new File(['verified original'],'original.iso'),new AbortController().signal,()=>{});
  assert.equal(await(await restoreCachedDisc()).text(),'verified original');
  const dir=root.entries.get('opensmash-melee-disc-v1');dir.entries.set('disc-abandoned.iso',new File(['incomplete'],'disc-abandoned.iso'));
  const cancel=new AbortController();await assert.rejects(cacheDisc(new File(['replacement'],'new.iso'),cancel.signal,()=>cancel.abort()),{name:'AbortError'});
  assert.equal(await(await restoreCachedDisc()).text(),'verified original');
  assert.equal(dir.entries.has('disc-abandoned.iso'),false,'abandoned staging files are reclaimed before another copy');
  root.entries.get('opensmash-melee-disc-v1').fail=true;
  await assert.rejects(cacheDisc(new File(['replacement'],'new.iso'),new AbortController().signal,()=>{}),{name:'QuotaExceededError'});
  assert.equal(await(await restoreCachedDisc()).text(),'verified original');
  await removeCachedDisc();assert.equal(await restoreCachedDisc(),undefined);assert(root.entries.has('saves'));
 }finally{if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;}
});
test('GameCube touch stick has neutral dead zone, full throw, inverted Y and circular diagonals',()=>{
 assert.deepEqual(stickVector(2,2,50),{x:0,y:0});
 assert.deepEqual(stickVector(100,0,50),{x:100,y:0});
 assert.deepEqual(stickVector(0,-50,50),{x:0,y:100});
 assert.deepEqual(stickVector(50,50,50),{x:71,y:-71});
 assert.deepEqual(stickVector(NaN,1,50),{x:0,y:0});
});
test('verified handoff disc is adopted without copying and active incoming transfers survive cleanup',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator'),root=new Directory();
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{storage:{getDirectory:async()=>root,persist:async()=>true}}});
 try{
  await cacheDisc(new File(['old'],'original.iso'),new AbortController().signal,()=>{});
  const dir=root.entries.get('opensmash-melee-disc-v1');
  const receipt={name:'incoming-123.iso',adopted:false},file=new File(['received disc'],'melee.iso');
  Object.defineProperty(file,Symbol.for('opensmash.received-disc'),{value:receipt});
  dir.entries.set(receipt.name,file);
  dir.entries.set('incoming-456.iso',new File(['still receiving'],'incoming-456.iso'));
  dir.entries.set('incoming-abandoned.iso',new File(['partial'],'incoming-abandoned.iso'));
  navigator.locks={request:async(name,options,callback)=>{if(typeof options==='function')return options();return callback(name==='opensmash-disc:incoming-456.iso'?null:{});}};
  let copied=false;
  await cacheDisc(file,new AbortController().signal,()=>{copied=true;});
  assert.equal(copied,false);assert.equal(receipt.adopted,true);
  assert.equal(dir.entries.has('incoming-abandoned.iso'),false,'closed-tab transfers are reclaimed');
  assert.equal(await(await restoreCachedDisc()).text(),'received disc');
  assert.equal(dir.entries.has('incoming-456.iso'),true);
  await cacheDisc(new File(['replacement'],'new.iso'),new AbortController().signal,()=>{});
  assert.equal(dir.entries.has(receipt.name),false,'previous adopted disc is reclaimed');
  assert.equal(dir.entries.has('incoming-456.iso'),true);
 }finally{if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;}
});
test('another tab Forget preserves locked incoming verification and adoption checks the staging file',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator'),root=new Directory();
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{storage:{getDirectory:async()=>root,persist:async()=>false}}});
 try{
  await cacheDisc(new File(['old'],'old.iso'),new AbortController().signal,()=>{});
  const dir=root.entries.get('opensmash-melee-disc-v1'),receipt={name:'incoming-active.iso',adopted:false},file=new File(['verified completed transfer'],'melee.iso');
  dir.entries.set(receipt.name,file);Object.defineProperty(file,Symbol.for('opensmash.received-disc'),{value:receipt});
  navigator.locks={request:async(name,options,callback)=>typeof options==='function'?options():callback(name===`opensmash-disc:${receipt.name}`?null:{})};
  await removeCachedDisc();assert.equal(await restoreCachedDisc(),undefined);assert.equal(dir.entries.has(receipt.name),true,'other tab must retain active validation file');
  await cacheDisc(file,new AbortController().signal,()=>{});assert.equal(receipt.adopted,true);assert.equal(await(await restoreCachedDisc()).text(),'verified completed transfer');
  await removeCachedDisc();dir.entries.delete(receipt.name);receipt.adopted=false;
  await assert.rejects(cacheDisc(file,new AbortController().signal,()=>{}),{name:'NotFoundError'});assert.equal(receipt.adopted,false);assert.equal(await restoreCachedDisc(),undefined);
  dir.entries.set(receipt.name,new File(['truncated'],receipt.name));await assert.rejects(cacheDisc(file,new AbortController().signal,()=>{}),/no longer complete/);assert.equal(receipt.adopted,false);
 }finally{if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;}
});

test('truncated saved-copy metadata is reported without clearing the pointer or file',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator'),root=new Directory();Object.defineProperty(globalThis,'navigator',{configurable:true,value:{storage:{getDirectory:async()=>root}}});
 try{
  await cacheDisc(new File(['complete'],'game.iso'),new AbortController().signal,()=>{});
  const dir=root.entries.get('opensmash-melee-disc-v1'),name=await dir.entries.get('current').text();dir.entries.set(name,new File(['short'],name));
  await assert.rejects(restoreCachedDisc(8),error=>{assert.equal(error.discStage,'cache-restore');assert.equal(error.expectedBytes,8);assert.equal(error.actualBytes,5);return true;});
  assert.equal(await dir.entries.get('current').text(),name);assert.equal(dir.entries.get(name).size,5);
 }finally{if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;}
});
for(const failure of ['pointer','truncated'])test(`failed ${failure} persistence never replaces the previous saved-copy pointer`,async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator'),root=new Directory();Object.defineProperty(globalThis,'navigator',{configurable:true,value:{storage:{getDirectory:async()=>root}}});
 try{
  await cacheDisc(new File(['retained'],'old.iso'),new AbortController().signal,()=>{});
  const dir=root.entries.get('opensmash-melee-disc-v1'),current=await dir.entries.get('current').text(),original=dir.getFileHandle.bind(dir);
  dir.getFileHandle=async(name,options)=>{const handle=await original(name,options);return{...handle,createWritable:async()=>{const writer=await handle.createWritable();return{...writer,write:async value=>{if(failure==='pointer'&&name==='current')throw new DOMException('opaque','UnknownError');await writer.write(value);},close:async()=>{await writer.close();if(failure==='truncated'&&name!==current&&name.startsWith('disc-'))dir.entries.set(name,new File([],name));}};}};};
  await assert.rejects(cacheDisc(new File(['replacement'],'new.iso'),new AbortController().signal,()=>{}),error=>{assert.equal(error.discStage,failure==='pointer'?'cache-pointer':'cache-saved-file');assert.equal(error.expectedBytes,11);if(failure==='truncated')assert.equal(error.actualBytes,0);return true;});
  assert.equal(await dir.entries.get('current').text(),current);assert.equal(await(await restoreCachedDisc()).text(),'retained');
 }finally{if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;}
});
test('setup diagnostics use only a 64KiB probe and retain the existing saved game',async()=>{
 const{inspectDiscStorage}=await import('../web/lib/disc-cache.mjs');const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator'),root=new Directory();Object.defineProperty(globalThis,'navigator',{configurable:true,value:{storage:{getDirectory:async()=>root}}});
 try{
  await cacheDisc(new File(['retained'],'private-filename.iso'),new AbortController().signal,()=>{});
  const report=await inspectDiscStorage();assert.deepEqual(report,{storageAvailable:true,savedBytes:8,writableAvailable:true,probeBytes:65536,probeReadBytes:16});
  assert.equal(await(await restoreCachedDisc()).text(),'retained');assert.equal(root.entries.get('opensmash-disc-diagnostics-v1').entries.size,0);assert.doesNotMatch(JSON.stringify(report),/filename|incoming|disc-|http|private/);
 }finally{if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;}
});
