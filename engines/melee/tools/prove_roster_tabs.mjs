// Opt-in Chrome UI regression with generic source fixtures; no private models needed.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const args=process.argv.slice(2),option=name=>args[args.indexOf('--'+name)+1];
const origin=option('origin'),output=option('output');
if(!args.includes('--origin')||!args.includes('--output')||!process.env.MELEE_PLAYWRIGHT_MODULE)throw Error('Supply --origin, --output and MELEE_PLAYWRIGHT_MODULE.');
const {chromium}=createRequire(import.meta.url)(process.env.MELEE_PLAYWRIGHT_MODULE);
const browser=await chromium.launch({channel:'chrome',headless:true});
await mkdir(output,{recursive:true});
const rows=[
 {slug:'fixture-later',name:'Later fixture',rosterCategory:'family',rosterOrder:20},
 {slug:'fixture-first',name:'First fixture',rosterCategory:'family',rosterOrder:0},
 {slug:'fixture-school',name:'School fixture',rosterCategory:'high-school'},
].map(row=>({...row,target:'mario',defaultTarget:'mario',supportedTargets:['mario','fox'],imported:true}));
const choices={0:{'fixture-first':'fox'},1:{'fixture-later':'auto'}};
const results=[];
try{
 for(const prior of [null,'all','high-school','family']){
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/melee/api/imports?roster=*',route=>route.fulfill({json:rows}));
  await context.addInitScript(({prior,choices})=>{
   localStorage.setItem('opensmash.melee-controls-complete.v1','complete');
   if(!sessionStorage.getItem('roster-proof-seeded')){
    if(prior)localStorage.setItem('melee-roster-ui-v1',JSON.stringify({roster:prior,choices}));
    sessionStorage.setItem('roster-proof-seeded','1');
   }
  },{prior,choices});
  await page.goto(origin+'/melee');
  const group=page.getByRole('group',{name:'Choose roster',exact:true});await group.waitFor();
  assert.deepEqual(await group.getByRole('button').allTextContents(),['Friends and Family','High School','All']);
  assert.equal(await group.getByRole('button',{name:'Friends and Family',exact:true}).getAttribute('aria-pressed'),'true');
  await page.waitForFunction(()=>window.openSmashReactBridge?.characters?.[0]?.slug==='fixture-first');
  assert.deepEqual(await page.evaluate(()=>window.openSmashReactBridge.characters.map(row=>row.slug)),['fixture-first','fixture-later']);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('melee-roster-ui-v1')));
  assert.equal(saved.defaultVersion,2);assert.deepEqual(saved.choices,prior?choices:{});
  await page.locator('[data-roster-character="fixture-first"] .replica-select-control').click();
  await page.waitForFunction(()=>document.querySelector('[data-roster-character="fixture-first"]')?.getAttribute('data-pick')==='1P');
  await group.getByRole('button',{name:'High School',exact:true}).click();
  await page.waitForFunction(()=>window.openSmashReactBridge.characters?.[0]?.slug==='fixture-school');
  await page.reload();
  assert.equal(await group.getByRole('button',{name:'High School',exact:true}).getAttribute('aria-pressed'),'true');
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('melee-roster-ui-v1')).choices),prior?choices:{});
  await group.getByRole('button',{name:'Friends and Family',exact:true}).click();
  await page.waitForFunction(()=>window.openSmashReactBridge.characters?.[0]?.slug==='fixture-first');
  assert.notEqual(await page.locator('[data-roster-character="fixture-first"]').getAttribute('data-pick'),'1P','changing roster clears old picks');
  if(prior===null){
   await group.scrollIntoViewIfNeeded();await page.screenshot({path:output+'/tabs.png'});
   await page.setViewportSize({width:390,height:844});await group.scrollIntoViewIfNeeded();
   assert.equal(await group.getByRole('button',{name:'Friends and Family',exact:true}).isVisible(),true);
   await page.screenshot({path:output+'/tabs-narrow.png'});
  }
  assert.deepEqual(errors,[]);results.push({prior,default:'family',laterTabRestored:true,choicesPreserved:true,manifestOrder:true,picksCleared:true});
  await context.close();
 }
 await writeFile(output+'/result.json',JSON.stringify({date:new Date().toISOString(),chrome:browser.version(),results},null,2));
 console.log('Four Chrome storage scenarios passed: tabs, migration, persistence, manifest order, selection invalidation.');
}finally{await browser.close();}
