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
try{
await page.goto(origin+'/melee');await page.waitForFunction(()=>window.openSmashReactBridge?.characters?.some(c=>c.meleeAvailable));
const rows=await page.evaluate(()=>window.openSmashReactBridge.characters.filter(r=>r.meleeAvailable));
const picks=rows.slice(0,2);assert.equal(picks.length,2);
await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'ROM Management',exact:true}).click();await page.getByRole('tab',{name:'Melee',exact:true}).click();
await page.locator('.melee-disc-settings input[type=file]').setInputFiles(iso);await page.getByRole('button',{name:'Clear disc',exact:true}).waitFor();await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();
async function controllerClick(locator,port=0){
 await page.waitForFunction(()=>document.body.style.position!=='fixed',{},{timeout:10000});
 await locator.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));await page.waitForTimeout(600);
 for(let i=0;i<180;i++){
  const b=await locator.boundingBox(),pos=await page.locator(`.menu-controller-cursor[data-player="${port+1}"]`).evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x+13,y:r.y+13};});
  const dx=b.x+b.width/2-pos.x,dy=b.y+b.height/2-pos.y;if(Math.abs(dx)<8&&Math.abs(dy)<8)break;
  await page.evaluate(({dx,dy,port})=>{window.proofPads[port].axes[0]=Math.abs(dx)>8?Math.sign(dx)*Math.min(1,Math.abs(dx)/35):0;window.proofPads[port].axes[1]=Math.abs(dy)>8?Math.sign(dy)*Math.min(1,Math.abs(dy)/35):0;},{dx,dy,port});await page.waitForTimeout(30);
 }
 await page.evaluate(port=>{window.proofPads[port].axes=[0,0,0,0];window.proofPads[port].buttons[0]={pressed:true,value:1};},port);await page.waitForTimeout(80);await page.evaluate(port=>window.proofPads[port].buttons[0]={pressed:false,value:0},port);await page.waitForTimeout(50);
}

const tile=(row)=>page.locator(`[data-roster-character="${row.slug}"] .replica-select-control`);
const play=page.locator('#local-fighter-selection').getByRole('button',{name:'Play locally',exact:true});
assert.equal(await page.locator('[data-selection-slot]').count(),0,'assignment menu removed');
assert.equal(await page.getByRole('button',{name:'Create room',exact:true}).isDisabled(),true);
await controllerClick(tile(picks[0]),0);
assert.equal(await play.isDisabled(),true,'one locked player cannot start two-player match');
await controllerClick(tile(picks[1]),1);
await page.waitForFunction(()=>document.querySelector('#local-fighter-selection button')?.disabled===false,{},{timeout:3000});
assert.equal(await page.locator(`[data-roster-character="${picks[0].slug}"]`).getAttribute('data-pick'),'1P');
assert.equal(await page.locator(`[data-roster-character="${picks[1].slug}"]`).getAttribute('data-pick'),'2P');
await controllerClick(tile(picks[0]),1);
assert.equal(await page.locator(`[data-roster-character="${picks[1].slug}"]`).getAttribute('data-pick'),'2P','locked player cannot replace own selection without unlock');
await controllerClick(page.getByRole('button',{name:'Settings',exact:true}),1);
assert.equal(await page.locator('[role="dialog"]:visible').count(),0,'P2 cannot edit shared settings');
await page.evaluate(()=>window.proofPads[1].buttons[1]={pressed:true,value:1});await page.waitForTimeout(80);await page.evaluate(()=>window.proofPads[1].buttons[1]={pressed:false,value:0});
assert.equal(await play.isDisabled(),true,'P2 B unlocks only P2');
assert.equal(await page.locator(`[data-roster-character="${picks[0].slug}"]`).getAttribute('data-pick'),'1P');
await controllerClick(tile(picks[1]),1);
await page.evaluate(()=>{window.proofRemoved=window.proofPads[1];window.proofPads[1]=null;window.dispatchEvent(Object.assign(new Event('gamepaddisconnected'),{gamepad:window.proofRemoved}));});await page.waitForTimeout(300);
assert.equal(await page.getByRole('button',{name:'Create room',exact:true}).isDisabled(),false,'modes restore with one controller');
await page.evaluate(()=>{window.proofPads[1]=window.proofRemoved;window.proofPads[1].buttons[0]={pressed:true,value:1};window.dispatchEvent(Object.assign(new Event('gamepadconnected'),{gamepad:window.proofPads[1]}));});await page.waitForTimeout(300);
assert.equal(await play.isDisabled(),true,'reconnected held A does not lock a ghost fighter');
await page.evaluate(()=>window.proofPads[1].buttons[0]={pressed:false,value:0});await controllerClick(tile(picks[1]),1);
await page.getByRole('button',{name:'Family',exact:true}).click();await page.waitForTimeout(400);
assert.equal(await play.isDisabled(),true,'roster change invalidates hidden controller choices');
await page.getByRole('button',{name:'High School',exact:true}).click();await page.waitForTimeout(400);
assert.equal(await play.isDisabled(),true,'returning to roster requires fresh choices');
await controllerClick(tile(picks[0]),0);await controllerClick(tile(picks[1]),1);
// Duplicate selected sources still route a base edit through the actual P2 cursor.
await page.evaluate(()=>window.proofPads[1].buttons[1]={pressed:true,value:1});await page.waitForTimeout(80);await page.evaluate(()=>window.proofPads[1].buttons[1]={pressed:false,value:0});
await controllerClick(tile(picks[0]),1);
await controllerClick(page.locator(`[data-roster-character="${picks[0].slug}"] .replica-base-button`),1);
await page.locator('dialog.melee-base-picker[open]').waitFor();
assert.ok((await page.locator('dialog.melee-base-picker header').innerText()).startsWith('2P'),'P2 opens its own duplicate-fighter base picker');
const option=page.locator('dialog.melee-base-picker .melee-base-options button[aria-pressed="false"]').first();
if(await option.count()){
 await controllerClick(option,1);await page.locator('dialog.melee-base-picker').waitFor({state:'detached'});
 const remembered=await page.evaluate(()=>JSON.parse(localStorage.getItem('melee-roster-ui-v1')).choices);
 assert.ok(remembered[1]?.[picks[0].slug]!==undefined,'P2 base choice persisted under its own port');
 assert.equal(remembered[0]?.[picks[0].slug],undefined,'P2 base choice did not overwrite P1');
}else await page.locator('dialog.melee-base-picker button[aria-label="Close base picker"]').click();
await page.evaluate(()=>window.proofPads[1].buttons[1]={pressed:true,value:1});await page.waitForTimeout(80);await page.evaluate(()=>window.proofPads[1].buttons[1]={pressed:false,value:0});await controllerClick(tile(picks[1]),1);
await page.locator(`[data-roster-character="${picks[1].slug}"] .replica-base-button`).evaluate(el=>el.click());
await page.locator('dialog.melee-base-picker[open]').waitFor();assert.ok((await page.locator('dialog.melee-base-picker header').innerText()).startsWith('2P'),'mouse preserves uniquely selected P2 ownership');
const mouseOption=page.locator('dialog.melee-base-picker .melee-base-options button[aria-pressed="false"]').first();
if(await mouseOption.count()){await mouseOption.click();const remembered=await page.evaluate(()=>JSON.parse(localStorage.getItem('melee-roster-ui-v1')).choices);assert.ok(remembered[1]?.[picks[1].slug]!==undefined,'mouse P2 edit persisted under P2');assert.equal(remembered[0]?.[picks[1].slug],undefined,'mouse P2 edit did not create a P1 preference');}
else await page.locator('dialog.melee-base-picker button[aria-label="Close base picker"]').click();
await page.locator('#local-fighter-selection').scrollIntoViewIfNeeded();await page.screenshot({path:output+'/selection.png'});
assert.deepEqual(errors,[]);
await controllerClick(play,0);
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
// Reusing a navigator index does not inherit the frozen match's device ownership.
await page.evaluate(()=>{window.proofOriginalId=window.proofPads[0].id;window.proofPads[0].id='replacement device';});
await page.keyboard.down('KeyD');const replaced=await snapshot();
await runtime().waitForFunction(frame=>window.Module._direct_frame_count()>=frame,replaced.frame+30,{timeout:20000});
const replacementPad=await runtime().evaluate(()=>window.proofEvents.filter(e=>e.type==='pad'&&e.values[0]===0).at(-1));
assert.deepEqual(replacementPad.values,[0,0,0x80808080,0,0],'replacement index stays neutral and cannot borrow keyboard input');
await page.keyboard.up('KeyD');await page.evaluate(()=>window.proofPads[0].id=window.proofOriginalId);

assert.equal(await page.locator('.menu-controller-cursor:visible').count(),0,'website input disabled during match');
await page.getByRole('button',{name:'Return to roster',exact:true}).click();await page.locator('#local-fighter-selection').waitFor();
const returned=await page.locator('#local-fighter-selection').innerText();
assert.equal(await page.locator(`[data-roster-character="${picks[0].slug}"]`).getAttribute('data-pick'),'1P');
assert.equal(await page.locator(`[data-roster-character="${picks[1].slug}"]`).getAttribute('data-pick'),'2P');
await writeFile(output+'/game.json',JSON.stringify({select,before,after,ownedPhases,returned,independentOwnedPads:true,modesRestoredOnDisconnect:true,reconnectHeldButtonNeutral:true,assignmentMenuRemoved:true,rosterInvalidation:true,duplicateFighterP2BasePicker:true,uniqueMouseP2BasePicker:true,replacementDeviceAndKeyboardStayNeutral:true,errors},null,2));
}finally{await browser.close();}
