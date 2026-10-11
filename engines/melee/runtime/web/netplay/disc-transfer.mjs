// SPDX-License-Identifier: MIT
// File handoff and OPFS reuse are independent of gameplay room/tick ownership.
import {startRomHandoffHost,receiveRomHandoff,holdScreenAwake} from '/transfer/rom-handoff-client.js';
import {restoreCachedDisc,cacheDisc,removeCachedDisc} from '/transfer/disc-cache.mjs';
import {verifyDisc} from '/engine/verify-disc.mjs';
import {ISO_SIZE} from '/engine/disc.mjs';

export function mountDiscTransfer({getFile,acceptFile,canChange,onBusy=()=>{}}){
 const $=id=>document.getElementById(id),report=text=>{$('transfer-status').textContent=text;};
 let operation,generation=0,confirmation;
 const supported=()=>typeof RTCPeerConnection==='function'&&!!navigator.storage?.getDirectory;
 function controls(){
  const busy=!!operation,enabled=canChange();
  $('disc-send').disabled=busy||!enabled||!getFile()||!supported();
  $('disc-receive').disabled=busy||!enabled||!supported();
  $('disc-forget').disabled=busy||!enabled;$('transfer-code').disabled=busy||!enabled;
  $('transfer-cancel').disabled=!busy;
 }
 function cancel(){generation++;operation?.controller.abort();operation?.handle?.cancel();confirmation?.reject(new DOMException('Cancelled','AbortError'));confirmation=undefined;$('transfer-confirm').hidden=true;}
 async function run(work){
  if(operation||!canChange())return;
  const current={controller:new AbortController()},revision=++generation;operation=current;onBusy(true);controls();
  const release=holdScreenAwake(),timeout=setTimeout(()=>current.controller.abort(new Error('Transfer expired. Start a new pairing.')),20*60*1000);
  const active=()=>{current.controller.signal.throwIfAborted();if(revision!==generation)throw new DOMException('Cancelled','AbortError');};
  const timerAbort=()=>{current.handle?.cancel();confirmation?.reject(current.controller.signal.reason);};current.controller.signal.addEventListener('abort',timerAbort,{once:true});
  try{await work(current,active);}
  catch(error){if(operation===current)report(current.controller.signal.aborted||revision!==generation?'Transfer cancelled or expired. Your previous saved copy is unchanged.':error.message+' Use the local file picker if needed.');}
  finally{clearTimeout(timeout);release();current.controller.signal.removeEventListener('abort',timerAbort);await current.handle?.dispose?.();if(operation===current){operation=undefined;confirmation=undefined;$('transfer-confirm').hidden=true;onBusy(false);controls();}}
 }
 const progress=(kind,detail={})=>{
  if(kind==='waiting'&&detail.code){$('pair-code').textContent=detail.code;report('On your phone, enter this pairing code. It expires in five minutes.');}
  else if(kind==='pairing'){$('pair-fingerprint').textContent=detail.fingerprint;report('Compare the confirmation shown on both screens. No game bytes are sent until the Mac confirms.');}
  else if(kind==='sending')report('Sending your selected disc: '+Math.floor(detail.sent/detail.total*100)+'%. Keep both browsers open.');
  else if(kind==='receiving')report('Saving on this device: '+Math.floor(detail.received/detail.total*100)+'%. Keep this page foreground.');
  else if(kind==='done')report('Bytes received. The phone still needs to verify and accept its saved copy.');
  else if(kind==='error')report(detail.error?.message||'Transfer failed.');
  else if(kind==='cancelled')report('Transfer cancelled.');
  else if(kind==='creating'||kind==='joining'||kind==='connecting')report('Pairing your two devices…');
 };
 $('disc-send').onclick=()=>run(async(current,active)=>{
  const file=getFile();if(!file||file.size!==ISO_SIZE)throw Error('Select your full USA 1.02 disc first.');
  report('Checking the selected Mac disc before pairing…');await verifyDisc(file,bytes=>{active();report('Checking the selected disc: '+Math.floor(bytes/file.size*100)+'%.');});active();
  current.handle=startRomHandoffHost({game:'melee',iceServers:[],privatePolling:true,transferTimeoutMs:20*60*1000,
   loadRom:async game=>{active();if(game!=='melee'||getFile()!==file)throw Error('Selected disc changed. Start a new pairing.');return{file,name:'melee-usa-1.02.iso'};},onState:progress,
   confirmPeer:({signal})=>new Promise((resolve,reject)=>{
    active();$('transfer-confirm').hidden=false;
    let timer;const abort=()=>confirmation?.reject(new DOMException('Cancelled','AbortError'));
    const done=fn=>value=>{clearTimeout(timer);signal.removeEventListener('abort',abort);$('transfer-confirm').hidden=true;fn(value);};
    confirmation={resolve:done(resolve),reject:done(reject)};timer=setTimeout(()=>confirmation?.reject(Error('Pairing confirmation expired.')),60000);signal.addEventListener('abort',abort,{once:true});
   })});
  await current.handle.promise;active();
 });
 $('transfer-confirm').onclick=()=>confirmation?.resolve();
 $('disc-receive').onclick=()=>run(async(current,active)=>{
  if(!supported())throw Error('This browser cannot save a paired disc. Use the local file picker.');
  const estimate=await navigator.storage.estimate?.();active();
  if(estimate&&estimate.quota-estimate.usage<ISO_SIZE)throw Error('Not enough browser storage for the 1.46 GB disc.');
  current.handle=receiveRomHandoff({code:$('transfer-code').value,game:'melee',iceServers:[],expectedSize:ISO_SIZE,privatePolling:true,transferTimeoutMs:20*60*1000,signal:current.controller.signal,onState:progress});
  const file=await current.handle.promise;active();
  await verifyDisc(file,bytes=>{active();report('Verifying the received disc: '+Math.floor(bytes/file.size*100)+'%.');});active();
  const message=await cacheDisc(file,current.controller.signal,()=>{});active();await acceptFile(file);active();report('Verified and ready. '+message);
 });
 $('transfer-cancel').onclick=cancel;
 $('disc-forget').onclick=()=>run(async(current,active)=>{await removeCachedDisc();active();await acceptFile(undefined);report('Saved browser copy removed. Choose a file or pair again.');});
 window.addEventListener('pagehide',cancel);
 async function restore(){
  if(!navigator.storage?.getDirectory){report('Browser storage is unavailable. Use the local file picker.');controls();return;}
  await run(async(current,active)=>{
   const file=await restoreCachedDisc();active();if(!file){report('Receive your disc from the Mac, or choose a local file.');return;}
   report('Checking the saved copy on this device…');await verifyDisc(file,()=>active());active();await acceptFile(file);report('Verified saved copy restored.');
  });
 }
 controls();return{refresh:controls,cancel,restore,get busy(){return!!operation;}};
}
