// SPDX-License-Identifier: MIT
import http from 'node:http';
import {createReadStream} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {startRelay} from '../tools/netplay/server.mjs';
export async function createLauncherRuntime(engineRoot){
 const runtime=await startRelay({engineRoot});
 if(!runtime.manifest){await runtime.close();throw Error('Build the verified friend-match engine first.');}
 const files=runtime.manifest.files.map(file=>({...file,url:'/melee'+file.url}));
 const audioFiles=new Map(['audio-output.mjs','audio-worklet.mjs'].map(name=>['/melee/engine/direct-c/'+name,fileURLToPath(new URL('../runtime/direct-c/web/'+name,import.meta.url))]));
 audioFiles.set('/melee/engine/direct-c/melee-audio.wasm',fileURLToPath(new URL('../build/direct-c/melee-audio.wasm',import.meta.url)));
 for(const [url,path] of audioFiles)files.push({url,sha256:createHash('sha256').update(await readFile(path)).digest('hex')});
 const engine=createHash('sha256').update(JSON.stringify(files)).digest('hex');
 const manifest={files,identity:{...runtime.manifest.identity,engine}};
 return {engine,close:()=>runtime.close(),handle(req,res){
  if(req.url==='/melee/api/netplay/manifest'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(manifest));return true;}
  const audioPath=audioFiles.get(new URL(req.url,'http://localhost').pathname);
  if(audioPath){res.writeHead(200,{'Content-Type':audioPath.endsWith('.wasm')?'application/wasm':'text/javascript','Cross-Origin-Resource-Policy':'same-origin','Cache-Control':'no-store'});createReadStream(audioPath).on('error',()=>res.destroy()).pipe(res);return true;}
  if(!req.url.startsWith('/melee/engine/')||req.url.startsWith('/melee/engine/native-fit/'))return false;
  const target=new URL(runtime.origin);
  const proxy=http.request(new URL(req.url.slice('/melee'.length),target),{method:req.method,headers:{...req.headers,host:target.host}},incoming=>{res.writeHead(incoming.statusCode,incoming.headers);incoming.pipe(res);});
  proxy.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.on('aborted',()=>proxy.destroy());res.on('close',()=>{if(!res.writableEnded)proxy.destroy();});req.pipe(proxy);return true;
 }};
}
