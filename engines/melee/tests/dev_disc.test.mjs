import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createServer,request} from 'node:http';
const fetch=(url,{method='GET',headers={},body}={})=>new Promise((resolve,reject)=>{const req=request(url,{method,headers},res=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>{const bytes=Buffer.concat(chunks);resolve({status:res.statusCode,json:async()=>JSON.parse(bytes),arrayBuffer:async()=>bytes});});});req.on('error',reject);req.end(body);});
import {createDevDisc} from '../tools/netplay/dev-disc.mjs';
test('temporary exact-file source requires authenticated owner AND pinned phone via loopback proxy, and expires',async()=>{
 const root=await mkdtemp(join(tmpdir(),'dev-disc-')),path=join(root,'fixture'),bytes=Buffer.from('owned private fixture');await writeFile(path,bytes);
 let now=1;const origin='https://approved.invalid:8450',base={path,owner:'owner',deviceIPs:['100.1.2.3'],httpsOrigin:origin,expectedSize:bytes.length,expectedHash:createHash('sha256').update(bytes).digest('hex'),now:()=>now,ttlMs:100};
 await assert.rejects(createDevDisc({...base,expectedHash:'0'.repeat(64)}),/known disc/);
 for(const ttlMs of [0,-1,86400001,NaN])await assert.rejects(createDevDisc({...base,ttlMs}),/at most 24 hours/);
 const disc=await createDevDisc(base),server=createServer((req,res)=>disc.respond(req,res,(status,type,body)=>{res.writeHead(status,{'Content-Type':type});res.end(body);}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port;
 const headers={Host:new URL(origin).host,Origin:origin,'X-Forwarded-Host':new URL(origin).host,'X-Forwarded-Proto':'https','X-Forwarded-For':'100.1.2.3','Tailscale-User-Login':'owner','Tailscale-Headers-Info':'https://tailscale.com/s/serve-headers'};
 try{
  for(const patch of [{'Tailscale-User-Login':'other'},{'X-Forwarded-For':'100.1.2.4'},{'X-Forwarded-Proto':'http'},{'Tailscale-Headers-Info':''},{'Tailscale-Funnel-Request':'?1'},{Host:'127.0.0.1'}])assert.equal((await fetch(url+'/dev-disc/load',{method:'POST',headers:{...headers,...patch}})).status,403);
  assert.equal((await fetch(url+'/dev-disc/load',{method:'POST',headers:{...headers,Origin:'https://wrong.invalid'}})).status,403);
  const config=await(await fetch(url+'/dev-disc/config',{headers})).json();assert.deepEqual(config,{size:bytes.length,expiresAt:101,available:true});
  assert.equal((await fetch(url+'/dev-disc/load?file=/etc/passwd',{method:'POST',headers})).status,405);
  assert.equal((await fetch(url+'/dev-disc/load',{method:'POST',headers,body:'another file'})).status,403);
  assert.deepEqual(Buffer.from(await(await fetch(url+'/dev-disc/load',{method:'POST',headers})).arrayBuffer()),bytes);
  now=101;assert.equal((await(await fetch(url+'/dev-disc/config',{headers})).json()).available,false);assert.equal((await fetch(url+'/dev-disc/load',{method:'POST',headers})).status,403);
 }finally{await disc.close();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}
});
