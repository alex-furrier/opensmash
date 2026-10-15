import {receiveDiscResponse} from '../../../../web-prototype/shared/handoff-transfer.js';
export function hostDiscSource(value,base){
 if(!value?.trim())return null;
 const url=new URL(value,base);
 if(url.username||url.password||!(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error('Configure a secure game-file source or a loopback source.');
 return url.href;
}
export function hostDiscProgress(bytes,size,elapsedMs){
 const percent=bytes/size*100;
 const amount=bytes<10_000_000?(bytes/1_000_000).toFixed(1):Math.floor(bytes/1_000_000);
 const rate=elapsedMs>=1000?` · ${(bytes/1_000_000/(elapsedMs/1000)).toFixed(1)} MB/s`:'';
 return `Downloading your game… ${percent<1?percent.toFixed(1):Math.floor(percent)}% · ${amount} MB of ${(size/1_000_000_000).toFixed(2)} GB${rate}`;
}
/** Stage the HTTP stream, then use the launcher's existing verified importer. */
export async function downloadHostDisc({url,size,signal,onProgress=()=>{},acceptFile,fetchFile=fetch,receive=receiveDiscResponse}){
 if(!url)throw Error('Load from host is not configured. Choose a local disc.');
 let cleanup;
 try{
  signal.throwIfAborted();
  const response=await fetchFile(url,{signal,credentials:'same-origin',cache:'no-store'});
  signal.throwIfAborted();
  const file=await receive(response,size,signal,onProgress,fn=>{cleanup=fn;});
  signal.throwIfAborted();
  await acceptFile(file,signal);
  signal.throwIfAborted();
 }finally{await cleanup?.();}
}
