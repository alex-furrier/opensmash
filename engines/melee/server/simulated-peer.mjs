// SPDX-License-Identifier: MIT
// Local browser counterpart: the ordinary launcher owns assets, Ready and input.
export function installSimulatedController(){
 let row;
 window.simulatedHostReady=false;
 window.addEventListener('message',({data})=>{if(data?.type==='confirmed-tick')row=data;});
 const NativeSocket=window.WebSocket;
 window.WebSocket=class extends NativeSocket{
  constructor(...args){super(...args);this.addEventListener('message',({data})=>{try{const m=JSON.parse(data);if(m.type==='room')window.simulatedHostReady=!!m.players[0]?.ready;}catch{}});}
 };
 localStorage.setItem('opensmash.controls-complete.v1','complete');
 sessionStorage.setItem('opensmash-advanced-options',JSON.stringify({ports:['gamepad:0','cpu','none','none']}));
 Object.defineProperty(navigator,'getGamepads',{value:()=>{
  const tick=row?.tick||0,combat=row?.selectedState?.[1]===2;
  const values=row&&new Float32Array(new Uint32Array(row.selectedState.slice(2)).buffer);
  const x=values?.[15]||0,other=values?.[3]||0,phase=tick%180;
  const buttons=Array.from({length:17},()=>({pressed:false,value:0}));
  if(combat)for(const index of [phase<12?0:-1,phase>=60&&phase<72?1:-1,phase>=120&&phase<126?2:-1])if(index>=0)buttons[index]={pressed:true,value:1};
  return [{index:0,id:'Local simulated opponent',mapping:'standard',connected:true,axes:[combat&&Math.abs(other-x)>10?Math.sign(other-x)*.45:0,0,0,0],buttons}];
 }});
}

export function createSimulatedPeer({chromium,origin,iso,onObservation}){
 let browserPromise,active,closed=false;
 const emit=value=>onObservation?.(value);
 function browserForRun(){
  if(!browserPromise){
   const pending=Promise.resolve().then(()=>chromium.launch({channel:'chrome',headless:true})).then(browser=>{
    browser.once?.('disconnected',()=>{if(browserPromise===pending)browserPromise=undefined;});return browser;
   });browserPromise=pending;void pending.catch(()=>{if(browserPromise===pending)browserPromise=undefined;});
  }return browserPromise;
 }
 async function start({room,session}){
  if(!/^[a-f0-9]{32}$/.test(room))throw Error('Invalid local opponent room.');
  if(active?.cancelled)await active.done;
  if(closed||active)throw Error('Local opponent is busy. Stop its previous room first.');
  const run={session,cancelled:false};run.done=new Promise(resolve=>{run.closed=resolve;});active=run;
  const current=()=>{if(closed||run.cancelled||active!==run)throw Error('Local opponent stopped.');};
  try{
   const browser=await browserForRun();current();
   run.context=await browser.newContext({viewport:{width:1200,height:950}});current();
   await run.context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
   const page=await run.context.newPage();run.page=page;
   if(onObservation){await page.exposeFunction('__observePeer',value=>emit({session,...value}));await page.addInitScript(()=>window.addEventListener('message',({data})=>{if(['confirmed-tick','playable','error'].includes(data?.type))void window.__observePeer(data);}));}
   await page.addInitScript(installSimulatedController);
   emit({session,type:'phase',phase:'opening'});
   await page.goto(origin+'/melee#room='+room);current();
   emit({session,type:'phase',phase:'choosing-disc'});
   await page.locator('.melee-setup input[type=file]').setInputFiles(iso);current();
   emit({session,type:'phase',phase:'joining'});
   await page.getByRole('button',{name:'Join room',exact:true}).click();
   await page.getByRole('button',{name:'Ready',exact:true}).waitFor({timeout:180000});current();
   emit({session,type:'phase',phase:'verified'});
   await page.waitForFunction(()=>window.simulatedHostReady,{},{timeout:15*60*1000});current();
   await page.getByRole('button',{name:'Ready',exact:true}).click();emit({session,type:'phase',phase:'ready'});
   await new Promise(resolve=>{run.finished=resolve;if(run.cancelled)resolve();});
  }catch(error){
   if(run.cancelled||closed)throw error;
   const detail=await run.page?.locator('.game-message[role=alert],.melee-setup [role=alert]').allTextContents().catch(()=>[]);
   throw Error(detail?.join(' ').slice(0,300)||'Local browser opponent could not prepare. Stop the room and retry.');
  }finally{
   try{await run.context?.close();}finally{emit({session,type:'closed'});if(active===run)active=undefined;run.closed();}
  }
 }
 function stop(session){if(active?.session!==session)return;const run=active;run.cancelled=true;run.finished?.();void run.context?.close().catch(()=>{});}
 return {start,stop,async close(){closed=true;const run=active;if(run){stop(run.session);await run.done;}await(await browserPromise?.catch(()=>undefined))?.close();}};
}
