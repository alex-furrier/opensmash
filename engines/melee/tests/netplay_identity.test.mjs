import test from 'node:test';
import assert from 'node:assert/strict';
import {installedIdentity,launch,seed,disc,sha256,verifyRuntime} from '../runtime/web/netplay/identity.mjs';
test('Ready identity derives actual installed rules, disc, seed, assets and fresh saves',async()=>{
 const engine='e'.repeat(64),options={verifiedDisc:disc,installedSeed:seed,freshSaves:true};
 const value=await installedIdentity(engine,structuredClone(launch),options);
 assert.equal(value.engine,engine);assert.equal(value.seed,'17');
 for(const change of [{verifiedDisc:'wrong'},{installedSeed:'18'},{freshSaves:false},{costumes:[{}]},{cssAssets:[{}]}])
  await assert.rejects(installedIdentity(engine,launch,{...options,...change}),/incompatible/);
 await assert.rejects(installedIdentity(engine,{...launch,stocks:3},options),/supports/);
 await assert.rejects(installedIdentity(engine,{...launch,extra:true},options),/supports/);
});
test('runtime verification checks every actual served byte and aggregate identity',async()=>{
 const bytes=new Uint8Array([1,2,3]),files=[{url:'/engine/upstream/melee_browser.wasm',sha256:await sha256(bytes)}];
 const engine=await sha256(new TextEncoder().encode(JSON.stringify(files))),manifest={files,identity:{engine}};
 assert.equal(await verifyRuntime(manifest,async()=>bytes),engine);
 await assert.rejects(verifyRuntime(manifest,async()=>new Uint8Array([1,2,4])),/verification/);
 await assert.rejects(verifyRuntime({...manifest,identity:{engine:'0'.repeat(64)}},async()=>bytes),/manifest identity/);
 await assert.rejects(verifyRuntime({...manifest,files:[{...files[0],url:'/engine/../private.iso'}]},async()=>bytes),/verification/);
});
