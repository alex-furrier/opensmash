import test from 'node:test';import assert from 'node:assert/strict';
import {hostDiscSource,downloadHostDisc} from '../web/lib/host-disc-download.mjs';
import {verifyDiscChunks} from '../runtime/web/verify-disc.mjs';
import {cacheDisc,restoreCachedDisc} from '../web/lib/disc-cache.mjs';
import {createHash} from 'node:crypto';
class Directory{
 entries=new Map();
 async getDirectoryHandle(n,{create=false}={}){if(!this.entries.has(n)){if(!create)throw new DOMException('missing','NotFoundError');this.entries.set(n,new Directory());}return this.entries.get(n);}
 async getFileHandle(n,{create=false}={}){if(!this.entries.has(n)){if(!create)throw new DOMException('missing','NotFoundError');this.entries.set(n,new File([],n));}return{getFile:async()=>this.entries.get(n),createWritable:async()=>{let parts=[];return{write:async b=>parts.push(b),close:async()=>this.entries.set(n,new File(parts,n)),abort:async()=>{parts=[];}};}};}
 async removeEntry(n){this.entries.delete(n);}async *keys(){yield* this.entries.keys();}
}
test('optional source is absent by default and rejects embedded credentials or unsafe schemes',()=>{
 assert.equal(hostDiscSource('', 'https://app.example/melee'),null);
 assert.equal(hostDiscSource('/game.iso','https://app.example/melee'),'https://app.example/game.iso');
 for(const url of ['ftp://example.com/game','http://example.com/game','https://user:password@example.com/game'])assert.throws(()=>hostDiscSource(url,'https://app.example'),/secure/);
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
