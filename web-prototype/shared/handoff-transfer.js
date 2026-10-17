// Ordered, bounded transfer: the receiver acknowledges each MiB only after it
// has written it. Disc images stay in OPFS instead of a multi-gigabyte buffer.
import {discSizeError,discStorageError} from '../../engines/melee/runtime/web/disc.mjs';
export const TRANSFER_LIMITS = { ssb64: 64 * 1024 * 1024, melee: 2 * 1024 * 1024 * 1024 };
export function validateTransferHeader(header, game) {
  if (header.type !== 'header' || header.game !== game || !Number.isSafeInteger(header.size) || header.size <= 0 || header.size > TRANSFER_LIMITS[game]) throw new Error('The sending device offered an unexpected game or file size.');
}
export function channelInbox(channel, signal, {maxQueuedFrames=128,maxQueuedBytes=2*1024*1024}={}) {
  const queue = [];
  let waiter, failure, queuedBytes=0;
  const fail = error => { failure = error; queue.length=0;queuedBytes=0; waiter?.reject(error); waiter = null; };
  const bytes=value=>typeof value==='string'?new TextEncoder().encode(value).length:value instanceof ArrayBuffer?value.byteLength:Infinity;
  const message = event => {
    if(failure)return;const size=bytes(event.data);
    if(size>16384||(!waiter&&(queue.length>=maxQueuedFrames||queuedBytes+size>maxQueuedBytes))){fail(new Error('Transfer inbox exceeded its bounded frame/queue limit.'));try{channel.close?.();}catch{}return;}
    if(waiter){waiter.resolve(event.data);waiter=null;}else{queue.push(event.data);queuedBytes+=size;}
  };
  const closed = () => fail(new Error('The other device disconnected during the transfer.'));
  const aborted = () => fail(Object.assign(new Error('Handoff cancelled.'), {name:'HandoffCancelled'}));
  channel.addEventListener('message', message);
  channel.addEventListener('close', closed);
  channel.addEventListener('error', closed);
  signal?.addEventListener('abort', aborted, {once:true});
  if (signal?.aborted) aborted();
  return {
    async next() {
      if (failure) throw failure;
      if (queue.length) {const value=queue.shift();queuedBytes-=bytes(value);return value;}
      return new Promise((resolve,reject)=>{
        const timer = setTimeout(()=>fail(new Error('The other device stopped responding.')), 90000);
        waiter = {resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}};
      });
    },
    dispose() {channel.removeEventListener('message',message);channel.removeEventListener('close',closed);channel.removeEventListener('error',closed);signal?.removeEventListener('abort',aborted);},
  };
}
async function frame(inbox) {
  const value = JSON.parse(await inbox.next());
  if (value.type === 'error') throw new Error(value.message || 'The other device rejected the transfer.');
  return value;
}
export async function sendGameFile(channel, inbox, loadRom, onState) {
  const request = await frame(inbox);
  if (request.type !== 'request' || !Object.hasOwn(TRANSFER_LIMITS,request.game)) throw new Error('The other device requested an unsupported game.');
  const rom = await loadRom(request.game);
  if (!rom?.file && !rom?.bytes) throw new Error('The requested game is not saved on this device. Add it under ROM Management first.');
  const file = rom.file || new Blob([rom.bytes]);
  const header = {type:'header',game:request.game,name:rom.name||file.name||'rom.z64',size:file.size};
  validateTransferHeader(header,request.game);
  channel.send(JSON.stringify(header));
  if ((await frame(inbox)).type !== 'ready') throw new Error('The receiving device could not prepare storage.');
  let sent = 0;
  while (sent < file.size) {
    const end = Math.min(sent + 1024*1024,file.size);
    const batch = await file.slice(sent,end).arrayBuffer();
    for (let offset=0;offset<batch.byteLength;offset+=16384) channel.send(batch.slice(offset,offset+16384));
    channel.send(JSON.stringify({type:'flush',received:end}));
    const ack = await frame(inbox);
    if (ack.type !== 'progress' || ack.received !== end) throw new Error('The receiving device could not confirm the transferred data.');
    sent=end; onState('sending',{sent,total:file.size});
  }
  channel.send(JSON.stringify({type:'done'}));
  if ((await frame(inbox)).type !== 'received') throw new Error('The receiving device did not finish the transfer.');
  onState('done',{total:file.size});
}
export async function receiveGameFile(channel, inbox, game, onState, setCleanup, {expectedSize} = {}) {
  if (!Object.hasOwn(TRANSFER_LIMITS,game)) throw new Error('Unsupported game.');
  channel.send(JSON.stringify({type:'request',game}));
  const header = await frame(inbox);
  validateTransferHeader(header,game);
  if(expectedSize!==undefined&&header.size!==expectedSize)throw new Error('The sending device offered the wrong disc size.');
  let writer, handle;
  let receipt = {name: "", adopted: false};
  const chunks=[];
  if (game === 'melee') {
    if (!globalThis.navigator?.storage?.getDirectory) throw new Error('This browser cannot save a disc transfer. Use a browser with local file storage support.');
    const staging=await incomingDisc(setCleanup);
    writer=staging.writer;handle=staging.handle;receipt=staging.receipt;
  }
  channel.send(JSON.stringify({type:'ready'}));
  let received=0;
  onState('receiving',{received,total:header.size});
  for (;;) {
    const data=await inbox.next();
    if (typeof data === 'string') {
      const message=JSON.parse(data);
      if(message.type==='error') throw new Error(message.message);
      if(message.type==='flush') {
        if(message.received!==received) throw new Error('Transfer byte count did not match.');
        channel.send(JSON.stringify({type:'progress',received}));
        onState('receiving',{received,total:header.size});
      } else if(message.type==='done') {
        if(received!==header.size) throw new Error('The transfer ended before the whole file arrived.');
        if(writer) await writer.close();
        const file=handle ? await handle.getFile() : new File(chunks,header.name,{type:'application/octet-stream'});
        if(file.size!==header.size)throw discSizeError('handoff-saved-file',header.size,file.size);
        if (handle) Object.defineProperty(file,Symbol.for('opensmash.received-disc'),{value:receipt});
        channel.send(JSON.stringify({type:'received'}));
        onState('done',{total:received});
        return file;
      } else throw new Error('Unexpected transfer message.');
    } else {
      if(!(data instanceof ArrayBuffer) || data.byteLength>16384 || received+data.byteLength>header.size) throw new Error('Invalid transfer chunk.');
      if(writer) await writer.write(data); else chunks.push(data);
      received+=data.byteLength;
    }
  }
}

async function incomingDisc(setCleanup){
 let writer;
 const directory=await (await navigator.storage.getDirectory()).getDirectoryHandle("opensmash-melee-disc-v1",{create:true});
 const temporaryName=`incoming-${crypto.randomUUID()}.iso`;
 const receipt={name:temporaryName,adopted:false};
 let releaseLock=()=>{};
 if(navigator.locks) {
   const held=new Promise(resolve=>{releaseLock=resolve;});
   await new Promise((resolve,reject)=>{navigator.locks.request(`opensmash-disc:${temporaryName}`,async()=>{resolve();await held;}).catch(reject);});
 }
 setCleanup(async()=>{
   try {
     if(receipt.adopted)return;
     try {await writer?.abort();} catch {}
     try {await directory.removeEntry(temporaryName);} catch {}
   } finally {releaseLock();}
 });
 const handle=await directory.getFileHandle(temporaryName,{create:true});
 writer=await handle.createWritable();
 return{writer,handle,receipt};
}

/** Save a bounded HTTP stream using the same incoming-disc receipt as handoff. */
export async function receiveDiscResponse(response,size,signal,onProgress,setCleanup){
 if(!response.ok||Number(response.headers.get('content-length'))!==size)throw Error('The game file could not be loaded completely.');
 signal.throwIfAborted();let stage;
 try{stage=await incomingDisc(setCleanup);}catch(error){throw discStorageError(error,'download-open',size);}
 const reader=response.body.getReader();let received=0,written=0,phase='download-read';
 // Coalesce small network fragments into bounded writes, without splitting large reads.
 const pending=new Uint8Array(1024*1024);let queued=0;
 const write=async bytes=>{
  signal.throwIfAborted();phase='download-write';
  // Some Safari OPFS writers use the entire backing buffer for a partial view.
  const data=bytes.byteOffset===0&&bytes.byteLength===bytes.buffer.byteLength?bytes:bytes.slice();
  await stage.writer.write(data);written+=bytes.byteLength;onProgress(written);phase='download-read';
 };
 const flush=async()=>{if(queued){await write(pending.subarray(0,queued));queued=0;}};
 const abort=()=>{void reader.cancel(signal.reason).catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
 try{
  for(;;){signal.throwIfAborted();const{done,value}=await reader.read();signal.throwIfAborted();if(done)break;
   if(received+value.byteLength>size)throw Error('Invalid game file byte count.');
   received+=value.byteLength;
   if(!queued&&value.byteLength>=pending.byteLength){await write(value);continue;}
   for(let offset=0;offset<value.byteLength;){
    const length=Math.min(pending.byteLength-queued,value.byteLength-offset);
    pending.set(value.subarray(offset,offset+length),queued);queued+=length;offset+=length;
    if(queued===pending.byteLength)await flush();
   }
  }
  if(received!==size)throw Error('The game download ended before the whole file arrived.');
  await flush();signal.throwIfAborted();phase='download-close';await stage.writer.close();
  phase='download-saved-file';const file=await stage.handle.getFile();
  if(file.size!==size)throw discSizeError(phase,size,file.size);
  Object.defineProperty(file,Symbol.for('opensmash.received-disc'),{value:stage.receipt});return file;
 }catch(error){throw Object.assign(discStorageError(error,phase,size),{receivedBytes:received,writtenBytes:written});}
 finally{signal.removeEventListener('abort',abort);await reader.cancel().catch(()=>{});reader.releaseLock();}
}
