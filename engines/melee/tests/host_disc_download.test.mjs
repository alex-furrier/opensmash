import test from 'node:test';import assert from 'node:assert/strict';
import {hostDiscSource,downloadHostDisc,hostDiscProgress} from '../web/lib/host-disc-download.mjs';
import {verifyDiscChunks} from '../runtime/web/verify-disc.mjs';
import {discFailureDetails} from '../runtime/web/disc.mjs';
import {cacheDisc,restoreCachedDisc} from '../web/lib/disc-cache.mjs';
import {createHash} from 'node:crypto';
class Directory{
 entries=new Map();writes=[];
 constructor(wholeBackingBuffer=false){this.wholeBackingBuffer=wholeBackingBuffer;}
 async getDirectoryHandle(n,{create=false}={}){if(!this.entries.has(n)){if(!create)throw new DOMException('missing','NotFoundError');this.entries.set(n,new Directory(this.wholeBackingBuffer));}return this.entries.get(n);}
 async getFileHandle(n,{create=false}={}){if(!this.entries.has(n)){if(!create)throw new DOMException('missing','NotFoundError');this.entries.set(n,new File([],n));}return{getFile:async()=>this.entries.get(n),createWritable:async()=>{let parts=[];return{write:async b=>{if(ArrayBuffer.isView(b)){this.writes.push(b.byteLength);parts.push((this.wholeBackingBuffer?new Uint8Array(b.buffer):new Uint8Array(b.buffer,b.byteOffset,b.byteLength)).slice());}else parts.push(b);},close:async()=>this.entries.set(n,new File(parts,n)),abort:async()=>{parts=[];}};}};}
 async removeEntry(n){this.entries.delete(n);}async *keys(){yield* this.entries.keys();}
}
test('optional source is absent by default and rejects embedded credentials or unsafe schemes',()=>{
 assert.equal(hostDiscSource('', 'https://app.example/melee'),null);
 assert.equal(hostDiscSource('/game.iso','https://app.example/melee'),'https://app.example/game.iso');
 for(const url of ['ftp://example.com/game','http://example.com/game','https://user:password@example.com/game'])assert.throws(()=>hostDiscSource(url,'https://app.example'),/secure/);
});
test('small HTTP fragments are written in bounded batches without corrupting tails or adopting a cancelled transfer',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator'),root=new Directory();
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{storage:{getDirectory:async()=>root,persist:async()=>true}}});
 const bytes=new Uint8Array(2*1024*1024+12345);for(let i=0;i<bytes.length;i++)bytes[i]=(i*13+(i>>>13))&255;
 const response=()=>{let offset=0;return new Response(new ReadableStream({pull(controller){if(offset===bytes.length){controller.close();return;}const next=Math.min(offset+8192,bytes.length);controller.enqueue(bytes.subarray(offset,next));offset=next;}}),{headers:{'content-length':String(bytes.length)}});};
 const acceptFile=async(file,signal)=>{assert.equal(createHash('sha256').update(new Uint8Array(await file.arrayBuffer())).digest('hex'),createHash('sha256').update(bytes).digest('hex'));await cacheDisc(file,signal,()=>{});};
 try{
  await cacheDisc(new File(['previous verified copy'],'old.iso'),new AbortController().signal,()=>{});
  const abort=new AbortController(),progress=[];
  await assert.rejects(downloadHostDisc({url:'http://127.0.0.1/fixture',size:bytes.length,signal:abort.signal,fetchFile:async()=>response(),onProgress:n=>{progress.push(n);abort.abort();},acceptFile}),{name:'AbortError'});
  assert.deepEqual(progress,[1024*1024]);assert.equal(await(await restoreCachedDisc()).text(),'previous verified copy');
  const directory=root.entries.get('opensmash-melee-disc-v1');assert.equal([...directory.entries.keys()].filter(n=>n.startsWith('incoming-')).length,0);directory.writes=[];
  await downloadHostDisc({url:'http://127.0.0.1/fixture',size:bytes.length,signal:new AbortController().signal,fetchFile:async()=>response(),acceptFile});
  assert.deepEqual(directory.writes,[1024*1024,1024*1024,12345]);assert.equal((await restoreCachedDisc()).size,bytes.length);
 }finally{if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;}
});
test('early download progress shows received bytes before the first whole percent and reports observed rate',()=>{
 const size=1459978240;
 assert.match(hostDiscProgress(1048576,size,500),/0\.1%.*1\.0 MB of 1\.46 GB/);
 assert.doesNotMatch(hostDiscProgress(1048576,size,500),/MB\/s/);
 assert.match(hostDiscProgress(1048576,size,2000),/0\.5 MB\/s/);
 assert.match(hostDiscProgress(size,size,10000),/100%/);
});
test('redirect failure may use the explicit host fallback, but byte/hash failures and cancellation do not hide behind retries',async()=>{
 const controller=new AbortController(),calls=[];let accepted=0;
 const run=(fetchFile,extra={})=>downloadHostDisc({url:'/melee/api/disc',fallbackUrl:'/melee/api/disc-host',size:3,signal:controller.signal,fetchFile,receive:async(response)=>{assert.equal(response.ok,true);return new File(['abc'],'fixture.iso');},acceptFile:async()=>{accepted++;},...extra});
 await run(async url=>{calls.push(url);if(calls.length===1)throw TypeError('network');return new Response('abc');});assert.deepEqual(calls,['/melee/api/disc','/melee/api/disc-host']);assert.equal(accepted,1);
 calls.length=0;await run(async url=>{calls.push(url);return new Response('abc',{status:calls.length===1?403:200});});assert.equal(calls.length,2);
 calls.length=0;await assert.rejects(run(async url=>{calls.push(url);return new Response('abc');},{acceptFile:async()=>{throw Error('disc hash mismatch');}}),/hash/);assert.equal(calls.length,1);
 calls.length=0;controller.abort();await assert.rejects(run(async url=>{calls.push(url);return new Response('abc');}),{name:'AbortError'});assert.equal(calls.length,0);
});
test('host stream uses existing verification/cache, supports retry, and preserves saved copy on all failures',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator'),root=new Directory();
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{storage:{getDirectory:async()=>root,persist:async()=>true}}});
 const bytes=new TextEncoder().encode('private test fixture'),trusted={size:bytes.length,chunkBytes:8,chunks:[0,8,16].map(i=>createHash('sha256').update(bytes.slice(i,i+8)).digest('hex'))};
 const response=(value=bytes,length=bytes.length)=>new Response(value,{headers:{'content-length':String(length)}});
 const acceptFile=async(file,signal)=>{await verifyDiscChunks(file,trusted);signal.throwIfAborted();await cacheDisc(file,signal,()=>{});};
 try{
  await cacheDisc(new File(['old saved disc'],'old.iso'),new AbortController().signal,()=>{});
  const run=(options={})=>downloadHostDisc({url:'http://127.0.0.1/fixture',size:bytes.length,signal:new AbortController().signal,fetchFile:async()=>response(),acceptFile,...options});
  await assert.rejects(run({url:null}),/not configured/);
  await assert.rejects(run({fetchFile:async()=>response(bytes,1)}));
  await assert.rejects(run({fetchFile:async()=>response(bytes.slice(1))}),/whole file/);
  const corrupt=bytes.slice();corrupt[10]^=1;await assert.rejects(run({fetchFile:async()=>response(corrupt)}),/disc hash/);
  await assert.rejects(run({fetchFile:async()=>new Response(new ReadableStream({start(c){c.error(Error('interrupted'));}}),{headers:{'content-length':String(bytes.length)}})}),/interrupted/);
  const abort=new AbortController();await assert.rejects(run({signal:abort.signal,onProgress:()=>abort.abort()}),{name:'AbortError'});
  assert.equal(await(await restoreCachedDisc()).text(),'old saved disc');
  assert.equal([...root.entries.get('opensmash-melee-disc-v1').entries.keys()].filter(n=>n.startsWith('incoming-')).length,0);
  const progress=[];await run({onProgress:n=>progress.push(n)});assert.equal(progress.at(-1),bytes.length);
  assert.equal(await(await restoreCachedDisc()).text(),'private test fixture');
 }finally{if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;}
});

test('completed downloads retain the original disk-backed File and reject a truncated saved file before verification',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator'),root=new Directory();
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{storage:{getDirectory:async()=>root}}});
 const bytes=new TextEncoder().encode('complete downloaded file');
 try{
  await cacheDisc(new File(['previous saved game'],'old.iso'),new AbortController().signal,()=>{});
  const directory=root.entries.get('opensmash-melee-disc-v1');let accepted=0;
  const run=()=>downloadHostDisc({url:'/disc',size:bytes.length,signal:new AbortController().signal,fetchFile:async()=>new Response(bytes,{headers:{'content-length':String(bytes.length)}}),acceptFile:async file=>{accepted++;const receipt=file[Symbol.for('opensmash.received-disc')];assert.equal(file,directory.entries.get(receipt.name),'no full-size File/Blob rewrapping');await cacheDisc(file,new AbortController().signal,()=>{});}});
  await run();assert.equal(accepted,1);assert.equal(await(await restoreCachedDisc()).text(),'complete downloaded file');
  const original=directory.getFileHandle.bind(directory);
  directory.getFileHandle=async(name,options)=>{const handle=await original(name,options);if(name.startsWith('incoming-')){return{...handle,createWritable:async()=>{const writer=await handle.createWritable();return{...writer,close:async()=>{await writer.close();directory.entries.set(name,new File([],name));}};}};}return handle;};
  await assert.rejects(run(),error=>{assert.equal(error.discStage,'download-saved-file');assert.equal(error.expectedBytes,bytes.length);assert.equal(error.actualBytes,0);assert.equal(error.receivedBytes,bytes.length);return true;});
  assert.equal(accepted,1);assert.equal(await(await restoreCachedDisc()).text(),'complete downloaded file');
 }finally{if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;}
});
for(const failure of ['write','close','getFile'])test(`native ${failure} failure reports its exact download stage and preserves the saved game`,async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator'),root=new Directory();
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{storage:{getDirectory:async()=>root}}});
 try{
  await cacheDisc(new File(['retained'],'old.iso'),new AbortController().signal,()=>{});
  const directory=root.entries.get('opensmash-melee-disc-v1'),original=directory.getFileHandle.bind(directory);
  directory.getFileHandle=async(name,options)=>{const handle=await original(name,options);if(!name.startsWith('incoming-'))return handle;const fail=()=>{throw new DOMException('native opaque error with a private filename','UnknownError');};return{getFile:failure==='getFile'?fail:handle.getFile,createWritable:async()=>{const writer=await handle.createWritable();return{...writer,...(failure==='getFile'?{}:{[failure]:fail})};}};};
  let accepted=false;
  await assert.rejects(downloadHostDisc({url:'/disc',size:3,signal:new AbortController().signal,fetchFile:async()=>new Response('abc',{headers:{'content-length':'3'}}),acceptFile:async()=>{accepted=true;}}),error=>{assert.equal(error.name,'UnknownError');assert.equal(error.discStage,{write:'download-write',close:'download-close',getFile:'download-saved-file'}[failure]);assert.equal(error.expectedBytes,3);assert.equal(error.receivedBytes,3);assert.doesNotMatch(error.message,/private filename/);return true;});
  assert.equal(accepted,false);assert.equal(await(await restoreCachedDisc()).text(),'retained');assert.equal([...directory.entries.keys()].filter(name=>name.startsWith('incoming-')).length,0);
 }finally{if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;}
});

// iOS 27.1 Simulator Safari wrote a view's entire backing buffer. Model that
// filesystem boundary so the real receiver must preserve exact bytes and size.
for(const {name,size,fragmentBytes,offset=0,padding=0} of [
 {name:'64 KiB coalesced tail',size:65536,fragmentBytes:8192},
 {name:'ISO-sized final tail after full batches',size:2*1048576+360448,fragmentBytes:8192},
 {name:'large zero-offset stream view',size:1048576+13,fragmentBytes:1048576+13,padding:29},
 {name:'large nonzero-offset stream view',size:1048576+13,fragmentBytes:1048576+13,offset:17,padding:29},
 {name:'exact whole-buffer stream chunk',size:1048576,fragmentBytes:1048576},
])test(`whole-backing-buffer writer preserves ${name}`,async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator'),root=new Directory(true);
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{storage:{getDirectory:async()=>root}}});
 const backing=new Uint8Array(offset+size+padding).fill(255),bytes=backing.subarray(offset,offset+size);
 for(let index=0;index<size;index++)bytes[index]=(index*13+(index>>>13))&255;
 const expected=createHash('sha256').update(bytes).digest('hex');let position=0;
 const response=new Response(new ReadableStream({pull(controller){if(position===size){controller.close();return;}const end=Math.min(position+fragmentBytes,size);controller.enqueue(bytes.subarray(position,end));position=end;}}),{headers:{'content-length':String(size)}});
 try{
  await cacheDisc(new File(['previous verified copy'],'old.iso'),new AbortController().signal,()=>{});
  await downloadHostDisc({url:'http://127.0.0.1/fixture',size,signal:new AbortController().signal,fetchFile:async()=>response,acceptFile:async(file,signal)=>{
   assert.equal(file.size,size);assert.equal(createHash('sha256').update(new Uint8Array(await file.arrayBuffer())).digest('hex'),expected);
   await cacheDisc(file,signal,()=>{});
  }});
  const restored=await restoreCachedDisc(size);
  assert.equal(restored.size,size);assert.equal(createHash('sha256').update(new Uint8Array(await restored.arrayBuffer())).digest('hex'),expected);
  const directory=root.entries.get('opensmash-melee-disc-v1');
  assert.equal([...directory.entries.keys()].filter(name=>name.startsWith('incoming-')).length,1,'only the adopted incoming file remains');
 }finally{if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;}
});

for(const operation of ['root','directory','lock','file','writable'])test(`download open diagnostics identify ${operation} failure without changing the saved copy`,async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator'),root=new Directory();
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{storage:{getDirectory:async()=>root}}});
 let failures=0,accepted=false;const progress=[];
 const fail=()=>{failures++;throw new DOMException('private staging filename and https://private.invalid/token','UnknownError');};
 try{
  await cacheDisc(new File(['retained verified copy'],'old.iso'),new AbortController().signal,()=>{});
  const directory=root.entries.get('opensmash-melee-disc-v1'),getDirectory=root.getDirectoryHandle.bind(root),getFile=directory.getFileHandle.bind(directory);
  const pointer=await directory.entries.get('current').text();
  if(operation==='root')navigator.storage.getDirectory=fail;
  if(operation==='directory')root.getDirectoryHandle=fail;
  if(operation==='lock')navigator.locks={request:async()=>fail()};
  if(operation==='file'||operation==='writable')directory.getFileHandle=async(name,options)=>{
   if(name.startsWith('incoming-')&&operation==='file')return fail();
   const handle=await getFile(name,options);return name.startsWith('incoming-')?{...handle,createWritable:fail}:handle;
  };
  await assert.rejects(downloadHostDisc({url:'/disc',size:1459978240,signal:new AbortController().signal,fetchFile:async()=>new Response(new Uint8Array(65536),{headers:{'content-length':'1459978240'}}),onProgress:bytes=>progress.push(bytes),acceptFile:async()=>{accepted=true;}}),error=>{
   assert.equal(error.name,'UnknownError');assert.equal(error.discStage,`download-open-${operation}`);assert.equal(error.expectedBytes,1459978240);
   assert.deepEqual(discFailureDetails(error),{name:'UnknownError',discStage:`download-open-${operation}`,expectedBytes:1459978240});
   assert.doesNotMatch(error.message,/private|filename|https:/);return true;
  });
  assert.equal(failures,1,'diagnostics must not introduce automatic storage retries');assert.equal(accepted,false);assert.deepEqual(progress,[]);
  navigator.storage.getDirectory=async()=>root;delete navigator.locks;root.getDirectoryHandle=getDirectory;directory.getFileHandle=getFile;
  assert.equal(await directory.entries.get('current').text(),pointer);assert.equal(await(await restoreCachedDisc()).text(),'retained verified copy');
  assert.equal([...directory.entries.keys()].filter(name=>name.startsWith('incoming-')).length,0,'only the failed attempt staging may be removed');
 }finally{if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;}
});

for(const cancelRejects of [false,true])test(`storage open failure cancels the unread HTTP body when cancel rejects=${cancelRejects}`,async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator');let cancelled=0,accepted=false;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{storage:{getDirectory:async()=>{throw new DOMException('private root','UnknownError');}}}});
 const response=new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(65536));},cancel(){cancelled++;if(cancelRejects)return Promise.reject(Error('cancel failed'));}}),{headers:{'content-length':'1459978240'}});
 try{
  await assert.rejects(downloadHostDisc({url:'/disc',size:1459978240,signal:new AbortController().signal,fetchFile:async()=>response,acceptFile:async()=>{accepted=true;}}),error=>error.name==='UnknownError'&&error.discStage==='download-open-root');
  await Promise.resolve();assert.equal(cancelled,1);assert.equal(accepted,false);
 }finally{if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;}
});
