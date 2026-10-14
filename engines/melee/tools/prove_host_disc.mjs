// Opt-in private proof. Profiles and evidence remain outside the Git checkout.
import {createRequire} from 'node:module';import {mkdir,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
import {ISO_SIZE,ISO_SHA256} from '../runtime/web/disc.mjs';
const args=process.argv.slice(2),option=name=>{const i=args.indexOf('--'+name);return i<0?undefined:args[i+1];};
const origin=option('origin'),output=option('output'),phase=option('phase')||'download';
if(!origin||!output||!process.env.MELEE_PLAYWRIGHT_MODULE)throw Error('Supply --origin, --output and MELEE_PLAYWRIGHT_MODULE.');
await mkdir(output,{recursive:true});const {chromium}=createRequire(import.meta.url)(process.env.MELEE_PLAYWRIGHT_MODULE);
const context=await chromium.launchPersistentContext(output+'/profile',{channel:'chrome',headless:true,viewport:{width:1440,height:1000}}),page=await context.newPage();page.setDefaultTimeout(180000);
const errors=[],progress=[],downloads=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='GET'&&new URL(r.url()).pathname==='/melee/api/disc')downloads.push(r.url());});
await context.addInitScript(()=>{localStorage.setItem('opensmash.melee-controls-complete.v1','complete');window.proofEvents=[];window.addEventListener('message',({data})=>{if(['select','playable','disc-verified','error'].includes(data?.type))window.proofEvents.push(data);});});
try{
 await page.goto(origin+'/melee');await page.waitForFunction(()=>window.openSmashReactBridge?.characters?.some(c=>c.meleeAvailable));
 const config=await (await page.request.get(origin+'/melee/api/disc-source')).json();assert.deepEqual(config,{available:true,url:'/melee/api/disc',size:ISO_SIZE,sha256:ISO_SHA256});
 const head=await page.request.head(origin+config.url);assert.equal(head.status(),200);assert.equal(Number(head.headers()['content-length']),ISO_SIZE);
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'ROM Management',exact:true}).click();await page.getByRole('tab',{name:'Melee',exact:true}).click();
 if(phase==='download'){
  const host=page.locator('.melee-disc-settings').getByRole('button',{name:'Load from host',exact:true});await host.click();
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('[role=status]')).some(e=>/Downloading your game/.test(e.textContent)));
  progress.push(await page.locator('.melee-disc-settings').innerText());await page.getByRole('button',{name:'Cancel download',exact:true}).click();await host.waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('.melee-disc-settings')?.textContent.includes('Download cancelled'));
  await host.click();await page.getByRole('button',{name:'Clear disc',exact:true}).waitFor();
 }else await page.getByRole('button',{name:'Clear disc',exact:true}).waitFor();
 const saved=await page.evaluate(async()=>{const root=await navigator.storage.getDirectory(),dir=await root.getDirectoryHandle('opensmash-melee-disc-v1');const name=await(await(await dir.getFileHandle('current')).getFile()).text();const file=await(await dir.getFileHandle(name)).getFile();return {size:file.size,name,staging:[]};});assert.equal(saved.size,ISO_SIZE);
 await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.waitForFunction(()=>document.body.style.position!=='fixed');
 const slug=await page.evaluate(()=>window.openSmashReactBridge.characters.find(c=>c.meleeAvailable).slug);
 await page.locator(`[data-roster-character="${slug}"] .replica-select-control`).evaluate(el=>el.click());await page.locator('#local-fighter-selection').getByRole('button',{name:'Play locally',exact:true}).click();
 const mode=page.locator('.melee-setup').getByRole('button',{name:'Play locally',exact:true});await page.waitForFunction(()=>document.querySelector('.game-overlay')||Array.from(document.querySelectorAll('.melee-setup button')).some(b=>b.textContent==='Play locally'));if(await mode.isVisible())await mode.click();
 for(let i=0;i<30;i++){if(await page.evaluate(()=>window.proofEvents.some(e=>e.type==='playable')))break;const confirm=page.getByRole('button',{name:'Confirm · A',exact:true});if(await confirm.isVisible())await confirm.click();await page.waitForTimeout(1000);}
 await page.waitForFunction(()=>window.proofEvents.some(e=>e.type==='playable'));const runtime=page.frames().find(f=>f.url().includes('/engine/upstream/runtime.html'));assert.ok(runtime);
 const start=await runtime.evaluate(()=>window.Module._direct_frame_count());await runtime.waitForFunction(n=>window.Module._direct_frame_count()>=n,start+60);const end=await runtime.evaluate(()=>window.Module._direct_frame_count());
 await page.getByRole('button',{name:'Return to roster',exact:true}).click();const completedDownloads=downloads.length;
 await page.reload();await page.waitForFunction(()=>window.openSmashReactBridge?.isAuthorized());assert.equal(downloads.length,completedDownloads,'cache reuse requests no ISO bytes');if(phase==='restore')assert.equal(downloads.length,0,'browser/server restart restores verified cache without a disc GET');
 assert.deepEqual(errors,[]);await page.screenshot({path:output+'/'+phase+'.png'});await writeFile(output+'/'+phase+'.json',JSON.stringify({phase,source:config.url,size:saved.size,digest:config.sha256,downloads:downloads.length,cancelAndRetry:phase==='download',progress,gameTicks:end-start,cacheReuseNoDownload:true,restartRestore:phase==='restore',errors},null,2));
}finally{await context.close();}
