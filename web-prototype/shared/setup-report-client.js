import {SETUP_REPORT_PATH,setupReport} from './setup-report.js';
const WINDOW_MS=15*60*1000;
export function createSetupReportClient({inspect,fetchRequest=fetch,onStatus=()=>{},now=Date.now,schedule=setTimeout,unschedule=clearTimeout}={}){
 let lease,timer,generation=0,busy=false;
 const emit=message=>{try{onStatus({armed:!!lease,busy,message});}catch{}};
 function clear(){unschedule(timer);timer=undefined;lease=undefined;}
 async function post(value){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),5000);timeout.unref?.();
  try{const response=await fetchRequest(SETUP_REPORT_PATH,{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify(value),signal:controller.signal});if(!response.ok)throw Error('Setup capture unavailable');return response.status===204?{}:await response.json();}finally{clearTimeout(timeout);}
 }
 const cancel=token=>{void post({action:'cancel',token}).catch(()=>{});};
 async function arm(){
  if(busy||lease)return false;
  const current=++generation;busy=true;emit('Enabling next-failure capture…');
  try{
   const value=await post({action:'arm'});
   if(!/^[a-f0-9]{32}$/.test(value.token)||!Number.isSafeInteger(value.expiresAt))throw Error('Invalid capture permit');
   if(current!==generation){cancel(value.token);return false;}
   lease=value;timer=schedule(()=>{if(lease?.token===value.token){clear();emit('Capture expired. Nothing was sent.');}},Math.min(WINDOW_MS,Math.max(1,value.expiresAt-now())));timer?.unref?.();
   return true;
  }catch{if(current===generation)emit('Setup capture is unavailable. Nothing was sent.');return false;}
  finally{if(current===generation){busy=false;emit(lease?'Enabled for the next failure, for 15 minutes.':'Setup capture is unavailable. Nothing was sent.');}}
 }
 function disable(){generation++;const token=lease?.token;clear();busy=false;if(token)cancel(token);emit('Capture is off.');}
 async function capture(failure){
  if(!lease||busy||failure?.name==='AbortError')return false;
  if(now()>=lease.expiresAt){clear();emit('Capture expired. Nothing was sent.');return false;}
  const token=lease.token,snapshot={...failure},current=++generation;clear();busy=true;emit('Sending technical setup details…');
  let timeout;
  try{
   let raw;
   try{raw=await Promise.race([Promise.resolve().then(()=>inspect()),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('timeout')),5500);timeout.unref?.();})]);}
   catch{raw={state:'error',probeError:'Timeout',...(Number.isSafeInteger(snapshot.expectedBytes)?{expectedBytes:snapshot.expectedBytes}:{})};}
   finally{clearTimeout(timeout);}
   if(current!==generation){cancel(token);return false;}
   await post({action:'report',token,report:setupReport(raw,snapshot)});
   if(current===generation){busy=false;emit('Setup details sent. Capture is now off.');}return true;
  }catch{if(current===generation){busy=false;emit('Could not send setup details. Capture is now off.');}return false;}
  finally{if(current===generation){busy=false;/* Preserve the result message. */}}
 }
 return {arm,disable,capture};
}

export function mountSetupReportCapture({bridge,checkbox,status,...options}){
 const client=createSetupReportClient({...options,inspect:()=>bridge.inspectDiscSetup(),onStatus:({armed,busy,message})=>{checkbox.checked=armed||busy;checkbox.disabled=busy;status.textContent=message;}});
 checkbox.onchange=()=>{if(checkbox.checked)void client.arm();else client.disable();};
 const unsubscribe=bridge.subscribeDiscFailures(failure=>{if(bridge.experience==='melee')void client.capture(failure);});
 return {disable:client.disable,dispose(){client.disable();unsubscribe?.();checkbox.onchange=null;}};
}
