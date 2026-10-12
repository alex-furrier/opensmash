// SPDX-License-Identifier: MIT
// One fixed local browser peer, using the ordinary lobby, owned input and Ready barrier.
export function createTestBot({chromium,origin,iso,onObservation}){
 const emit=value=>onObservation?.(value);
 let browserPromise,active,closed=false;
 function browserForRun(){
  if(!browserPromise){
   const pending=Promise.resolve().then(()=>chromium.launch({channel:'chrome',headless:false})).then(browser=>{
    browser.once?.('disconnected',()=>{if(browserPromise===pending)browserPromise=undefined;});
    return browser;
   });
   browserPromise=pending;
   void pending.catch(()=>{if(browserPromise===pending)browserPromise=undefined;});
  }
  return browserPromise;
 }
 async function start({room,session,scenario='reference'}){
  if(active?.cancelled)await active.done;
  if(closed||active)throw Error('Test opponent is busy. Leave the previous room first.');
  if(!/^[a-f0-9]{32}$/.test(room)||!['reference','delay','jitter','hold'].includes(scenario))throw Error('Invalid test opponent preset.');
  const run={session,cancelled:false};run.done=new Promise(resolve=>{run.finished=resolve;});active=run;
  const current=()=>{if(closed||run.cancelled||active!==run)throw Error('Test opponent stopped.');};
  try{
   const browser=await browserForRun();current();
   run.context=await browser.newContext({viewport:{width:1050,height:1050}});current();
   await run.context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
   const page=await run.context.newPage();run.page=page;
   const workers=new Set();run.workers=workers;run.workerClosed=[];page.on('worker',worker=>{workers.add(worker);worker.on('close',()=>{workers.delete(worker);if(!workers.size)for(const done of run.workerClosed.splice(0))done();});});
   if(onObservation)await page.exposeFunction('__testBotObserve',value=>emit({session,...value}));
   await page.addInitScript(({observe})=>{window.testBotPeerReady=false;window.addEventListener('opensmash-room',event=>{if(event.detail.type==='room')window.testBotPeerReady=!!event.detail.players[0]?.ready;});if(observe)window.addEventListener('opensmash-runtime',event=>{const row=event.detail;if(row.type==='confirmed-tick')void window.__testBotObserve({type:row.type,tick:row.tick,pads:row.pads,state:row.selectedState,debug:row.debug});else if(['playable','progress','error','frame'].includes(row.type))void window.__testBotObserve({type:row.type,audioFrames:row.audioFrames,audioPeak:row.audioPeak,message:row.message});});},{observe:!!onObservation});
   emit({session,type:'phase',phase:'opening'});
   await page.goto(origin+'/?debug=1');current();
   await page.locator('#disc').setInputFiles(iso);current();
   await page.locator('#room-code').fill(room);await page.locator('#join').click();
   emit({session,type:'phase',phase:'joining'});
   await page.waitForFunction(()=>!document.getElementById('debug-scripted').disabled,{},{timeout:30000});current();
   await page.locator('#debug-scripted').check();await page.locator('#debug-scenario').selectOption(scenario);
   await page.waitForFunction(()=>!document.getElementById('ready').disabled,{},{timeout:90000});current();
   emit({session,type:'phase',phase:'verified'});
   // Prepare independently, but do not ready until the sole human is ready.
   await page.waitForFunction(()=>window.testBotPeerReady,{},{timeout:15*60*1000});current();
   emit({session,type:'phase',phase:'human-ready'});
   await page.locator('#ready').click();emit({session,type:'phase',phase:'ready-clicked'});current();
   await page.waitForFunction(()=>document.getElementById('stop').disabled,{},{timeout:15*60*1000});
  }finally{
   let cleanupError;
   try{
    await run.context?.close().catch(()=>{});
    if(run.workers?.size)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Test engine workers did not close.')),5000);run.workerClosed.push(()=>{clearTimeout(timer);resolve();});});
   }catch(error){cleanupError=error;await(await browserPromise)?.close().catch(()=>{});browserPromise=undefined;}
   finally{emit({session,type:'closed',workers:run.workers?.size||0});if(active===run)active=undefined;run.finished();}
   if(cleanupError)throw cleanupError;
  }
 }
 function stop(session){if(active?.session!==session)return;active.cancelled=true;const run=active;void Promise.resolve(run.page?.evaluate(()=>window.dispatchEvent(new Event('pagehide')))).catch(()=>{}).finally(()=>run.context?.close().catch(()=>{}));}
 return{start,stop,get activeSession(){return active?.session;},async close(){closed=true;if(active){active.cancelled=true;await active.context?.close().catch(()=>{});}const browser=await browserPromise?.catch(()=>undefined);await browser?.close();}};
}
