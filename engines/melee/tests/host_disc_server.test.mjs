import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';import http from 'node:http';
import {createHostDisc,HOST_DISC_PATH} from '../server/host-disc.mjs';import {privateMeleeRequestAllowed,allowedHostedRoute} from '../server/handler.mjs';
test('fixed file is size/digest verified and restart-stable; unrelated paths, methods and ranges never return bytes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'host-disc-')),file=join(dir,'private.iso'),bytes=Buffer.alloc(3*1024*1024,73),digest=createHash('sha256').update(bytes).digest('hex');await writeFile(file,bytes);
 let disc,server;
 async function start(){disc=await createHostDisc({file,expectedSize:bytes.length,expectedHash:digest});server=http.createServer((req,res)=>{void disc.respond(req,res).catch(()=>res.destroy());});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return 'http://127.0.0.1:'+server.address().port;}
 async function stop(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await disc.close();}
 try{
  await assert.rejects(createHostDisc({file,expectedSize:bytes.length-1,expectedHash:digest}),/size/);
  await assert.rejects(createHostDisc({file,expectedSize:bytes.length,expectedHash:'0'.repeat(64)}),/digest/);
  for(let restart=0;restart<2;restart++){
   const origin=await start();assert.deepEqual(disc.metadata,{available:true,url:HOST_DISC_PATH,size:bytes.length,sha256:digest});
   const response=await fetch(origin+HOST_DISC_PATH);assert.equal(response.status,200);assert.equal(response.headers.get('content-length'),String(bytes.length));assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),digest);
   const head=await fetch(origin+HOST_DISC_PATH,{method:'HEAD'});assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);
   for(const [path,options] of [['/melee/api/disc?file=other',{}],['/melee/api/disc/other',{}],['/melee/api/disc',{method:'POST'}],['/melee/api/disc',{headers:{range:'bytes=0-99'}}]])assert.equal((await fetch(origin+path,options)).status,404);
   const cancel=new AbortController(),active=await fetch(origin+HOST_DISC_PATH,{signal:cancel.signal});cancel.abort();await assert.rejects(active.arrayBuffer(),{name:'AbortError'});
   const retry=await fetch(origin+HOST_DISC_PATH);assert.equal((await retry.arrayBuffer()).byteLength,bytes.length);
   if(restart===1){await writeFile(file,Buffer.alloc(bytes.length,1));assert.equal((await fetch(origin+HOST_DISC_PATH)).status,503);}
   await stop();
  }
 }finally{if(server?.listening)await stop();await rm(dir,{recursive:true,force:true});}
});
test('disc belongs only to the existing private route policy',()=>{
 const req=(host,origin)=>({url:HOST_DISC_PATH,method:'GET',headers:{host,...(origin?{origin}:{})},socket:{remoteAddress:'127.0.0.1'}});
 assert.equal(privateMeleeRequestAllowed(req('app.example','https://app.example'),'https://app.example'),true);
 assert.equal(privateMeleeRequestAllowed(req('other.example'),'https://app.example'),false);
 assert.equal(privateMeleeRequestAllowed(req('app.example','https://other.example'),'https://app.example'),false);
 assert.equal(allowedHostedRoute('GET','/api/disc'),false);
});
