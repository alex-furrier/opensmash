import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {openAsBlob} from 'node:fs';
import {verifyDisc, verifyDiscChunks} from '../runtime/web/verify-disc.mjs';

const bytes=Uint8Array.from({length:35},(_,i)=>i*7);
const trusted={size:bytes.length,chunkBytes:16,chunks:[0,16,32].map(i=>createHash('sha256').update(bytes.slice(i,i+16)).digest('hex'))};

test('verifies every chunk, including final partial chunk, with bounded sequential reads',async()=>{
 const reads=[],progress=[];
 await verifyDiscChunks({size:bytes.length,slice(start,end){reads.push([start,end]);return new Blob([bytes.slice(start,end)]);}},trusted,n=>progress.push(n));
 assert.deepEqual(reads,[[0,16],[16,32],[32,35]]);
 assert.deepEqual(progress,[0,16,32,35]);
});
for(const position of [0,17,34])test(`rejects corruption at byte ${position}`,async()=>{
 const bad=bytes.slice();bad[position]^=1;
 await assert.rejects(verifyDiscChunks(new Blob([bad]),trusted),/known USA 1.02 Melee disc hash/);
});
test('rejects wrong size, short reads, and unreadable files',async()=>{
 await assert.rejects(verifyDiscChunks(new Blob([bytes.slice(1)]),trusted),/unexpected size/);
 await assert.rejects(verifyDiscChunks({size:35,slice:()=>new Blob([])},trusted),/read completely/);
 await assert.rejects(verifyDiscChunks({size:35,slice(){throw Error('permission denied');}},trusted),/permission denied/);
});
test('checks the pinned manifest against a real disc', {skip:!process.env.MELEE_ISO},async()=>{
 await verifyDisc(await openAsBlob(process.env.MELEE_ISO));
});

test('releases verified chunk backing stores before reading the next chunk',
 {skip:typeof ArrayBuffer.prototype.transfer!=='function'},async()=>{
 const inputs=[];
 await verifyDiscChunks({size:bytes.length,slice(start,end){
  assert.ok(inputs.every(buffer=>buffer.byteLength===0));
  return {async arrayBuffer(){const buffer=bytes.slice(start,end).buffer;inputs.push(buffer);return buffer;}};
 }},trusted);
 assert.ok(inputs.every(buffer=>buffer.byteLength===0));
});

test('native verification read failures preserve safe stage and byte counts',async()=>{
 await assert.rejects(verifyDiscChunks({size:35,slice(){return{arrayBuffer:async()=>{throw new DOMException('opaque filename or URL','UnknownError');}};}},trusted),error=>{assert.equal(error.name,'UnknownError');assert.equal(error.discStage,'verification-read@0');assert.equal(error.expectedBytes,35);assert.equal(error.actualBytes,35);assert.doesNotMatch(error.message,/opaque filename|URL/);return true;});
});
test('production verification uses at most 4MiB reads with every byte covered',async()=>{
 const{default:manifest}=await import('../runtime/web/disc-chunks.mjs');assert.equal(manifest.chunkBytes,4*1024*1024);assert.equal(manifest.chunks.length,Math.ceil(manifest.size/manifest.chunkBytes));
});

test('iframe string diagnostics retain whole-file and short-read counts separately',async()=>{
 const {discFailureDetails}=await import('../runtime/web/disc.mjs');
 await assert.rejects(verifyDiscChunks({size:35,slice:()=>new Blob([])},trusted),error=>{
  const expected={name:'Error',discStage:'verification-read@0',expectedBytes:35,actualBytes:35,readOffset:0,expectedReadBytes:16,actualReadBytes:0};
  assert.deepEqual(discFailureDetails(error),expected);
  assert.deepEqual(discFailureDetails(Error(error.message)),expected);
  return true;
 });
});
test('iframe string diagnostics preserve allowlisted native errors without private text',async()=>{
 const {discFailureDetails}=await import('../runtime/web/disc.mjs');
 await assert.rejects(verifyDiscChunks({size:35,slice(){return{arrayBuffer:async()=>{throw new DOMException('https://private.example/?token=secret filename','UnknownError');}};}},trusted),error=>{
  assert.deepEqual(discFailureDetails(Error(error.message)),{name:'UnknownError',discStage:'verification-read@0',expectedBytes:35,actualBytes:35});
  assert.doesNotMatch(JSON.stringify(discFailureDetails(Error(error.message))),/private|token|filename|https/);
  return true;
 });
});
