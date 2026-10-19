import {meleePath} from './paths.ts';
import {createPreparationStore} from './native-preparation.mjs';

// Two active jobs bound downloads and memory. Completed assets/costumes are
// reused only within this page, with immutable source revision in every key.
const preparation=createPreparationStore();
function recordFit(metrics:Record<string,unknown>){
 console.info('[Native fit]',metrics);
 const diagnostics=window as Window & {meleeNativeFits?:unknown[]};
 diagnostics.meleeNativeFits=[...(diagnostics.meleeNativeFits||[]),metrics].slice(-32);
}
export async function prepareNativeCostume(entry:{character:string;target:string;color:number;format?:'dat'},signal:AbortSignal):Promise<{filename:string;blob:Blob}> {
 const requestedAt=performance.now();
 return preparation.run(signal,async()=>{
  const queueMs=performance.now()-requestedAt;
  if(!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(entry.character)||!/^[a-z][a-z-]{0,31}$/.test(entry.target)||!Number.isInteger(entry.color)||entry.color<0||entry.color>5)throw Error('Invalid fighter or moveset.');
  const response=await fetch(meleePath('/api/native-fit/source/'+encodeURIComponent(entry.character)),{method:'POST',signal});
  const source=await response.json();
  if(!response.ok)throw Error(source.error||'The character could not be prepared.');
  const sourceBase=new URL(meleePath(source.base),location.origin);
  if(sourceBase.origin!==location.origin||!/^\/(?:melee\/)?api\/native-fit\/assets\/[a-f0-9]{64}\/sources\/[a-z0-9_-]+$/.test(sourceBase.pathname))throw Error('Invalid character source');
  signal.throwIfAborted();
  const key=JSON.stringify(['costume',sourceBase.href,entry.target,entry.color,entry.format||'runtime']);
  const cached=preparation.get<{filename:string;blob:Blob}>(key);if(cached){recordFit({...entry,cacheHit:true,queueMs,preparationMs:performance.now()-requestedAt});return cached;}
  return new Promise<{filename:string;blob:Blob}>((resolve,reject)=>{
   let worker:Worker|undefined,finished=false;
   const cleanup=()=>{clearTimeout(timeout);signal.removeEventListener('abort',cancel);worker?.terminate();};
   const fail=(error:Error)=>{if(finished)return;finished=true;cleanup();reject(error);};
   const cancel=()=>fail(signal.reason||new DOMException('Aborted','AbortError'));
   const timeout=setTimeout(()=>fail(Error('Native character preparation timed out.')),30000);
   signal.addEventListener('abort',cancel,{once:true});
   void (async()=>{
    signal.throwIfAborted();
    const asset=(path:string)=>preparation.asset(path,signal);
    const [sourceJson,texture,identity,rig,template]=await Promise.all([
     asset(sourceBase.href+'.json'),asset(sourceBase.href+'.rgba8'),entry.format==='dat'?null:asset(sourceBase.href+'.identity.dat'),
     asset(meleePath('/engine/native-fit/assets/targets/'+entry.target+'.json')),
     asset(meleePath('/engine/native-fit/assets/targets/'+entry.target+'-'+entry.color+'.dat')),
    ]);
    signal.throwIfAborted();if(finished)return;
    worker=new Worker(meleePath('/engine/native-fit/worker.mjs'),{type:'module'});
    worker.onerror=event=>fail(Error(event.message||'Native fitting worker failed'));
    worker.onmessage=({data})=>{
     if(finished)return;
     if(data.error){fail(Error(data.error));return;}
     if(entry.format==='dat'&&data.format!=='dat'){fail(Error('Melee costume export needs updated game assets. Reload the page and try again.'));return;}
     const result={filename:data.filename,blob:new Blob([data.bytes],{type:'application/octet-stream'})};
     preparation.put(key,result);finished=true;cleanup();
     recordFit({...data.metrics,color:entry.color,cacheHit:false,queueMs,preparationMs:performance.now()-requestedAt,sourceCached:source.cached,sourcePreparationMs:source.sourcePreparationMs});
     resolve(result);
    };
    worker.postMessage({...entry,sourceBase:sourceBase.pathname,assets:{sourceJson,texture,identity,rig,template}});
   })().catch(fail);
  });
 });
}
