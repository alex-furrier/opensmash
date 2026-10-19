// Page-local preparation only. Source URLs contain their immutable revision;
// neither pending work nor completed blobs are written to browser storage.
export function createPreparationStore({concurrency=2,maxBytes=96*1024*1024,fetchFile=fetch}={}) {
 const completed=new Map(),pending=new WeakMap(),queue=[];
 let bytes=0,active=0;
 function get(key){const value=completed.get(key);if(value){completed.delete(key);completed.set(key,value);}return value;}
 function put(key,value){
  const size=value.blob.size;if(size>maxBytes)return;
  if(completed.has(key)){bytes-=completed.get(key).blob.size;completed.delete(key);}
  while(bytes+size>maxBytes&&completed.size){const oldest=completed.keys().next().value;bytes-=completed.get(oldest).blob.size;completed.delete(oldest);}
  completed.set(key,value);bytes+=size;
 }
 function pump(){
  while(active<concurrency&&queue.length){
   const job=queue.shift();job.signal.removeEventListener('abort',job.cancel);
   if(job.signal.aborted){job.reject(job.signal.reason);continue;}
   active++;
   Promise.resolve().then(()=>{job.signal.throwIfAborted();return job.prepare();}).then(job.resolve,job.reject).finally(()=>{active--;pump();});
  }
 }
 function run(signal,prepare){
  if(signal.aborted)return Promise.reject(signal.reason);
  return new Promise((resolve,reject)=>{
   const job={signal,prepare,resolve,reject,cancel:()=>{const index=queue.indexOf(job);if(index!==-1)queue.splice(index,1);reject(signal.reason);}};
   signal.addEventListener('abort',job.cancel,{once:true});queue.push(job);pump();
  });
 }
 async function asset(url,signal){
  signal.throwIfAborted();const key='asset:'+url,cached=get(key);if(cached)return cached.blob;
  // A match owns its downloads. A new match never inherits an old signal,
  // while companion costumes in the same match share one in-flight request.
  let downloads=pending.get(signal);if(!downloads){downloads=new Map();pending.set(signal,downloads);}
  if(!downloads.has(url)){
   const loading=(async()=>{const response=await fetchFile(url,{signal});if(!response.ok)throw Error('Character fitting assets could not load. Please try again.');const blob=await response.blob();signal.throwIfAborted();put(key,{blob});return blob;})();
   downloads.set(url,loading);void loading.finally(()=>{if(downloads.get(url)===loading)downloads.delete(url);}).catch(()=>{});
  }
  return downloads.get(url);
 }
 return {run,asset,get,put};
}
