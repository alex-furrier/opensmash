/** Local real-disc acceptance. Requires an explicitly assigned quiet window.
 * MELEE_PC_ROOT, MELEE_ISO and an existing PLAYWRIGHT_MODULE are supplied locally.
 * Only metadata/trace hashes are intended for publication; screenshots stay private.
 */
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {startRelay} from './netplay/server.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const engineRoot=process.env.MELEE_PC_ROOT,iso=process.env.MELEE_ISO;
if(!engineRoot||!iso)throw Error('Supply an isolated MELEE_PC_ROOT and legal local MELEE_ISO.');
const output=resolve(process.env.TEST_OUTPUT||'build/netplay-proof'),ticks=Number(process.env.PROOF_TICKS||4000);
if(!Number.isSafeInteger(ticks)||ticks<100)throw Error('PROOF_TICKS must be at least 100.');
await mkdir(output,{recursive:true});
const relay=await startRelay({engineRoot});
let browser;try{browser=await chromium.launch({channel:'chrome',headless:false});}catch(error){await relay.close();throw error;}
const results=[];
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function floats(state){const bytes=new ArrayBuffer(48*4),view=new DataView(bytes);state.slice(2).forEach((n,i)=>view.setUint32(i*4,n,true));return Array.from(new Float32Array(bytes));}
function milestones(rows){
 const snapshots=rows.filter(r=>r.state[1]===2).map(r=>({tick:r.tick,p:floats(r.state)}));
 return [0,1].map(player=>{
  const at=player*12,p=snapshots.filter(r=>r.p[at]),xs=p.map(r=>r.p[at+3]),stocks=p.map(r=>r.p[at+9]);
  const lost=p.findIndex(r=>r.p[at+9]<4);
  return {present:p.length,movement:xs.length?Math.max(...xs)-Math.min(...xs):0,
   attack:p.some(r=>r.p[at+2]>=44&&r.p[at+2]<=69),firstAttackTick:p.find(r=>r.p[at+2]>=44&&r.p[at+2]<=69)?.tick,stockLoss:stocks.some(n=>n<4),
   respawn:lost>=0&&p.slice(lost+1).some(r=>r.p[at+2]===14&&Math.abs(r.p[at+3])<70)};
 });
}
async function pair(scenario){
 const contexts=[],pages=[],errors=[[],[]],consoleRows=[[],[]];
 try{
  for(let player=0;player<2;player++){
   const context=await browser.newContext({viewport:{width:1050,height:1050}});contexts.push(context);
   await context.route('**/*',route=>new URL(route.request().url()).origin===relay.origin?route.continue():route.abort());
   await context.addInitScript(({player,scenario,ticks})=>{
    if(window===parent){window.proof={rows:[],acquired:[],errors:[],delays:[],mutations:[]};
     if(scenario==='jitter'){
      const Native=window.WebSocket;
      window.WebSocket=class extends Native{
       constructor(...args){super(...args);this.ordered=Promise.resolve();this.seed=17+player;}
       send(text){
        const message=JSON.parse(text);if(message.type!=='peer'){super.send(text);return;}
        this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;const delay=this.seed%3;
        window.proof.delays.push({type:message.packet.type,tick:message.packet.tick,delay});
        this.ordered=this.ordered.then(()=>new Promise(r=>setTimeout(r,delay))).then(()=>{if(this.readyState===Native.OPEN)super.send(text);});
       }
      };
     }
window.addEventListener('opensmash-runtime',event=>{
     const row=event.detail;if(row.type==='confirmed-tick')window.proof.rows.push({tick:row.tick,pads:row.pads,state:row.selectedState});
     if(row.type==='error')window.proof.errors.push(row.message);
    });return;}
    let stored;
    Object.defineProperty(window,'Module',{configurable:true,get:()=>stored,set:module=>{
     stored=module;let input,applied,firstCombat;
     Object.defineProperty(module,'onConfirmedInput',{configurable:true,get:()=>input,set:callback=>{
      input=async(tick,physical,state)=>{
       const combat=state[1]===2&&module._opensmash_preparation_state()===4&&![1,2].includes(module._opensmash_intro_state());
       if(combat&&firstCombat===undefined)firstCombat=tick;
       const elapsed=firstCombat===undefined?-1:tick-firstCombat,pad=Array(10).fill(0);
       if(scenario!=='fresh'&&elapsed>=0){
        // Independent attack times prove fighter ownership; later walk-offs
        // require stock loss and respawn, rather than matching idle traces.
        if(elapsed>=60+player*90&&elapsed<70+player*90)pad[0]=256;
        if(elapsed>=240&&elapsed<460)pad[1]=player?80:-80;
        if(elapsed>=800&&elapsed<1020)pad[1]=player?-80:80;
       }
       parent.proof.acquired.push({tick,player,pad:pad.slice(),observedRng:state[0]});
       if(scenario==='disconnect'&&player===0&&tick===900)await new Promise(()=>{});
       if(scenario==='hold'&&player===1&&elapsed===180)await new Promise(r=>setTimeout(r,80));
       const pads=await callback(tick,pad,state);
       if(scenario==='input-negative'&&player===1&&elapsed===180){const before=pads[player].slice();pads[player][0]^=256;parent.proof.mutations.push({tick,before,after:pads[player].slice()});}
       return pads;
      };
     }});
     Object.defineProperty(module,'onConfirmedTick',{configurable:true,get:()=>applied,set:callback=>{
      applied=async(...args)=>{await callback(...args);if(args[0]+1>=ticks)await new Promise(()=>{});};
     }});
    }});
   },{player,scenario,ticks});
   const page=await context.newPage();pages.push(page);
   page.on('pageerror',error=>errors[player].push(error.message));page.on('console',message=>consoleRows[player].push(message.text()));
   await page.goto(relay.origin);
  }
  await pages[0].locator('#create').click();await pages[0].locator('#share').waitFor({state:'visible'});
  const link=await pages[0].locator('#room-link').inputValue();await pages[1].locator('#room-code').fill(link);await pages[1].locator('#join').click();
  await Promise.all(pages.map(async page=>{await page.locator('#share').waitFor({state:'visible'});await page.locator('#disc').setInputFiles(iso);await page.waitForFunction(()=>!document.getElementById('ready').disabled,null,{timeout:120000});}));
  if(scenario==='rng-negative'){
   const frame=pages[1].frames().find(f=>f.url().endsWith('/runtime.html'));
   await frame.evaluate(()=>{const original=Module.callMain;Module.callMain=(...args)=>{Module.ENV.MELEE_SEED='18';return original(...args);};});
  }
  await Promise.all(pages.map(page=>page.locator('#ready').click()));
  if(scenario==='disconnect'){
   await Promise.all(pages.map(page=>page.waitForFunction(()=>window.proof.rows.length>=900||window.proof.errors.length,null,{timeout:300000})));
   const before=await pages[1].evaluate(()=>window.proof);assert.equal(before.rows.length,900);assert.ok(!before.errors.length);
   await pages[0].close();await pages[1].waitForFunction(()=>document.getElementById('stop').disabled,null,{timeout:10000});
   const after=await pages[1].evaluate(()=>window.proof);assert.equal(after.rows.length,900);
   return{scenario,passed:true,confirmedTicks:900,traceHash:hash(after.rows),meaning:'actual client closed while its next owned input was held; peer made no further progress'};
  }
  if(scenario.endsWith('negative')){
   await Promise.all(pages.map(page=>page.waitForFunction(()=>document.getElementById('stop').disabled,null,{timeout:120000})));
  }else{
   await Promise.all(pages.map(page=>page.waitForFunction(count=>window.proof.rows.length>=count||window.proof.errors.length,ticks,{timeout:300000})));
  }
  const proof=await Promise.all(pages.map(page=>page.evaluate(()=>window.proof)));
  await writeFile(resolve(output,scenario+'-private-traces.json'),JSON.stringify({proof,errors,consoleRows})+'\n');
  const result={scenario,ticks:proof.map(p=>p.rows.length),traceHashes:proof.map(p=>hash(p.rows)),acquisitionHashes:proof.map(p=>hash(p.acquired)),delayHashes:proof.map(p=>hash(p.delays)),errors:proof.map(p=>p.errors),pageErrors:errors};
  if(scenario.endsWith('negative')){
   assert.ok(proof.every(p=>p.rows.length<ticks));assert.ok(proof.some(p=>p.errors.some(e=>/state mismatch/i.test(e))));
   if(scenario==='rng-negative')assert.ok(proof[0].acquired.some((row,i)=>proof[1].acquired[i]&&row.observedRng!==proof[1].acquired[i].observedRng),'No observed engine RNG intervention');
   else assert.equal(proof[1].mutations.length,1);
   result.mutations=proof.map(p=>p.mutations);result.passed=true;result.meaning=scenario==='rng-negative'?'actual startup RNG changed after Ready identity validation':'actual applied owned input changed after acceptance';
  }else{
   assert.ok(proof.every(p=>p.rows.length===ticks));assert.deepEqual(proof[0].rows,proof[1].rows);
   assert.ok(proof.every(p=>!p.errors.length));assert.ok(errors.every(e=>!e.length));
   assert.ok(proof.every(p=>p.acquired.length===ticks));
   result.milestones=milestones(proof[0].rows);
   if(scenario!=='fresh'){
    assert.ok(result.milestones.every(m=>m.present>100&&m.movement>20&&m.attack&&m.stockLoss&&m.respawn),'Missing gameplay milestone');
    assert.ok(result.milestones[1].firstAttackTick-result.milestones[0].firstAttackTick>=60,'Fighters did not respond to independently timed owned attacks');
   }else assert.ok(proof.every(p=>p.acquired.every(row=>row.pad.every(n=>n===0))));
   result.passed=true;
  }
  await pages[0].locator('#stop').click();await pages[1].waitForFunction(()=>document.getElementById('stop').disabled);
  result.disconnectedBoth=true;
  return result;
 }catch(error){return{scenario,passed:false,error:error.stack,errors,consoleRows};}
 finally{await Promise.all(contexts.map(c=>c.close()));}
}
try{
 for(const scenario of (process.env.PROOF_SCENARIOS||'reference,hold,jitter,input-negative,rng-negative,disconnect,fresh').split(',')){
  const result=await pair(scenario);results.push(result);console.log(scenario,result.passed?'passed':'failed',result.ticks||result.error);
  await writeFile(resolve(output,'summary.json'),JSON.stringify({browser:browser.version(),manifest:relay.manifest,results},null,2)+'\n');
  if(!result.passed)break;
 }
}finally{await browser.close();await relay.close();}
if(results.some(r=>!r.passed))process.exitCode=1;
