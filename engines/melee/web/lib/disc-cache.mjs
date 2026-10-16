/** Private, origin-local disc storage. Never sends game bytes to a server. */
const DIRECTORY='opensmash-melee-disc-v1';
async function root(){
 if(!globalThis.navigator?.storage?.getDirectory)throw Error('Local disc storage is unavailable in this browser.');
 return navigator.storage.getDirectory();
}
async function locked(run){
 return globalThis.navigator?.locks?navigator.locks.request(DIRECTORY,run):run();
}
export async function restoreCachedDisc(expectedSize){
 if(!globalThis.navigator?.storage?.getDirectory)return;
 return locked(async()=>{
  try{
   const dir=await (await root()).getDirectoryHandle(DIRECTORY);
   const filename=await (await (await dir.getFileHandle('current')).getFile()).text();
   if(!/^(?:disc|incoming)-[a-z0-9-]+\.iso$/.test(filename))throw Error('Invalid disc cache.');
   const file=await (await dir.getFileHandle(filename)).getFile();
   if(expectedSize!==undefined&&file.size!==expectedSize)throw Object.assign(Error(`Saved game is incomplete (cache-restore; expected ${expectedSize} bytes, actual ${file.size} bytes). The saved copy has not been cleared.`),{discStage:'cache-restore',expectedBytes:expectedSize,actualBytes:file.size});
   return file;
  }catch(e){if(e.name==='NotFoundError')return;throw e;}
 });
}
export async function cacheDisc(file,signal,progress){
 return locked(async()=>{
  signal.throwIfAborted();
  const dir=await (await root()).getDirectoryHandle(DIRECTORY,{create:true});
  const receipt=file[Symbol.for('opensmash.received-disc')];
  // Reclaim a staging file left by a closed tab before allocating another ISO.
  let current='';
  try{current=await (await (await dir.getFileHandle('current')).getFile()).text();}catch(e){if(e.name!=='NotFoundError')throw e;}
  for await(const entry of dir.keys())if(/^disc-[a-z0-9-]+\.iso$/.test(entry)&&entry!==current&&entry!==receipt?.name)await dir.removeEntry(entry);
  // A tab closed mid-transfer leaves an incoming file. Reclaim it only when
  // its transfer/validation lock is free; never delete another tab's active disc.
  if(navigator.locks)for await(const entry of dir.keys())if(/^incoming-[a-z0-9-]+\.iso$/.test(entry)&&entry!==current&&entry!==receipt?.name){
   await navigator.locks.request(`opensmash-disc:${entry}`,{ifAvailable:true},async lock=>{if(lock)await dir.removeEntry(entry).catch(()=>{});});
  }
  const name=receipt?.name||`disc-${crypto.randomUUID()}.iso`;
  if(receipt){if(!/^incoming-[a-z0-9-]+\.iso$/.test(name))throw Error('Invalid incoming disc receipt.');const staged=await(await dir.getFileHandle(name)).getFile();if(staged.size!==file.size)throw Object.assign(Error(`Incoming disc is no longer complete (cache-adoption; expected ${file.size} bytes, actual ${staged.size} bytes).`),{discStage:'cache-adoption',expectedBytes:file.size,actualBytes:staged.size});}
  let committed=false,phase='cache-copy',copied=receipt?file.size:0;
  try{
   if(!receipt){
   const output=await (await dir.getFileHandle(name,{create:true})).createWritable();
   const reader=file.stream().getReader();
   try{
    while(true){signal.throwIfAborted();const {value,done}=await reader.read();if(done)break;await output.write(value);copied+=value.byteLength;progress(copied/file.size);}
    signal.throwIfAborted();phase='cache-close';await output.close();
   }catch(e){await output.abort().catch(()=>{});throw e;}
   finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
   }
   phase='cache-saved-file';const saved=await(await dir.getFileHandle(name)).getFile();
   if(saved.size!==file.size)throw Object.assign(Error(`Saved game is incomplete (${phase}; expected ${file.size} bytes, actual ${saved.size} bytes).`),{discStage:phase,expectedBytes:file.size,actualBytes:saved.size});
   signal.throwIfAborted();
   // Atomically replace the small pointer only after the complete disc is on disk.
   phase='cache-pointer';const manifest=await (await dir.getFileHandle('current',{create:true})).createWritable();
   try{await manifest.write(name);signal.throwIfAborted();await manifest.close();}catch(e){await manifest.abort().catch(()=>{});throw e;}
   committed=true;
   if(receipt)receipt.adopted=true;
   for await(const entry of dir.keys())if(entry!==name&&(entry===current||/^disc-[a-z0-9-]+\.iso$/.test(entry)))await dir.removeEntry(entry).catch(()=>{});
   // Read existing permission only: an optional native prompt must not block play.
   const persistent=await navigator.storage.persisted?.().catch(()=>false);
   return persistent?'Disc saved on this device.':'Disc cached on this device. Clearing site data or browser storage cleanup can remove it.';
  }catch(error){if(error.discStage||error.name==='AbortError')throw error;throw Object.assign(Error(error.message,{cause:error}),{name:error.name,discStage:phase,expectedBytes:file.size,writtenBytes:copied,...(phase==='cache-pointer'?{actualBytes:file.size}:{})});}
  finally{if(!committed&&name!==current)await dir.removeEntry(name).catch(()=>{});}
 });
}

/** A tiny, separate probe and metadata only; never reads or deletes the saved ISO. */
export async function inspectDiscStorage(){
 const report={storageAvailable:!!globalThis.navigator?.storage?.getDirectory};
 if(!report.storageAvailable)return report;
 let directory,name;
 try{
  const storage=await root();
  try{const file=await restoreCachedDisc();report.savedBytes=file?.size??null;}catch(error){report.restoreError=['UnknownError','QuotaExceededError','NotReadableError','NotAllowedError','SecurityError','InvalidStateError'].includes(error.name)?error.name:'Error';}
  directory=await storage.getDirectoryHandle('opensmash-disc-diagnostics-v1',{create:true});name=`probe-${crypto.randomUUID()}`;
  const handle=await directory.getFileHandle(name,{create:true});report.writableAvailable=typeof handle.createWritable==='function';
  if(!report.writableAvailable)return report;
  const writer=await handle.createWritable();
  try{await writer.write(new Uint8Array(65536));await writer.close();}catch(error){await writer.abort().catch(()=>{});throw error;}
  const file=await handle.getFile();report.probeBytes=file.size;
  report.probeReadBytes=(await file.slice(0,16).arrayBuffer()).byteLength;
 }catch(error){report.probeError=['UnknownError','QuotaExceededError','NotReadableError','NotAllowedError','SecurityError','InvalidStateError'].includes(error.name)?error.name:'Error';}
 finally{if(directory&&name)await directory.removeEntry(name).catch(()=>{});}
 return report;
}
export async function removeCachedDisc(){
 if(!globalThis.navigator?.storage?.getDirectory)return;
 await locked(async()=>{
  let dir;try{dir=await(await root()).getDirectoryHandle(DIRECTORY);}catch(e){if(e.name==='NotFoundError')return;throw e;}
  // Forget the committed copy, but never erase another tab's transfer/validation.
  for await(const entry of dir.keys()){
   if(entry==='current'||/^disc-[a-z0-9-]+\.iso$/.test(entry))await dir.removeEntry(entry);
   else if(/^incoming-[a-z0-9-]+\.iso$/.test(entry)&&navigator.locks)await navigator.locks.request(`opensmash-disc:${entry}`,{ifAvailable:true},async lock=>{if(lock)await dir.removeEntry(entry);});
  }
 });
}
