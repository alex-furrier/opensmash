import {mkdir,lstat,open,rename,unlink,readdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {SETUP_REPORT_LIMIT,validSetupReport} from '../shared/setup-report.js';
const MINUTE=60000,RETENTION_MS=7*24*60*MINUTE;
const tokenOK=v=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
const keys=(v,list)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===list.length&&list.every(k=>Object.hasOwn(v,k));
export async function createSetupReports({directory,origin,sourceCommit='local',now=Date.now,schedule=setTimeout,unschedule=clearTimeout}={}){
 if(!directory||new URL(origin).origin!==origin)throw Error('Setup capture configuration required');
 await mkdir(directory,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e;});
 const info=await lstat(directory);if(!info.isDirectory()||info.isSymbolicLink()||info.uid!==process.getuid()||(info.mode&0o077))throw Error('Setup report directory must be owner-private');
 const file=path.join(directory,'reports.json');let reports=[],leases=new Map(),timer,closed=false,pendingRequests=0,queue=Promise.resolve();
 const serialize=fn=>{const pending=queue.then(fn);queue=pending.catch(()=>{});return pending;};
 async function load(){
  let handle;try{handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);const stat=await handle.stat();if(!stat.isFile()||stat.uid!==process.getuid()||(stat.mode&0o077)||stat.size>32768)throw Error('Invalid report file');
   const parsed=JSON.parse(await handle.readFile('utf8'));if(!Array.isArray(parsed)||parsed.length>10||parsed.some(row=>!keys(row,['receivedAt','sourceCommit','report'])||!Number.isSafeInteger(row.receivedAt)||row.receivedAt<0||row.sourceCommit!=='local'&&!/^[a-f0-9]{40}$/.test(row.sourceCommit)||!validSetupReport(row.report)))throw Error('Invalid stored reports');reports=parsed;
  }catch(e){if(e.code!=='ENOENT')throw e;}finally{await handle?.close();}
 }
 async function save(){
  if(!reports.length){await unlink(file).catch(e=>{if(e.code!=='ENOENT')throw e;});return;}
  const temp=path.join(directory,'write-'+randomBytes(8).toString('hex'));
  const handle=await open(temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{await handle.writeFile(JSON.stringify(reports)+'\n');await handle.sync();await handle.close();await rename(temp,file);}finally{await handle.close().catch(()=>{});await unlink(temp).catch(()=>{});}
 }
 function armExpiry(retryDelay){
  unschedule(timer);if(closed||!reports.length)return;
  timer=schedule(()=>{void serialize(async()=>{await purge();}).catch(()=>{});},retryDelay??Math.max(1,Math.min(...reports.map(r=>r.receivedAt+RETENTION_MS))-now()));timer?.unref?.();
 }
 async function purge(){
  const fresh=reports.filter(r=>r.receivedAt<=now()&&r.receivedAt+RETENTION_MS>now());
  if(fresh.length!==reports.length){
   const previous=reports;reports=fresh;
   try{await save();}catch(error){reports=previous;armExpiry(MINUTE);throw error;}
  }
  for(const [token,expires]of leases)if(expires<=now())leases.delete(token);
  armExpiry();
 }
 // A crash between writing and rename can leave a private temporary report.
 // This directory is exclusively owned by capture; remove only its exact names.
 for(const name of await readdir(directory))if(/^write-[a-f0-9]{16}$/.test(name)){
  const temporary=path.join(directory,name),stat=await lstat(temporary);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==process.getuid()||(stat.mode&0o077))throw Error('Invalid temporary report file');
  await unlink(temporary);
 }
 await load();await purge();
 function reply(res,status,body={}){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...(status===413||status===408?{Connection:'close'}:{})});res.end(JSON.stringify(body));}
 function body(req){return new Promise((resolve,reject)=>{
  let size=0,parts=[],done=false;
  const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timeout);req.off('data',data);req.off('end',end);req.off('error',errorEvent);req.off('aborted',aborted);if(error){req.resume();reject(error);}else resolve(value);};
  const data=part=>{size+=part.length;if(size>SETUP_REPORT_LIMIT)return finish({status:413});parts.push(part);};
  const end=()=>{try{finish(null,JSON.parse(Buffer.concat(parts).toString('utf8')));}catch{finish({status:400});}};
  const errorEvent=()=>finish({status:400}),aborted=()=>finish({status:400});
  const timeout=setTimeout(()=>finish({status:408}),5000);timeout.unref?.();
  req.on('data',data);req.on('end',end);req.on('error',errorEvent);req.on('aborted',aborted);
  if(Number(req.headers['content-length'])>SETUP_REPORT_LIMIT)finish({status:413});
 });}
 async function handle(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return reply(res,405);}
  if(req.headers.origin!==origin)return reply(res,403);
  if((req.headers['content-type']||'').split(';')[0].trim().toLowerCase()!=='application/json')return reply(res,415);
  if(pendingRequests>=10)return reply(res,429);
  pendingRequests++;
  try{
  let value;try{value=await body(req);}catch(e){return reply(res,e.status||400);}
  try{await serialize(async()=>{
   if(closed)return reply(res,503);await purge();
   if(keys(value,['action'])&&value.action==='arm'){
    if(leases.size>=10)return reply(res,429);
    const token=randomBytes(16).toString('hex'),expiresAt=now()+15*MINUTE;leases.set(token,expiresAt);return reply(res,200,{token,expiresAt});
   }
   if(keys(value,['action','token'])&&value.action==='cancel'&&tokenOK(value.token)){leases.delete(value.token);return reply(res,204);}
   if(!keys(value,['action','token','report'])||value.action!=='report'||!tokenOK(value.token)||!validSetupReport(value.report))return reply(res,400);
   if(!leases.has(value.token))return reply(res,410);
   // Consume before disk I/O so duplicates and concurrent submissions cannot retry.
   leases.delete(value.token);
   const previous=reports;reports=[...reports,{receivedAt:now(),sourceCommit,report:value.report}].slice(-10);
   try{await save();}catch(e){reports=previous;throw e;}armExpiry();return reply(res,201,{received:true});
  });}catch{return reply(res,503);}
  }finally{pendingRequests--;}
 }
 return {handle,purge:()=>serialize(purge),close:()=>{closed=true;leases.clear();unschedule(timer);}};
}
