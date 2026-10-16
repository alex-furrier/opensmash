import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import WebSocket from 'ws';
import {get} from 'node:http';
import {startRelay} from './server.mjs';
import {verifyRuntime} from '../../runtime/web/netplay/identity.mjs';
async function socket(origin){
 const ws=new WebSocket(origin.replace('http','ws')+'/room',{origin});const messages=[],waiters=[];
 ws.on('message',raw=>{messages.push(JSON.parse(raw));for(const waiter of [...waiters])waiter();});
 await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
 return{ws,send:data=>ws.send(JSON.stringify(data)),next:type=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{reject(Error('No '+type));},3000);
  const poll=()=>{const at=messages.findIndex(m=>m.type===type);if(at<0)return;clearTimeout(timer);waiters.splice(waiters.indexOf(poll),1);resolve(messages.splice(at,1)[0]);};waiters.push(poll);poll();
 })};
}
test('real loopback HTTP/WebSocket create, join, verify, Ready, relay, disconnect and fresh room',async()=>{
 const root=await mkdtemp(join(tmpdir(),'opensmash-relay-'));
 const source=join(root,'platforms/browser'),binary=join(root,'build/browser/runtime/platforms/browser');
 await mkdir(source,{recursive:true});await mkdir(binary,{recursive:true});
 for(const name of ['runtime.mjs','runtime.html','gpu-preflight.mjs','disc-cache.mjs','save-migration.mjs','initial_pipeline_cache.db'])await writeFile(join(source,name),'fixture '+name);
 for(const name of ['melee_browser.js','melee_browser.wasm'])await writeFile(join(binary,name),'fixture '+name);
 const approved='https://approved.invalid:8450';
 const relay=await startRelay({engineRoot:root,httpsOrigin:approved}),clients=[];
 try{
  assert.ok(relay.manifest);const response=await fetch(relay.origin+'/manifest');assert.equal(response.status,200);
  assert.equal(response.headers.get('cross-origin-embedder-policy'),'require-corp');
  await verifyRuntime(relay.manifest,async url=>new Uint8Array(await(await fetch(relay.origin+url)).arrayBuffer()));
  assert.equal((await fetch(relay.origin+'/private.iso')).status,404);
  const transfer=await fetch(relay.origin+'/shared/handoff-transfer.js');assert.equal(transfer.status,200);
  const discImport=/from '([^']+disc\.mjs)'/.exec(await transfer.text())[1];
  assert.equal((await fetch(new URL(discImport,relay.origin+'/shared/handoff-transfer.js'))).status,200,'standalone handoff resolves its disc diagnostics dependency');
  const pairing=relay.origin+'/api/handoff/rooms';
  assert.equal((await fetch(pairing)).status,405);
  assert.equal((await fetch(pairing,{method:'POST',headers:{Origin:'https://wrong.invalid','Content-Type':'application/json'},body:'{}'})).status,403);
  assert.equal((await fetch(pairing,{method:'POST',headers:{Origin:relay.origin,'Content-Type':'application/octet-stream'},body:'private file bytes'})).status,415);
  const pair=await fetch(pairing,{method:'POST',headers:{Origin:relay.origin,'Content-Type':'application/json'},body:'{}'});assert.equal(pair.status,200);
  const pairCode=(await pair.json()).code;
  const pairJoin=()=>fetch(pairing+'/'+pairCode+'/join',{method:'POST',headers:{Origin:relay.origin,'Content-Type':'application/json'},body:'{}'});
  assert.equal((await pairJoin()).status,200);assert.equal((await pairJoin()).status,409);
  const rejectedHost=await new Promise((accept,reject)=>{get(relay.origin+'/',{headers:{Host:'other.invalid'}},response=>{response.resume();accept(response.statusCode);}).on('error',reject);});
  assert.equal(rejectedHost,403);
  const approvedHost=await new Promise((accept,reject)=>{get(relay.origin+'/',{headers:{Host:new URL(approved).host}},response=>{response.resume();accept(response.statusCode);}).on('error',reject);});assert.equal(approvedHost,200);
  const proxied=new WebSocket(relay.origin.replace('http','ws')+'/room',{origin:approved,headers:{Host:new URL(approved).host}});await new Promise((resolve,reject)=>{proxied.once('open',resolve);proxied.once('error',reject);});proxied.terminate();
  for(const [host,origin] of [[new URL(approved).host,relay.origin],[new URL(relay.origin).host,approved]])await assert.rejects(new Promise((resolve,reject)=>{const bad=new WebSocket(relay.origin.replace('http','ws')+'/room',{origin,headers:{Host:host}});bad.on('open',()=>{bad.close();resolve();});bad.on('error',reject);}),/403/);
  assert.equal((await fetch(relay.origin+'/',{method:'POST',body:'asset'})).status,405);
  await assert.rejects(new Promise((resolve,reject)=>{const bad=new WebSocket(relay.origin.replace('http','ws')+'/room',{headers:{Host:'other.invalid'}});bad.on('open',()=>{bad.close();resolve();});bad.on('error',reject);}),/403/);
  const a=await socket(relay.origin),b=await socket(relay.origin);clients.push(a,b);
  a.send({type:'create'});const first=await a.next('joined');b.send({type:'join',room:first.room});await b.next('joined');
  a.send({type:'ready',identity:relay.manifest.identity});b.send({type:'ready',identity:relay.manifest.identity});await Promise.all([a.next('start'),b.next('start')]);
  const packet={type:'applied',player:0,session:first.session,tick:0,state:'selected'};a.send({type:'peer',packet});assert.deepEqual((await b.next('peer')).packet,packet);
  a.ws.close();assert.match((await b.next('stopped')).reason,/disconnected/);
  const fresh=await socket(relay.origin);clients.push(fresh);fresh.send({type:'create'});assert.notEqual((await fresh.next('joined')).session,first.session);
  await assert.rejects(new Promise((resolve,reject)=>{const bad=new WebSocket(relay.origin.replace('http','ws')+'/room',{origin:'http://wrong.invalid'});bad.on('open',()=>{bad.close();resolve();});bad.on('error',reject);}),/403/);
 }finally{clients.forEach(c=>c.ws.terminate());await relay.close();await rm(root,{recursive:true,force:true});}
});

test('HTTPS allowance rejects paths, credentials and non-HTTPS configuration',async()=>{for(const httpsOrigin of ['http://approved.invalid','https://approved.invalid/','https://name:password@approved.invalid','https://approved.invalid/?query'])await assert.rejects(startRelay({httpsOrigin}));});
