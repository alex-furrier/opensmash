import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,Server} from 'node:http';
import {existsSync} from 'node:fs';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createRuntimeAssets} from '../server/runtime-assets.mjs';
import {createLauncherRuntime} from '../server/launcher-runtime.mjs';
import {verifyRuntime} from '../runtime/web/netplay/identity.mjs';
const listeners=()=>new Set(process._getActiveHandles().filter(h=>h instanceof Server&&h.listening));
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'melee-runtime-assets-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const source=join(root,'platforms/browser'),binary=join(root,'build/browser/runtime/platforms/browser');
 await mkdir(source,{recursive:true});await mkdir(binary,{recursive:true});
 for(const name of ['runtime.mjs','runtime.html','gpu-preflight.mjs','disc-cache.mjs','save-migration.mjs','initial_pipeline_cache.db'])await writeFile(join(source,name),'fixture '+name);
 for(const name of ['melee_browser.js','melee_browser.wasm'])await writeFile(join(binary,name),'fixture '+name);
 return root;
}
async function serving(t,handle){
 const server=createServer((req,res)=>{if(!handle(req,res)){res.writeHead(418);res.end('not runtime');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 return 'http://127.0.0.1:'+server.address().port;
}
test('runtime assets verify through their HTTP interface without owning a listener or rooms',async t=>{
 const root=await fixture(t),before=listeners(),assets=await createRuntimeAssets(root);
 assert.deepEqual(listeners(),before);assert.ok(assets.manifest);
 const origin=await serving(t,assets.handle);
 await verifyRuntime(assets.manifest,async path=>{
  const response=await fetch(origin+path);assert.equal(response.status,200,path);
  assert.equal(response.headers.get('cross-origin-embedder-policy'),'require-corp');
  assert.equal(response.headers.get('cross-origin-resource-policy'),'same-origin');
  assert.equal(response.headers.get('cache-control'),'no-store');
  const bytes=new Uint8Array(await response.arrayBuffer());assert.equal(Number(response.headers.get('content-length')),bytes.length);return bytes;
 });
 assert.equal(await(await fetch(origin+'/engine/upstream/runtime.mjs?probe=1')).text(),'fixture runtime.mjs');
 for(const [method,path,status] of [['GET','/engine/not-here',404],['GET','/engine/upstream/melee_browser.worker.js',404],['POST','/engine/upstream/runtime.mjs',405],['HEAD','/engine/upstream/runtime.mjs',405],['GET','/unrelated',418]])assert.equal((await fetch(origin+path,{method})).status,status,path);
 await writeFile(join(root,'platforms/browser/runtime.mjs'),'changed fixture');
 await assert.rejects(verifyRuntime(assets.manifest,async path=>new Uint8Array(await(await fetch(origin+path)).arrayBuffer())),/Runtime verification failed/);
 const changed=await createRuntimeAssets(root);assert.notEqual(changed.manifest.identity.engine,assets.manifest.identity.engine);
});
test('an unavailable runtime cannot allocate a hidden listener',async()=>{
 const before=listeners(),assets=await createRuntimeAssets(undefined);
 assert.equal(assets.manifest,undefined);assert.match(assets.unavailable,/built candidate checkout/);assert.deepEqual(listeners(),before);
 await assert.rejects(createLauncherRuntime(undefined),/Build the verified friend-match engine/);assert.deepEqual(listeners(),before);
});
test('launcher preserves the verified manifest and route contract without an inner relay lifecycle',{skip:!existsSync(new URL('../build/direct-c/melee-audio.wasm',import.meta.url))&&'local audio WASM build required'},async t=>{
 const root=await fixture(t),before=listeners(),runtime=await createLauncherRuntime(root);
 assert.deepEqual(listeners(),before);assert.equal(runtime.close,undefined,'asset serving has no separate lifetime to close');
 const origin=await serving(t,runtime.handle),manifest=await(await fetch(origin+'/melee/api/netplay/manifest')).json();
 assert.equal(manifest.identity.engine,runtime.engine);assert.equal(createHash('sha256').update(JSON.stringify(manifest.files)).digest('hex'),runtime.engine);
 await verifyRuntime(manifest,async path=>new Uint8Array(await(await fetch(origin+path)).arrayBuffer()));
 assert.equal((await fetch(origin+'/melee/engine/native-fit/fit.mjs')).status,418);
 assert.equal((await fetch(origin+'/melee/engine/not-here')).status,404);
 assert.equal((await fetch(origin+'/melee/engine/upstream/runtime.mjs',{method:'POST'})).status,405);
});
