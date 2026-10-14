import {assertOwnedPadPhase} from './proof/owned-pad-phase.mjs';
// Opt-in private local acceptance; no disc, roster or evidence is stored in Git.
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';
const args=process.argv.slice(2),option=name=>{const index=args.indexOf('--'+name);return index<0?undefined:args[index+1];};
const origin=option('origin'),iso=option('iso'),output=option('output');
if(!origin||!iso||!output||!process.env.MELEE_PLAYWRIGHT_MODULE)throw Error('Supply --origin, --iso, --output and MELEE_PLAYWRIGHT_MODULE.');
const {mkdir}=await import('node:fs/promises');await mkdir(output,{recursive:true});
const {chromium}=createRequire(import.meta.url)(process.env.MELEE_PLAYWRIGHT_MODULE);
const browser=await chromium.launch({channel:'chrome',headless:!args.includes('--headed')});const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();page.setDefaultTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
await context.addInitScript(()=>{
 window.proofEvents=[];window.addEventListener('message',({data})=>{if(['select','session','playable','pad','input','error'].includes(data?.type))window.proofEvents.push(data);});
 window.proofPads=[0,1].map(index=>({index,id:'Synthetic standard pad '+index,mapping:'standard',connected:true,axes:[0,0,0,0],buttons:Array.from({length:16},()=>({pressed:false,value:0}))}));
 navigator.getGamepads=()=>window.proofPads;
 localStorage.setItem('opensmash.melee-controls-complete.v1','complete');
});
await page.goto(origin+'/melee');await page.waitForFunction(()=>window.openSmashReactBridge?.characters?.some(c=>c.meleeAvailable));
const rows=await page.evaluate(()=>window.openSmashReactBridge.characters.filter(r=>r.meleeAvailable));
const picks=rows.slice(0,2);assert.equal(picks.length,2);
await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'ROM Management',exact:true}).click();await page.getByRole('tab',{name:'Melee',exact:true}).click();
await page.locator('.melee-disc-settings input[type=file]').setInputFiles(iso);await page.getByRole('button',{name:'Clear disc',exact:true}).waitFor();await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();
for(const row of picks)await page.locator(`[data-roster-character="${row.slug}"] .replica-select-control`).evaluate(el=>el.click());
await page.waitForFunction(()=>document.querySelector('#local-fighter-selection button:last-of-type')?.disabled===false);
const labels=await page.locator('#local-fighter-selection').innerText();assert.ok(labels.includes('1P: '+picks[0].name));assert.ok(labels.includes('2P: '+picks[1].name));
assert.equal(await page.locator('.game-overlay').count(),0,'last pick does not unexpectedly start match');
const alias=rows.find(r=>r.displayName&&r.sourceName!==r.name);if(alias){const tile=page.locator(`[data-roster-character="${alias.slug}"]`);assert.equal(await tile.getAttribute('data-display-name'),alias.name);assert.ok(!(await tile.getAttribute('aria-label')).includes(alias.sourceName));}
const art=[];for(const row of picks){const response=await context.request.get(origin+row.portraitTile);assert.equal(response.status(),200);art.push({slug:row.slug,status:response.status(),bytes:(await response.body()).length});}
// Real polling adapter drives cursor to the P1 slot and presses A, then replaces P1 only.
const slot=page.locator('#local-fighter-selection button').first();const box=await slot.boundingBox();
for(let i=0;i<40;i++){
 const pos=await page.locator('.menu-controller-cursor').evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x+9,y:r.y+9};});
 const dx=box.x+box.width/2-pos.x,dy=box.y+box.height/2-pos.y;if(Math.abs(dx)<8&&Math.abs(dy)<8)break;
 await page.evaluate(({dx,dy})=>{window.proofPads[0].axes[0]=Math.abs(dx)>8?Math.sign(dx)*Math.min(1,Math.abs(dx)/35):0;window.proofPads[0].axes[1]=Math.abs(dy)>8?Math.sign(dy)*Math.min(1,Math.abs(dy)/35):0;},{dx,dy});await page.waitForTimeout(30);
}
await page.evaluate(()=>{window.proofPads[0].axes=[0,0,0,0];window.proofPads[0].buttons[0]={pressed:true,value:1};});await page.waitForTimeout(80);await page.evaluate(()=>window.proofPads[0].buttons[0]={pressed:false,value:0});
assert.equal(await slot.getAttribute('aria-pressed'),'true','actual gamepad polling -> DOM click chooses P1');
await page.locator(`[data-roster-character="${picks[1].slug}"] .replica-select-control`).evaluate(el=>el.click());
assert.ok((await page.locator('#local-fighter-selection').innerText()).includes('2P: '+picks[1].name));
await page.locator('#local-fighter-selection').evaluate(el=>el.scrollIntoView({block:'start'}));await page.waitForTimeout(200);await page.locator('#local-fighter-selection').screenshot({path:output+'/panel.png'});await page.screenshot({path:output+'/selection.png'});
await writeFile(output+'/ui.json',JSON.stringify({labels,art,alias:alias?.name,controllerPollingToClick:true,errors},null,2));assert.deepEqual(errors,[]);

async function controllerClick(locator){
 await locator.scrollIntoViewIfNeeded();
 for(let i=0;i<70;i++){
  const b=await locator.boundingBox(),pos=await page.locator('.menu-controller-cursor').evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x+9,y:r.y+9};});
  const dx=b.x+b.width/2-pos.x,dy=b.y+b.height/2-pos.y;if(Math.abs(dx)<8&&Math.abs(dy)<8)break;
  await page.evaluate(({dx,dy})=>{window.proofPads[0].axes[0]=Math.abs(dx)>8?Math.sign(dx)*Math.min(1,Math.abs(dx)/35):0;window.proofPads[0].axes[1]=Math.abs(dy)>8?Math.sign(dy)*Math.min(1,Math.abs(dy)/35):0;},{dx,dy});await page.waitForTimeout(30);
 }
 await page.evaluate(()=>{window.proofPads[0].axes=[0,0,0,0];window.proofPads[0].buttons[0]={pressed:true,value:1};});await page.waitForTimeout(80);await page.evaluate(()=>window.proofPads[0].buttons[0]={pressed:false,value:0});await page.waitForTimeout(50);
}
await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('.modal-page.is-visible .advanced-screen').waitFor();await page.getByRole('button',{name:'Players & Controllers',exact:true}).click();await page.waitForTimeout(500);await page.evaluate(()=>window.proofPads[0].buttons[1]={pressed:true,value:1});await page.waitForTimeout(100);await page.evaluate(()=>window.proofPads[0].buttons[1]={pressed:false,value:0});await page.getByRole('button',{name:'Players & Controllers',exact:true}).waitFor();await page.waitForTimeout(100);await page.evaluate(()=>window.proofPads[0].buttons[1]={pressed:true,value:1});await page.waitForTimeout(100);await page.evaluate(()=>window.proofPads[0].buttons[1]={pressed:false,value:0});await page.locator('[role="dialog"]:visible').waitFor({state:'hidden',timeout:3000});assert.equal(await page.locator('[role="dialog"]:visible').count(),0,'B backs out of menu');
const beforeBase=await page.locator('#local-fighter-selection').innerText();
await page.locator(`[data-roster-character="${picks[0].slug}"] .replica-base-button`).evaluate(el=>el.click());await page.locator('dialog.melee-base-picker[open]').waitFor();await page.waitForTimeout(100);assert.equal(await page.locator('dialog[open] .menu-controller-cursor').count(),1,'controller cursor renders in native dialog top layer');
await page.evaluate(()=>window.proofPads[0].buttons[1]={pressed:true,value:1});await page.waitForTimeout(100);await page.evaluate(()=>window.proofPads[0].buttons[1]={pressed:false,value:0});await page.locator('dialog.melee-base-picker').waitFor({state:'detached'});
assert.equal(await page.locator('#local-fighter-selection').innerText(),beforeBase,'B closes native base dialog without erasing choices');
const scrollBefore=await page.evaluate(()=>scrollY);await page.evaluate(()=>window.proofPads[0].axes[3]=1);await page.waitForTimeout(250);await page.evaluate(()=>window.proofPads[0].axes[3]=0);assert.ok(await page.evaluate(before=>scrollY>before,scrollBefore),'right stick scrolls website');
// Native lifecycle surface fixture exercises the same website gate; no native gameplay claim.
await page.evaluate(()=>{const gate=document.createElement('section');gate.className='native-game';gate.id='proof-native-gate';document.body.append(gate);});await page.waitForTimeout(80);
await page.evaluate(()=>{window.proofPads[0].axes=[1,1,0,1];window.proofPads[0].buttons[1]={pressed:true,value:1};});await page.waitForTimeout(150);
assert.equal(await page.locator('.menu-controller-cursor').isVisible(),false,'native match gate hides website pointer');
await page.evaluate(()=>{document.getElementById('proof-native-gate').remove();window.proofPads[0].axes=[0,0,0,0];window.proofPads[0].buttons[1]={pressed:false,value:0};});await page.waitForTimeout(80);
// The P1 cursor intentionally assigns and replaces P2 before starting.
await controllerClick(page.locator('#local-fighter-selection button').nth(1));await controllerClick(page.locator(`[data-roster-character="${picks[0].slug}"] .replica-select-control`));
assert.ok((await page.locator('#local-fighter-selection').innerText()).includes('2P: '+picks[0].name));
await controllerClick(page.locator('#local-fighter-selection button').nth(1));await controllerClick(page.locator(`[data-roster-character="${picks[1].slug}"] .replica-select-control`));
assert.ok((await page.locator('#local-fighter-selection').innerText()).includes('2P: '+picks[1].name));
// Restore distinct picks, then inspect the real select request and game snapshot.
await page.locator('#local-fighter-selection button').first().click();
await page.locator(`[data-roster-character="${picks[0].slug}"] .replica-select-control`).evaluate(el=>el.click());
await controllerClick(page.locator('#local-fighter-selection').getByRole('button',{name:'Play locally',exact:true}));
await page.waitForFunction(()=>document.querySelector('.game-overlay')||Array.from(document.querySelectorAll('.melee-setup button')).some(button=>button.textContent==='Play locally'),{},{timeout:120000});
const optionalMode=page.locator('.melee-setup').getByRole('button',{name:'Play locally',exact:true});
if(await optionalMode.isVisible())await controllerClick(optionalMode);
const runtime=()=>page.frames().find(frame=>frame.url().includes('/engine/upstream/runtime.html'));
await page.waitForFunction(()=>document.querySelector('.game-overlay'),{},{timeout:120000});
for(let i=0;i<30;i++){
 if(await page.evaluate(()=>window.proofEvents.some(e=>e.type==='playable')))break;
 const confirm=page.getByRole('button',{name:'Confirm · A',exact:true});if(await confirm.isVisible())await confirm.click();
 await page.waitForTimeout(1000);
}
await page.waitForFunction(()=>window.proofEvents.some(e=>e.type==='playable'),{},{timeout:120000});
assert.ok(runtime(),'real engine frame');
const select=await runtime().evaluate(()=>window.proofEvents.find(e=>e.type==='select'));
assert.ok(select?.launch);assert.deepEqual(select.launch.ports.slice(0,2).map(p=>p.character),picks.map(p=>p.slug));
const snapshot=()=>runtime().evaluate(()=>{const m=window.Module,p=m._direct_snapshot()>>>2;return {frame:m._direct_frame_count(),scene:m._direct_scene_kind(),state:Array.from(HEAPF32.subarray(p,p+48))};});
// CKind -> Ft_Kind: pinned upstream src/melee/ft/forward.h enumerations.
const before=await snapshot();await writeFile(output+'/runtime-start.json',JSON.stringify({select,before},null,2));for(let port=0;port<2;port++){assert.equal(before.state[port*12],1);assert.equal(before.state[port*12+1],[2,3,1,24,4,5,6,17,0,18,16,8,9,12,10,15,13,14,19,7,22,20,21,26,23,25][select.launch.ports[port].fighter]);}
const ownedPhases=[];
for(const [port,direction] of [[0,1],[1,-1]]) {
 await page.evaluate(()=>window.proofPads.forEach(p=>p.axes=[0,0,0,0]));
 const neutral=await snapshot();await runtime().waitForFunction(frame=>window.Module._direct_frame_count()>=frame,neutral.frame+15,{timeout:20000});
 await runtime().evaluate(()=>{const held=new Map();for(const event of window.proofEvents)if(event.type==='pad')held.set(event.values[0],event);window.proofEvents=[...held.values()];});
 const start=await snapshot();await page.evaluate(({port,direction})=>window.proofPads[port].axes[0]=direction,{port,direction});
 await runtime().waitForFunction(frame=>window.Module._direct_frame_count()>=frame,start.frame+90,{timeout:20000});
 const end=await snapshot(),events=await runtime().evaluate(()=>window.proofEvents);
 const samples=assertOwnedPadPhase(events,port,direction);
 assert.ok(direction*(end.state[port*12+3]-start.state[port*12+3])>5,`port ${port} moves in its owned direction`);
 ownedPhases.push({port,direction,start,end,samples});
}
const after=await snapshot();await page.evaluate(()=>window.proofPads.forEach(p=>p.axes=[0,0,0,0]));
assert.equal(await page.locator('.menu-controller-cursor').isVisible(),false,'website input disabled during match');
await page.getByRole('button',{name:'Return to roster',exact:true}).click();await page.locator('#local-fighter-selection').waitFor();
const returned=await page.locator('#local-fighter-selection').innerText();assert.ok(returned.includes('1P: '+picks[0].name));assert.ok(returned.includes('2P: '+picks[1].name));
await page.locator('#local-fighter-selection button').nth(1).click();await page.locator(`[data-roster-character="${picks[0].slug}"] .replica-select-control`).evaluate(el=>el.click());
assert.ok((await page.locator('#local-fighter-selection').innerText()).includes('2P: '+picks[0].name));
await writeFile(output+'/game.json',JSON.stringify({select,before,after,ownedPhases,returned,distinctNativeSlots:true,independentOwnedPads:true,websiteCursorDisabledInMatch:true,errors},null,2));
await browser.close();
