// Chrome menu proof with generic roster data and synthetic pads; no game assets.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const args=process.argv.slice(2),option=name=>args[args.indexOf('--'+name)+1];
const origin=option('origin'),output=option('output');
if(!args.includes('--origin')||!args.includes('--output')||!process.env.MELEE_PLAYWRIGHT_MODULE)throw Error('Supply --origin, --output and MELEE_PLAYWRIGHT_MODULE.');
const {chromium}=createRequire(import.meta.url)(process.env.MELEE_PLAYWRIGHT_MODULE);
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const results=[],errors=[];
const rows=Array.from({length:80},(_,i)=>({slug:'fixture-'+i,name:'Fixture '+i,rosterCategory:'family',target:'mario',defaultTarget:'mario',supportedTargets:['mario','fox'],imported:true}));
async function open(viewport,pads=2){
 const context=await browser.newContext({viewport});
 await context.route('**/melee/api/imports?roster=*',route=>route.fulfill({json:rows}));
 await context.route('**/melee/engine/**',route=>route.abort());
 await context.addInitScript(count=>{
  localStorage.setItem('opensmash.melee-controls-complete.v1','complete');
  window.proofPads=Array.from({length:count},(_,index)=>({index,id:'Synthetic pad '+index,mapping:'standard',connected:true,axes:[0,0,0,0],buttons:Array.from({length:16},()=>({pressed:false,value:0}))}));
  navigator.getGamepads=()=>window.proofPads;
 },pads);
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
 console.log('Opening',viewport,pads);await page.goto(origin+'/melee');await page.waitForFunction(()=>window.openSmashReactBridge?.characters?.length===80);
 if(pads)await page.locator('.menu-controller-cursor[data-player="2"]').waitFor();
 return {context,page};
}
async function hold(page,port,value,ms=400){await page.evaluate(({port,value})=>window.proofPads[port].axes[3]=value,{port,value});await page.waitForTimeout(ms);await page.evaluate(port=>window.proofPads[port].axes[3]=0,port);await page.waitForTimeout(100);}
async function scrollTop(page){await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.waitForTimeout(100);}
try{
 const {context,page}=await open({width:1440,height:1000});
 console.log('Menu loaded');await scrollTop(page);await hold(page,0,.21);assert.equal(await page.evaluate(()=>scrollY),0,'deadzone must not scroll');
 await hold(page,1,1);const p2=await page.evaluate(()=>scrollY);console.log('P2 scroll',p2);assert.ok(p2>200,'P2 right stick must scroll the shared menu');
 const settled=await page.evaluate(()=>scrollY);await page.waitForTimeout(180);assert.equal(await page.evaluate(()=>scrollY),settled,'neutral stick stops without a CSS animation tail');
 await scrollTop(page);await hold(page,0,1);const p1=await page.evaluate(()=>scrollY);assert.ok(p1>200);
 await scrollTop(page);await page.evaluate(()=>{for(const p of window.proofPads)p.axes[3]=1;});await page.waitForTimeout(400);await page.evaluate(()=>{for(const p of window.proofPads)p.axes[3]=0;});
 const together=await page.evaluate(()=>scrollY);assert.ok(together>200&&together<Math.max(p1,p2)*1.5,'two pads must not double scroll speed');
 // DOM contract fixtures isolate input-transfer gating from engine rendering.
 console.log('Scroll arbitration passed');for(const fixture of ['<div class="game-overlay" data-melee-input-owned="true"></div>','<div class="native-game"></div>','<div class="boot-screen"></div>']){
  await page.evaluate(html=>{const box=document.createElement('div');box.id='input-owner-fixture';box.innerHTML=html;document.body.append(box);},fixture);
  await page.waitForTimeout(80);const before=await page.evaluate(()=>scrollY);await hold(page,1,1);assert.equal(await page.evaluate(()=>scrollY),before);
  assert.equal(await page.locator('.menu-controller-cursor').count(),0);await page.locator('#input-owner-fixture').evaluate(el=>el.remove());
 }
 await page.waitForTimeout(100);await hold(page,1,-1);assert.ok(await page.evaluate(()=>scrollY)<together,'menu input resumes after return');
 console.log('Input gating passed');
 // A P2-owned native dialog scrolls its own nested body, never the background.
 await page.evaluate(()=>{
  const d=document.createElement('dialog');d.id='scroll-dialog';d.dataset.controllerOwner='1:Synthetic pad 1:2';d.style.cssText='width:500px;height:420px;padding:0;margin:auto;';
  d.innerHTML='<div id="nested-scroll" style="height:400px;overflow-y:auto"><div style="height:1800px">Nested menu fixture</div></div>';document.body.append(d);d.showModal();
 });
 await page.waitForTimeout(100);const background=await page.evaluate(()=>scrollY);
 await hold(page,0,1);assert.equal(await page.locator('#nested-scroll').evaluate(el=>el.scrollTop),0,'P1 cannot scroll a P2-owned dialog');
 await hold(page,1,1);assert.ok(await page.locator('#nested-scroll').evaluate(el=>el.scrollTop)>200);assert.equal(await page.evaluate(()=>scrollY),background);
 console.log('Owned nested scroll passed');await page.locator('#nested-scroll').evaluate(el=>el.scrollTop=el.scrollHeight);await hold(page,1,1);assert.equal(await page.evaluate(()=>scrollY),background,'dialog edge cannot scroll background');
 await page.screenshot({path:output+'/owned-dialog.png'});await page.locator('#scroll-dialog').evaluate(el=>el.remove());
 results.push({label:'scroll',deadzone:true,p1,p2,together,neutralStops:true,nestedOwnerAndBounds:true,inputTransferGates:['melee','native','boot'],returnResumes:true});
 await context.close();
 for(const width of [320,390,393,600,768,1024,1440]){
  const {context,page}=await open({width,height:900},0);console.log('Layout',width);
  const pick=page.locator('[data-roster-character="fixture-0"] .replica-select-control');
  const tile=await pick.boundingBox();await pick.click({position:{x:8,y:tile.height-10}});
  const start=page.getByRole('button',{name:'Start match',exact:true});await start.waitFor();
  await start.scrollIntoViewIfNeeded();
  const geometry=await page.evaluate(()=>{const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};return {toolbar:rect(document.querySelector('.melee-roster-toolbar')),tabs:rect(document.querySelector('.melee-roster-selector')),panel:rect(document.querySelector('#local-fighter-selection')),start:rect(document.querySelector('#local-fighter-selection button')),body:document.documentElement.scrollWidth};});
  assert.ok(geometry.start.height>=44);assert.ok(geometry.start.right<=width);assert.ok(geometry.body<=width);
  if(width<=600){assert.equal(Math.round(geometry.panel.x),Math.round(geometry.tabs.x));assert.equal(Math.round(geometry.start.width),Math.round(geometry.panel.width));assert.ok(geometry.start.y>=geometry.tabs.bottom);}
  else assert.ok(geometry.start.x>=geometry.tabs.right,'wide toolbar retains shared-row alignment');
  await page.screenshot({path:output+'/selected-'+width+'.png'});results.push({label:'layout',width,...geometry});await context.close();
 }
 assert.deepEqual(errors,[]);await writeFile(output+'/result.json',JSON.stringify({date:new Date().toISOString(),chrome:browser.version(),results,engineBlocked:true,syntheticControllers:true,errors},null,2));console.log('Chrome menu scrolling, ownership, transfer gating and seven responsive layouts passed.');
}finally{await browser.close();}
