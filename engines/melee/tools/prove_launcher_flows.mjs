// Opt-in local acceptance. Uses the actual launcher, fresh storage and UI controls.
// No game assets belong in this repository. Supply your own local disc and output path.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const args=process.argv.slice(2),option=name=>{const index=args.indexOf('--'+name);return index<0?undefined:args[index+1];};
const origin=option('origin'),iso=option('iso'),output=option('output'),slug=option('character');
if(!origin||!iso||!output||!slug||!process.env.MELEE_PLAYWRIGHT_MODULE)throw Error('Supply --origin, --iso, --output, --character and MELEE_PLAYWRIGHT_MODULE.');
const profileSeconds=Number(option('profile-seconds')||0),debugScenario=option('debug-scenario');
if(profileSeconds!==0&&(!Number.isInteger(profileSeconds)||profileSeconds<30||profileSeconds>120))throw Error('Profile seconds must be 30–120.');
if(debugScenario&&!['reference','delay','jitter','hold'].includes(debugScenario))throw Error('Invalid debug scenario.');
const {chromium}=createRequire(import.meta.url)(process.env.MELEE_PLAYWRIGHT_MODULE);
const out=resolve(output);await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.setDefaultTimeout(120000);
const consoleLog=[],network=[],wire=[],results=[];
page.on('console',message=>consoleLog.push({type:message.type(),text:message.text()}));
page.on('pageerror',error=>consoleLog.push({type:'pageerror',text:error.message}));
page.on('response',async response=>{if(response.url().includes('/api/'))network.push({url:response.url(),status:response.status(),error:response.status()>=400?await response.text().catch(()=>null):undefined});});
page.on('websocket',socket=>{socket.on('framesent',event=>{try{const data=JSON.parse(event.payload);if(data.type!=='peer'||['applied','input'].includes(data.packet?.type))wire.push({direction:'sent',...data});}catch{}});socket.on('framereceived',event=>{try{const data=JSON.parse(event.payload);if(data.type!=='peer'||['applied','input'].includes(data.packet?.type))wire.push({direction:'received',...data});}catch{}});});
await page.addInitScript(()=>{window.launcherProof=[];window.ownedInputTrace=[];window.addEventListener('message',({data})=>{if(['pad','input'].includes(data?.type)){window.ownedInputTrace.push(data);if(window.ownedInputTrace.length>2000)window.ownedInputTrace.shift();}if(['playable','error','confirmed-tick','session','status','progress','metrics','frame-stall','combat-performance','startup-performance'].includes(data?.type)){window.launcherProof.push({observedAt:performance.now(),...data});if(window.launcherProof.length>15000)window.launcherProof.shift();}});});
const pick=()=>page.locator(`[data-roster-character="${slug}"]`);
const snapshot=async()=>{
 const frame=page.frames().find(frame=>frame.url().includes('/engine/upstream/runtime.html'));assert.ok(frame,'actual upstream runtime frame');
 return frame.evaluate(()=>{const m=window.Module,pointer=m._direct_snapshot();return {frame:m._direct_frame_count(),scene:m._direct_scene_kind(),state:Array.from(HEAPF32.subarray(pointer>>>2,(pointer>>>2)+48))};});
};
async function setupDisc(){
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'ROM Management',exact:true}).click();await page.getByRole('tab',{name:'Melee',exact:true}).click();
 await page.locator('.melee-disc-settings input[type=file]').setInputFiles(iso);await page.getByRole('button',{name:'Clear disc',exact:true}).waitFor();
 await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();
}
// Optional existing debug fixture affects only this diagnostic client's acquisition.
if(debugScenario)await context.addInitScript(scenario=>{window.addEventListener('message',({data})=>{if(data?.type==='select'&&data.netplay)data.netplay.debug={scripted:false,scenario,seed:17};});},debugScenario);
async function begin(mode,skip=false){
 await page.evaluate(()=>{window.launcherProof=[];});await pick().click();
 if(skip){const tutorial=page.getByRole('button',{name:'Skip',exact:true}),choice=page.getByRole('button',{name:mode==='solo'?'Play solo':'Play against computer',exact:true});await Promise.race([tutorial.waitFor(),choice.waitFor()]);if(await tutorial.isVisible())await tutorial.click();}
 await page.getByRole('button',{name:mode==='solo'?'Play solo':'Play against computer',exact:true}).click();
 if(mode==='computer'){await page.getByRole('button',{name:'Create room',exact:true}).click();await page.getByRole('button',{name:'Ready',exact:true}).click();}
}
async function playable(label){
 await page.waitForFunction(()=>window.launcherProof.some(row=>row.type==='playable')||document.querySelector('.game-message[role=alert]')||document.body.innerText.includes('timed out'),{},{timeout:180000});
 assert.ok(await page.evaluate(()=>window.launcherProof.some(row=>row.type==='playable')),label+' must reach actual gameplay');
 await page.getByRole('heading',{name:display,exact:true}).waitFor();
 const controlFrame=page.frames().find(frame=>frame.url().includes('/engine/upstream/runtime.html'));
 await controlFrame.waitForFunction(()=>{const m=window.Module,offset=m._direct_snapshot()>>>2;return HEAPF32[offset]===1&&HEAPF32[offset+2]<322;},{},{timeout:15000});
 const before=await snapshot();assert.equal(before.scene,2);assert.equal(before.state[0],1);
 await page.keyboard.down('d');await controlFrame.waitForFunction(frame=>window.Module._direct_frame_count()>=frame,before.frame+90,{timeout:15000});const moved=await snapshot();await page.keyboard.down('j');await controlFrame.waitForFunction(frame=>window.Module._direct_frame_count()>=frame,moved.frame+8,{timeout:15000});await page.keyboard.up('j');await page.keyboard.up('d');
 const after=await snapshot();await writeFile(out+'/'+label+'-control.json',JSON.stringify({before,moved,after},null,2));const runtime=page.frames().find(frame=>frame.url().includes('/engine/upstream/runtime.html'));const acquired=await runtime.evaluate(()=>window.ownedInputTrace);assert.ok(acquired.some(row=>row.values?.[0]===0&&(row.values[1]&0x100)&& (row.type==='input'?row.values[2]>0:(row.values[2]&255)>128)),label+' keyboard crosses its actual owned input boundary');assert.ok(after.frame>before.frame+15,label+' native game progresses');assert.ok(Math.abs(moved.state[3]-before.state[3])>5,label+' owned keyboard controls the selected fighter');
 if(profileSeconds){await page.waitForTimeout(profileSeconds*1000);await writeFile(out+'/'+label+'-profile.json',JSON.stringify({events:await page.evaluate(()=>window.launcherProof),diagnostics:await page.evaluate(()=>window.meleeLaunchDiagnostics)},null,2));}
 await page.screenshot({path:out+'/'+label+'-start.png'});results.push({label,display,frames:after.frame-before.frame,positionDelta:moved.state[3]-before.state[3],actualPlayable:true});
}
async function stop(mode){
 await page.getByRole('button',{name:mode==='computer'?'Stop friend match':'Return to roster',exact:true}).click();
 if(mode==='computer')await page.getByRole('button',{name:'Return to roster',exact:true}).click();
 await page.getByRole('button',{name:'Create room',exact:true}).waitFor();
}
async function shortMatch(){
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Gameplay Options',exact:true}).click();await page.getByRole('tab',{name:'Melee',exact:true}).click();
 await page.getByLabel('Stocks',{exact:true}).fill('1');await page.getByLabel('Minutes (0 = unlimited)',{exact:true}).fill('1');await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();
}
async function resultsScreen(label){
 const frame=page.frames().find(frame=>frame.url().includes('/engine/upstream/runtime.html'));
 await frame.waitForFunction(()=>window.Module._direct_scene_kind()===5,{},{timeout:100000});await page.screenshot({path:out+'/'+label+'-results.png'});results.at(-1).actualResults=true;
}
let display;
try{
 await page.goto(origin+'/melee');const initial=await page.evaluate(()=>({local:Object.keys(localStorage),session:Object.keys(sessionStorage)}));assert.ok(!initial.local.includes('melee-launch-v1'),'no launch settings seeded');
 const roster=await page.evaluate(()=>fetch('/melee/api/imports?roster=active').then(r=>r.json()));const fighter=roster.find(row=>row.slug===slug);assert.ok(fighter);display=fighter.displayName||fighter.name;
 await setupDisc();await begin('solo',true);await playable('solo-default');
 const defaultFits=consoleLog.filter(row=>row.text.startsWith('[Native fit]'));assert.ok(defaultFits.length>=3,'default custom CPU preparation exercised');assert.ok(!network.some(row=>row.status>=400),'default launch has no failing asset requests');await stop('solo');
 await shortMatch();await begin('solo');await playable('solo-short');await resultsScreen('solo-short');await stop('solo');
 // A real acquisition fault must be visible and recover through the user's Retry.
 let fault=true;await context.route('**/api/native-fit/source/**',route=>{if(fault){fault=false;return route.abort();}return route.continue();});
 await begin('solo');await page.getByRole('button',{name:'Try again',exact:true}).waitFor();await page.screenshot({path:out+'/solo-fault.png'});await page.evaluate(()=>{window.launcherProof=[];});await page.getByRole('button',{name:'Try again',exact:true}).click();await playable('solo-retry');await context.unroute('**/api/native-fit/source/**');await stop('solo');
 await page.reload();await pick().waitFor();await begin('computer',true);await playable('computer-refreshed-cache');await resultsScreen('computer');await stop('computer');
 await begin('computer');await playable('computer-fresh-room');await stop('computer');
 const sessions=wire.filter(row=>row.type==='joined').map(row=>row.session);assert.equal(new Set(sessions).size,2,'retry owns a fresh room');
 await writeFile(out+'/summary.json',JSON.stringify({complete:true,initialStorage:initial,character:{slug,sourceName:fighter.name,displayName:display},results,uniqueComputerSessions:2,scope:'fresh Mac browser UI; local disc and actual keyboard input; read-only selected native snapshots; no WAN/hardware controller/rollback claim'},null,2));
 console.log('LAUNCHER FLOWS PASS',JSON.stringify(results));
}catch(error){await page.screenshot({path:out+'/failure.png'}).catch(()=>{});await writeFile(out+'/failure.json',JSON.stringify({error:error.message,body:await page.locator('body').innerText(),results},null,2));console.error(error);process.exitCode=1;}
finally{await writeFile(out+'/evidence.json',JSON.stringify({consoleLog,network,wire,observations:await page.evaluate(()=>window.launcherProof).catch(()=>[])},null,2));await browser.close();}
