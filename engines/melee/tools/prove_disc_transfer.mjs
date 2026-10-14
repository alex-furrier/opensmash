/** Private browser proof; actual ISO bytes and browser storage never enter Git. */
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {startRelay} from './netplay/server.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
if(!process.env.MELEE_PC_ROOT||!process.env.MELEE_ISO||!process.env.TEST_OUTPUT)throw Error('Supply private MELEE_PC_ROOT, MELEE_ISO and outside-repository TEST_OUTPUT.');
const out=process.env.TEST_OUTPUT;await mkdir(out,{recursive:true});
const relay=process.env.PROOF_ORIGIN?undefined:await startRelay({engineRoot:process.env.MELEE_PC_ROOT});
const origin=process.env.PROOF_ORIGIN||relay.origin,browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
const cached=page=>page.evaluate(async()=>{const root=await navigator.storage.getDirectory();try{const dir=await root.getDirectoryHandle('opensmash-melee-disc-v1');return [...await Array.fromAsync(dir.keys())];}catch(error){if(error.name==='NotFoundError')return[];throw error;}});
try{
 for(const scenario of (process.env.TRANSFER_SCENARIOS||'cancel,mutation,reference').split(',')){
  const contexts=[await browser.newContext(),await browser.newContext()],pages=[await contexts[0].newPage(),await contexts[1].newPage()];let apiBytes=0,apiMax=0,httpBinary=false;
  for(const context of contexts)await context.route('**/*',route=>{const request=route.request(),url=new URL(request.url());if(url.origin!==origin)return route.abort();if(url.pathname.startsWith('/api/handoff/')){const n=request.postDataBuffer()?.length||0;apiBytes+=n;apiMax=Math.max(apiMax,n);}if(/\.(iso|gcm|bin)$/.test(url.pathname))httpBinary=true;return route.continue();});
  if(scenario==='mutation')await contexts[0].addInitScript(()=>{const Native=RTCPeerConnection;window.RTCPeerConnection=class extends Native{createDataChannel(...args){const channel=super.createDataChannel(...args),send=channel.send.bind(channel);let mutated=false;channel.send=value=>{if(value instanceof ArrayBuffer&&!mutated){new Uint8Array(value)[123]^=1;mutated=true;}send(value);};return channel;}};});
  try{
   for(const page of pages)await page.goto(origin+'/?debug=1');
   await pages[0].waitForFunction(()=>!document.getElementById('disc-receive').disabled);
   await pages[1].waitForFunction(()=>!document.getElementById('disc-receive').disabled);
   await pages[0].locator('#disc').setInputFiles(process.env.MELEE_ISO);
   await pages[0].locator('#disc-send').click();
   await pages[0].waitForFunction(()=>document.getElementById('pair-code').textContent.length===6,{},{timeout:90000});
   const code=await pages[0].locator('#pair-code').textContent();await pages[1].locator('#transfer-code').fill(code);await pages[1].locator('#disc-receive').click();
   await pages[0].locator('#transfer-confirm').waitFor({state:'visible',timeout:60000});
   assert.equal(await pages[0].locator('#pair-fingerprint').textContent(),await pages[1].locator('#pair-fingerprint').textContent());
   assert.ok(!(await cached(pages[1])).includes('current'));assert.ok(!(await cached(pages[1])).some(x=>x.startsWith('incoming-')));
   await pages[0].locator('#transfer-confirm').click();
   if(scenario==='cancel'){
    await pages[1].waitForFunction(()=>/Saving on this device/.test(document.getElementById('transfer-status').textContent));await pages[1].locator('#transfer-cancel').click();
    await pages[1].waitForFunction(()=>!document.getElementById('disc-receive').disabled);assert.deepEqual(await cached(pages[1]),[]);
   }else if(scenario==='mutation'){
    await pages[1].waitForFunction(()=>/does not match/.test(document.getElementById('transfer-status').textContent),{},{timeout:240000});
    await pages[1].waitForFunction(()=>!document.getElementById('disc-receive').disabled);assert.deepEqual(await cached(pages[1]),[]);
   }else{
    await pages[1].waitForFunction(()=>/Verified and ready/.test(document.getElementById('transfer-status').textContent),{},{timeout:240000});
    assert.ok((await cached(pages[1])).includes('current'));
    const size=await pages[1].evaluate(async()=>{const {restoreCachedDisc}=await import('/transfer/disc-cache.mjs');return(await restoreCachedDisc()).size;});assert.equal(size,1459978240);
    await pages[1].reload();await pages[1].waitForFunction(()=>/Verified saved copy restored/.test(document.getElementById('transfer-status').textContent),{},{timeout:90000});
    await pages[1].locator('#disc-forget').click();await pages[1].waitForFunction(()=>/removed/.test(document.getElementById('transfer-status').textContent));assert.deepEqual(await cached(pages[1]),[]);
   }
   assert.equal(httpBinary,false);assert.ok(apiMax<=16384);results.push({scenario,passed:true,fullISO:scenario!=='cancel',confirmationBeforeBytes:true,cacheReload:scenario==='reference',partialCleaned:scenario!=='reference',httpBinary:false,signallingBytes:apiBytes,maxSignalBodyBytes:apiMax});console.log(scenario+' passed');
  }finally{for(const context of contexts)await context.close();}
 }
 const sources=['engines/melee/runtime/web/netplay/disc-transfer.mjs','engines/melee/runtime/web/netplay/lobby-client.mjs','engines/melee/tools/netplay/handoff-api.mjs','engines/melee/tools/netplay/server.mjs','web-prototype/shared/handoff-transfer.js','web-prototype/src/rom-handoff-client.js','engines/melee/web/lib/disc-cache.mjs'];const sourceSha256={};for(const path of sources)sourceSha256[path]=createHash('sha256').update(await readFile(new URL('../../../'+path,import.meta.url))).digest('hex');
 await writeFile(out+'/summary.json',JSON.stringify({browser:browser.version(),origin:process.env.PROOF_ORIGIN?'approved-private-HTTPS':'loopback',discBytes:1459978240,sourceSha256,results},null,2)+'\n');
}finally{await browser.close();await relay?.close();}
