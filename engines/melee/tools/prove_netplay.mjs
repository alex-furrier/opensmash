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
  const at=player*12,available=snapshots.filter(r=>r.p[at]),start=available.findIndex(r=>r.p[at+9]===4),p=start<0?[]:available.slice(start),xs=p.map(r=>r.p[at+3]),stocks=p.map(r=>r.p[at+9]);
  const lost=p.findIndex(r=>r.p[at+9]<4);
  return {present:p.length,movement:xs.length?Math.max(...xs)-Math.min(...xs):0,
   attack:p.some(r=>r.p[at+2]>=44&&r.p[at+2]<=69),firstAttackTick:p.find(r=>r.p[at+2]>=44&&r.p[at+2]<=69)?.tick,stockLoss:stocks.some(n=>n<4),
   respawn:lost>=0&&p.slice(lost+1).some(r=>r.p[at+2]===14&&Math.abs(r.p[at+3])<70)};
 });
}
async function pair(scenario){
 const contexts=[],pages=[],errors=[[],[]],consoleRows=[[],[]],liveWorkers=[new Set(),new Set()],workerPeaks=[0,0];
 const waitWorkers=async()=>{const start=Date.now();while(liveWorkers.some(workers=>workers.size)&&Date.now()-start<5000)await new Promise(r=>setTimeout(r,50));return Date.now()-start;};
 try{
  for(let player=0;player<2;player++){
   const context=await browser.newContext({viewport:{width:1050,height:1050}});contexts.push(context);
   await context.route('**/*',route=>new URL(route.request().url()).origin===relay.origin?route.continue():route.abort());
   await context.addInitScript(({player,scenario,ticks})=>{
    if(window===parent){window.proof={rows:[],acquired:[],errors:[],delays:[],mutations:[],holds:[],shutdowns:[],frames:0,playable:0,audioFrames:0,audioPeak:0};
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
     const row=event.detail;if(row.type==='confirmed-tick'){window.proof.rows.push({tick:row.tick,pads:row.pads,state:row.selectedState});if((row.tick+1)%500===0)console.log('[netplay proof] confirmed '+(row.tick+1)+' ticks');}
     if(row.type==='error')window.proof.errors.push(row.message);
     if(row.type==='frame')window.proof.frames++;if(row.type==='playable')window.proof.playable++;
     if(row.type==='progress'){window.proof.audioFrames=Math.max(window.proof.audioFrames,row.audioFrames||0);window.proof.audioPeak=Math.max(window.proof.audioPeak,row.audioPeak||0);}
    });return;}
    const dispatch=window.dispatchEvent.bind(window);
    window.dispatchEvent=event=>{
     if(event.type!=='opensmash-runtime-close')return dispatch(event);
     const pool=window.PThread,count=()=>pool?pool.unusedWorkers.length+Object.keys(pool.pthreads).length:null;
     const before=count(),result=dispatch(event);parent.proof.shutdowns.push({available:!!pool,before,after:count()});return result;
    };
    let stored;
    Object.defineProperty(window,'Module',{configurable:true,get:()=>stored,set:module=>{
     stored=module;let input,applied,firstCombat;
     Object.defineProperty(module,'onConfirmedInput',{configurable:true,get:()=>input,set:callback=>{
      input=async(tick,physical,state)=>{
       const selected=new Float32Array(new Uint32Array(state.slice(2)).buffer);
       const combat=state[1]===2&&selected[2]===14&&selected[14]===14&&selected[9]===4&&selected[21]===4&&module._opensmash_preparation_state()===4&&![1,2].includes(module._opensmash_intro_state());
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
       if(scenario==='hold'&&player===1&&elapsed===180){const before=parent.proof.rows.length,start=performance.now();await new Promise(r=>setTimeout(r,80));const after=parent.proof.rows.length;parent.proof.holds.push({tick,before,after,ms:performance.now()-start});if(after!==before)throw Error('Simulation progressed while owned input was held');}
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
   page.on('worker',worker=>{liveWorkers[player].add(worker);workerPeaks[player]=Math.max(workerPeaks[player],liveWorkers[player].size);worker.on('close',()=>liveWorkers[player].delete(worker));});
   page.on('pageerror',error=>errors[player].push(error.message));page.on('console',message=>{const text=message.text();consoleRows[player].push(text);if(text.startsWith('[netplay proof]'))console.log(scenario,'player '+(player+1),text);});
   await page.goto(relay.origin);
  }
  await pages[0].locator('#create').click();await pages[0].locator('#share').waitFor({state:'visible'});
  const link=await pages[0].locator('#room-link').inputValue();await pages[1].locator('#room-code').fill(link);await pages[1].locator('#join').click();
  await Promise.all(pages.map(async page=>{await page.locator('#share').waitFor({state:'visible'});await page.locator('#disc').setInputFiles(iso);await page.waitForFunction(()=>!document.getElementById('ready').disabled,null,{timeout:120000});}));
  if(scenario==='rng-negative'){
   const frame=pages[1].frames().find(f=>f.url().endsWith('/runtime.html'));
   await frame.evaluate(()=>{const original=Module.callMain;Module.callMain=(...args)=>{Module.ENV.MELEE_SEED='18';return original(...args);};});
  }
  console.log(scenario,'both local runtime identities verified; pressing Ready');
  await pages[0].locator('#ready').click();await pages[0].waitForTimeout(100);
  assert.ok((await Promise.all(pages.map(page=>page.evaluate(()=>window.proof.acquired.length)))).every(n=>n===0),'Engine started before both Ready');
  await pages[1].locator('#ready').click();
  let recovery;
  if(scenario==='fresh'){
   await Promise.all(pages.map(page=>page.waitForFunction(()=>window.proof.rows.length>=200||window.proof.errors.length,null,{timeout:120000})));
   const old=await Promise.all(pages.map(page=>page.evaluate(()=>({ticks:window.proof.rows.length,errors:window.proof.errors}))));
   assert.ok(old.every(p=>p.ticks>=200&&!p.errors.length));
   await pages[0].locator('#stop').click();await pages[1].waitForFunction(()=>document.getElementById('stop').disabled);
   await waitWorkers();assert.ok(liveWorkers.every(workers=>workers.size===0),'Old engine workers survived Stop');
   const oldLink=link;
   for(const page of pages)await page.evaluate(()=>{window.proof={rows:[],acquired:[],errors:[],delays:[],mutations:[],holds:[],shutdowns:[],frames:0,playable:0,audioFrames:0,audioPeak:0};});
   await pages[0].locator('#create').click();await pages[0].locator('#share').waitFor({state:'visible'});
   const newLink=await pages[0].locator('#room-link').inputValue();assert.notEqual(newLink,oldLink);
   await pages[1].locator('#room-code').fill(newLink);await pages[1].locator('#join').click();
   await Promise.all(pages.map(async page=>{await page.locator('#share').waitFor({state:'visible'});await page.locator('#disc').setInputFiles(iso);await page.waitForFunction(()=>!document.getElementById('ready').disabled,null,{timeout:120000});}));
   await pages[0].locator('#ready').click();await pages[1].locator('#ready').click();
   recovery={samePages:true,oldConfirmedTicks:old.map(p=>p.ticks),newRoom:true,oldWorkersClosed:true};
  }
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
  const result={scenario,recovery,workerPeaks,readyBarrier:true,presentation:proof.map(p=>({frames:p.frames,playable:p.playable,audioFrames:p.audioFrames,audioPeak:p.audioPeak})),holds:proof.map(p=>p.holds),ticks:proof.map(p=>p.rows.length),traceHashes:proof.map(p=>hash(p.rows)),acquisitionHashes:proof.map(p=>hash(p.acquired)),delayHashes:proof.map(p=>hash(p.delays)),errors:proof.map(p=>p.errors),pageErrors:errors};
  if(scenario.endsWith('negative')){
   assert.ok(proof.every(p=>p.rows.length<ticks));assert.ok(proof.some(p=>p.errors.some(e=>/state mismatch/i.test(e))));
   if(scenario==='rng-negative')assert.ok(proof[0].acquired.some((row,i)=>proof[1].acquired[i]&&row.observedRng!==proof[1].acquired[i].observedRng),'No observed engine RNG intervention');
   else assert.equal(proof[1].mutations.length,1);
   result.mutations=proof.map(p=>p.mutations);result.passed=true;result.meaning=scenario==='rng-negative'?'actual startup RNG changed after Ready identity validation':'actual applied owned input changed after acceptance';
  }else{
   assert.ok(proof.every(p=>p.rows.length===ticks));assert.deepEqual(proof[0].rows,proof[1].rows);
   assert.ok(proof.every(p=>!p.errors.length));assert.ok(errors.every(e=>!e.length));
   assert.ok(proof.every(p=>p.acquired.length===ticks));
   assert.ok(proof.every(p=>p.frames>100&&p.playable>0&&p.audioFrames>0&&p.audioPeak>0),'Missing rendered/audio progress');
   if(scenario==='hold')assert.ok(proof[1].holds.length===1&&proof[1].holds[0].ms>=80&&proof[1].holds[0].before===proof[1].holds[0].after);
   await pages[0].locator('#screen').screenshot({path:resolve(output,scenario+'-private-play.png')});
   result.milestones=milestones(proof[0].rows);
   if(scenario!=='fresh'){
    assert.ok(result.milestones.every(m=>m.present>100&&m.movement>20&&m.attack&&m.stockLoss&&m.respawn),'Missing gameplay milestone');
    assert.ok(result.milestones[1].firstAttackTick-result.milestones[0].firstAttackTick>=60,'Fighters did not respond to independently timed owned attacks');
   }else assert.ok(proof.every(p=>p.acquired.every(row=>row.pad.every(n=>n===0))));
   result.passed=true;
  }
  if(!scenario.endsWith('negative'))await pages[0].locator('#stop').click();
  await Promise.all(pages.map(page=>page.waitForFunction(()=>document.getElementById('stop').disabled)));
  result.workerShutdownMs=await waitWorkers();result.workersAfterStop=liveWorkers.map(workers=>workers.size);
  assert.ok(result.workersAfterStop.every(n=>n===0),'Engine workers survived Stop');
  result.disconnectedBoth=true;
  return result;
 }catch(error){const proof=await Promise.all(pages.map(page=>page.evaluate(()=>window.proof).catch(()=>null)));const session=await browser.newBrowserCDPSession();const targets=await session.send('Target.getTargets');await session.detach();return{scenario,passed:false,error:error.stack,errors,workerPeaks,activeWorkers:liveWorkers.map(s=>[...s].map(w=>w.url())),workerTargets:targets.targetInfos.filter(t=>t.type==='worker').map(t=>({url:t.url,type:t.type})),shutdowns:proof.map(p=>p?.shutdowns),consoleRows};}
 finally{await Promise.all(contexts.map(c=>c.close()));}
}
async function solo(){
 const context=await browser.newContext({viewport:{width:1050,height:1050}}),page=await context.newPage();
 try{
  await context.route('**/*',route=>new URL(route.request().url()).origin===relay.origin?route.continue():route.abort());
  await page.goto(relay.origin);await page.locator('#disc').setInputFiles(iso);
  await page.evaluate(launch=>{
   window.solo={frames:0,playable:0,errors:[],progress:[]};const iframe=document.createElement('iframe');iframe.title='Solo smoke';window.soloFrame=iframe;
   document.getElementById('screen').append(iframe);document.getElementById('game').hidden=false;
   window.addEventListener('message',({source,data})=>{
    if(source!==iframe.contentWindow)return;
    if(data.type==='bridge-ready'){iframe.contentWindow.postMessage({type:'surface',direct:true},location.origin);iframe.contentWindow.postMessage({type:'start',warm:true,iso:document.getElementById('disc').files[0],discVerified:false,args:['--seed','17']},location.origin);}
    if(data.type==='ready-for-selection')iframe.contentWindow.postMessage({type:'select',launch,costumes:[],cssAssets:[],renderWidth:960},location.origin);
    if(data.type==='frame')solo.frames++;if(data.type==='playable')solo.playable++;if(data.type==='error')solo.errors.push(data.message);if(data.type==='progress'){solo.progress.push(data);if(data.sceneKind===42){solo.setupConfirmations=(solo.setupConfirmations||0)+1;iframe.contentWindow.postMessage({type:'confirm'},location.origin);}}
   });iframe.src='/engine/upstream/runtime.html';
  },relay.manifest.launch);
  await page.waitForFunction(()=>solo.errors.length||(solo.playable&&solo.frames>=300),null,{timeout:120000});
  const frame=page.frames().find(f=>f.url().endsWith('/runtime.html'));
  const ownership=await frame.evaluate(()=>({enabled:Module.ENV.MELEE_BROWSER_CONFIRMED_INPUT||null,inputCallback:!!Module.onConfirmedInput,appliedCallback:!!Module.onConfirmedTick,scene:Module._direct_scene_kind()}));
  const stats=await page.evaluate(()=>solo);assert.equal(ownership.enabled,null);assert.ok(!ownership.inputCallback&&!ownership.appliedCallback);assert.equal(ownership.scene,2);assert.ok(!stats.errors.length&&stats.frames>=300&&stats.playable>0);
  await page.locator('#screen').screenshot({path:resolve(output,'solo-private-play.png')});
  await frame.evaluate(()=>window.dispatchEvent(new Event('opensmash-runtime-close')));
  return{scenario:'solo',passed:true,ownership,frames:stats.frames,playable:stats.playable,setupConfirmations:stats.setupConfirmations||0};
 }catch(error){return{scenario:'solo',passed:false,error:error.stack,stats:await page.evaluate(()=>window.solo).catch(()=>null),runtime:await page.frames().find(f=>f.url().endsWith('/runtime.html'))?.evaluate(()=>({frame:Module._direct_frame_count?.(),scene:Module._direct_scene_kind?.(),intro:Module._opensmash_intro_state?.(),prep:Module._opensmash_preparation_state?.()})).catch(()=>null)};}finally{await context.close();}
}
try{
 for(const scenario of (process.env.PROOF_SCENARIOS||'reference,hold,jitter,input-negative,rng-negative,disconnect,fresh,solo').split(',')){
  const result=await(scenario==='solo'?solo():pair(scenario));results.push(result);console.log(scenario,result.passed?'passed':'failed',result.ticks||result.error);
  await writeFile(resolve(output,'summary.json'),JSON.stringify({browser:browser.version(),manifest:relay.manifest,results},null,2)+'\n');
  if(!result.passed)break;
 }
}finally{await browser.close();await relay.close();}
if(results.some(r=>!r.passed))process.exitCode=1;
