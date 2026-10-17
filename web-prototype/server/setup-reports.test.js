import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {mkdtemp,writeFile,readFile,stat,chmod,rm,symlink,access} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {once} from 'node:events';import {randomBytes} from 'node:crypto';import {sealData} from 'iron-session';
import {createSharedPasswordGate} from './shared-password.js';import {createSetupReports} from './setup-reports.js';
const RETENTION_MS=7*24*60*60*1000;
const origin='https://smash.alexfurrier.dev',route='/melee/api/setup-report';
const report={version:1,state:'error',expectedBytes:1459978240,lastFailure:{name:'UnknownError',discStage:'download-open-root',expectedBytes:1459978240},storageAvailable:true,probeError:'UnknownError'};
async function fixture(t){
 const root=await mkdtemp(path.join(tmpdir(),'opensmash-setup-capture-')),directory=path.join(root,'reports'),authFile=path.join(root,'auth.json');
 const auth={helperKey:randomBytes(32).toString('hex'),authVersion:randomBytes(32).toString('hex'),sealKey:randomBytes(32).toString('hex'),password:{salt:'a'.repeat(64),hash:'b'.repeat(64),N:32768,r:8,p:3}};
 await writeFile(authFile,JSON.stringify(auth),{mode:0o600});let clock=1000,timer;
 const capture=await createSetupReports({directory,origin,sourceCommit:'c'.repeat(40),now:()=>clock,schedule:(fn,ms)=>{timer={fn,ms};return 1;},unschedule:()=>{}});
 const gate=createSharedPasswordGate({file:authFile,origin,requireProxyHttps:true,pollMs:10000});
 const server=http.createServer(async(req,res)=>{if(!await gate.handle(req,res))return;await capture.handle(req,res);});server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{capture.close();gate.close();server.closeAllConnections();await new Promise(r=>server.close(r));await chmod(directory,0o700);await rm(root,{recursive:true,force:true});});
 const cookie='__Host-opensmash-session='+await sealData({version:auth.authVersion,expires:Date.now()+3600000},{password:auth.sealKey,ttl:43200});
 const request=(body,{method='POST',headers={},authenticated=true}={})=>new Promise((resolve,reject)=>{
  const data=['GET','HEAD'].includes(method)?'':typeof body==='string'?body:JSON.stringify(body??{});
  const req=http.request({host:'127.0.0.1',port:server.address().port,path:route,method,headers:{Host:'smash.alexfurrier.dev','X-Forwarded-Proto':'https',Origin:origin,'Content-Type':'application/json',...(authenticated?{Cookie:cookie}:{}),...headers}},res=>{let text='';res.on('data',b=>text+=b);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text,json:()=>JSON.parse(text)}));});req.on('error',reject);req.end(data);
 });
 const arm=async()=>{const response=await request({action:'arm'});assert.equal(response.status,200);return response.json().token;};
 return{capture,request,arm,directory,file:path.join(directory,'reports.json'),authFile,auth,port:server.address().port,cookie,advance:n=>{clock+=n;},timer:()=>timer,clock:()=>clock};
}
test('existing password/HTTPS/origin gate protects capture; authenticated GET never reads reports',async t=>{
 const f=await fixture(t);
 assert.equal((await f.request({action:'arm'},{authenticated:false})).status,401);
 assert.equal((await f.request({action:'arm'},{headers:{Origin:'https://other.invalid'}})).status,403);
 assert.equal((await f.request({action:'arm'},{headers:{Origin:''}})).status,403);
 assert.equal((await f.request({action:'arm'},{headers:{'X-Forwarded-Proto':'http'}})).status,403);
 const get=await f.request(null,{method:'GET'});assert.equal(get.status,405);assert.equal(get.headers.allow,'POST');assert.equal(get.text,'{}');
 const token=await f.arm();await writeFile(f.authFile,JSON.stringify({...f.auth,authVersion:'d'.repeat(64)}),{mode:0o600});assert.equal((await f.request({action:'report',token,report})).status,401);
});
test('one permit stores one private report; concurrent duplicates cannot store twice',async t=>{
 const f=await fixture(t),token=await f.arm();const responses=await Promise.all([f.request({action:'report',token,report}),f.request({action:'report',token,report})]);assert.deepEqual(responses.map(r=>r.status).sort(),[201,410]);
 const rows=JSON.parse(await readFile(f.file));assert.equal(rows.length,1);assert.deepEqual(rows[0],{receivedAt:1000,sourceCommit:'c'.repeat(40),report});assert.equal((await stat(f.file)).mode&0o777,0o600);assert.equal((await stat(f.directory)).mode&0o777,0o700);assert.doesNotMatch(await readFile(f.file,'utf8'),new RegExp(token));
});
test('schema, raw strings, content type and byte limit are enforced before persistence',async t=>{
 const f=await fixture(t),token=await f.arm();
 for(const bad of [{...report,url:'private'},{...report,lastFailure:{...report.lastFailure,message:'private'}},{...report,lastFailure:{...report.lastFailure,discStage:'private-name'}},{...report,probeError:'private path'}])assert.equal((await f.request({action:'report',token,report:bad})).status,400);
 assert.equal((await f.request('x'.repeat(2049))).status,413);assert.equal((await f.request('{')).status,400);assert.equal((await f.request({action:'arm'},{headers:{'Content-Type':'text/plain'}})).status,415);await assert.rejects(access(f.file));
 assert.equal((await f.request({action:'report',token,report})).status,201);
});
test('permits expire at15minutes, can be cancelled, and active permits are bounded',async t=>{
 const f=await fixture(t),token=await f.arm();f.advance(900000);assert.equal((await f.request({action:'report',token,report})).status,410);
 const cancelled=await f.arm();assert.equal((await f.request({action:'cancel',token:cancelled})).status,204);assert.equal((await f.request({action:'report',token:cancelled,report})).status,410);
 for(let i=0;i<10;i++)await f.arm();assert.equal((await f.request({action:'arm'})).status,429);f.advance(900000);assert.equal((await f.request({action:'arm'})).status,200);
});
test('retains at most10reports and scheduled expiration removes private file after7days',async t=>{
 const f=await fixture(t);for(let i=0;i<11;i++){f.advance(1);const token=await f.arm();assert.equal((await f.request({action:'report',token,report})).status,201);}
 const rows=JSON.parse(await readFile(f.file));assert.equal(rows.length,10);assert.equal(rows[0].receivedAt,1002);assert.equal(f.timer().ms,RETENTION_MS-9);
 f.advance(RETENTION_MS);f.timer().fn();await f.capture.purge();await assert.rejects(access(f.file));
});
test('restart purges expired reports and refuses symlink storage',async t=>{
 const f=await fixture(t),token=await f.arm();await f.request({action:'report',token,report});f.capture.close();f.advance(RETENTION_MS);
 const restarted=await createSetupReports({directory:f.directory,origin,now:f.clock});await assert.rejects(access(f.file));restarted.close();
 const other=path.join(f.directory,'outside');await writeFile(other,'unchanged');await symlink(other,f.file);await assert.rejects(createSetupReports({directory:f.directory,origin}));assert.equal(await readFile(other,'utf8'),'unchanged');
});
test('disk failure consumes the permit, returns503 and does not retain a failed report',async t=>{
 const f=await fixture(t),token=await f.arm();await chmod(f.directory,0o500);assert.equal((await f.request({action:'report',token,report})).status,503);await chmod(f.directory,0o700);assert.equal((await f.request({action:'report',token,report})).status,410);await assert.rejects(access(f.file));
});

test('expiration retries after a transient delete failure without forgetting disk records',async t=>{
 const f=await fixture(t),token=await f.arm();await f.request({action:'report',token,report});
 await chmod(f.directory,0o500);f.advance(RETENTION_MS);f.timer().fn();await assert.rejects(f.capture.purge());
 assert.equal(JSON.parse(await readFile(f.file)).length,1);assert.equal(f.timer().ms,60000);
 assert.equal((await f.request({action:'arm'})).status,503);
 await chmod(f.directory,0o700);f.advance(60000);f.timer().fn();await f.capture.purge();await assert.rejects(access(f.file));
 assert.equal((await f.request({action:'arm'})).status,200);
});
test('ten unfinished bodies exhaust admission until a request finishes',async t=>{
 const f=await fixture(t),slow=[];
 try{
  for(let i=0;i<10;i++){
   const req=http.request({host:'127.0.0.1',port:f.port,path:route,method:'POST',headers:{Host:'smash.alexfurrier.dev','X-Forwarded-Proto':'https',Origin:origin,'Content-Type':'application/json',Cookie:f.cookie,'Transfer-Encoding':'chunked'}});
   req.on('error',()=>{});req.write('{');slow.push(req);
  }
  // A completed request is ordered after all ten body prefixes on these local sockets.
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal((await f.request({action:'arm'})).status,429);
  const first=slow.shift();first.end('"action":"arm"}');await once(first,'response');
  assert.equal((await f.request({action:'arm'})).status,200);
 }finally{for(const req of slow)req.destroy();}
});

test('restart removes abandoned private report writes and leaves unrelated names alone',async t=>{
 const f=await fixture(t);f.capture.close();
 const orphan=path.join(f.directory,'write-'+'a'.repeat(16)),unrelated=path.join(f.directory,'unrelated');
 await writeFile(orphan,JSON.stringify([{receivedAt:0,sourceCommit:'local',report}]),{mode:0o600});await writeFile(unrelated,'unchanged');
 const restarted=await createSetupReports({directory:f.directory,origin});t.after(()=>restarted.close());
 await assert.rejects(access(orphan));assert.equal(await readFile(unrelated,'utf8'),'unchanged');
});

test('accepted report survives the previous one-hour limit and expires at seven days',async t=>{
 const f=await fixture(t),token=await f.arm();await f.request({action:'report',token,report});
 f.advance(60*60*1000);await f.capture.purge();assert.equal(JSON.parse(await readFile(f.file)).length,1);
 f.advance(RETENTION_MS-60*60*1000-1);await f.capture.purge();assert.equal(JSON.parse(await readFile(f.file)).length,1);
 f.advance(1);await f.capture.purge();await assert.rejects(access(f.file));
});
