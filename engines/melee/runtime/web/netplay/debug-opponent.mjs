// SPDX-License-Identifier: MIT
// A deterministic owned-input fixture, not native CPU AI or transport emulation.
export const debugScenarios=Object.freeze(['reference','delay','jitter','hold']);
export function validateDebug(value){
 if(!value||typeof value.scripted!=='boolean'||!debugScenarios.includes(value.scenario)||value.seed!==17)throw Error('Invalid debug scenario');
 return Object.freeze({scripted:value.scripted,scenario:value.scenario,seed:17});
}
export function createDebugInput(value,{now=()=>performance.now(),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),playable=()=>true}={}){
 const config=validateDebug(value);let random=config.seed,firstCombat;
 return async(tick,local,state)=>{
  let pad=local.slice();
  if(config.scripted){pad=Array(10).fill(0);
   // Slot 1 in upstream direct_snapshot: 12 words, with motion at 2 and stocks at 9.
   const fighter=new Float32Array(new Uint32Array(state.slice(14,26)).buffer);
   if(state[1]===2&&fighter[2]===14&&fighter[9]===4&&playable()&&firstCombat===undefined)firstCombat=tick;
   const phase=firstCombat===undefined?-1:(tick-firstCombat)%360;
   if(phase>=0){pad[1]=phase%120<30?40:phase%120<60?-40:0;pad[0]=(phase%120>=90&&phase%120<96?256:0)|(phase>=270&&phase<276?1024:0);}
  }
  let requestedMs=0;
  if(config.scenario==='delay')requestedMs=10;
  if(config.scenario==='jitter'){random=(Math.imul(random,1664525)+1013904223)>>>0;requestedMs=random%13;}
  if(config.scenario==='hold'&&tick===600)requestedMs=150;
  const start=now();if(requestedMs)await wait(requestedMs);
  return{pad,metric:{tick,scenario:config.scenario,scripted:config.scripted,requestedMs,measuredMs:now()-start}};
 };
}
