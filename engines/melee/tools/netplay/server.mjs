// SPDX-License-Identifier: MIT
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {readFile,stat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {WebSocketServer} from 'ws';
import {createRooms} from './rooms.mjs';
import {launch,seed,disc,sha256,installedIdentity} from '../../runtime/web/netplay/identity.mjs';
const here=dirname(fileURLToPath(import.meta.url)),web=resolve(here,'../../runtime/web');
/** Loopback listener, optionally behind one approved HTTPS proxy. Never serves a disc. */
export async function startRelay({engineRoot,port=0,httpsOrigin}={}) {
 if(httpsOrigin){const url=new URL(httpsOrigin);if(url.protocol!=='https:'||url.origin!==httpsOrigin||url.username||url.password)throw Error('Pass one exact HTTPS origin without path or credentials.');}
 const source=engineRoot&&resolve(engineRoot,'platforms/browser'),binary=engineRoot&&resolve(engineRoot,'build/browser/runtime/platforms/browser');
 const files=new Map([['/',resolve(web,'netplay/lobby.html')],['/lobby-client.mjs',resolve(web,'netplay/lobby-client.mjs')],['/lobby.css',resolve(web,'netplay/lobby.css')]]);
 for(const name of ['verify-disc.mjs','disc.mjs','disc-chunks.mjs','local-files.mjs','audio-worklet.js'])files.set('/engine/'+name,resolve(web,name));
 for(const name of ['confirmed-input.mjs','browser-bridge.mjs','identity.mjs','debug-opponent.mjs','lobby-input.mjs'])files.set('/engine/netplay/'+name,resolve(web,'netplay',name));
 files.set('/engine/touch-pad.mjs',resolve(here,'../../web/lib/touch-pad.mjs'));
 files.set('/touch-controls.css',resolve(here,'../../web/app/MeleeTouchControls.css'));
 if(source)for(const name of ['runtime.mjs','runtime.html','gpu-preflight.mjs','disc-cache.mjs','save-migration.mjs','initial_pipeline_cache.db'])files.set('/engine/upstream/'+name,resolve(source,name));
 if(binary)for(const name of ['melee_browser.js','melee_browser.wasm','melee_browser.worker.js'])files.set('/engine/upstream/'+name,resolve(binary,name));
 const required=[...files.keys()].filter(url=>url.startsWith('/engine/')&&!url.endsWith('melee_browser.worker.js'));
 let manifest,unavailable;
 try {
  if(!engineRoot)throw Error('Pass --engine-root with a built candidate checkout.');
  const pinned=[];for(const url of required)pinned.push({url,sha256:await sha256(await readFile(files.get(url)))});
  const engine=await sha256(new TextEncoder().encode(JSON.stringify(pinned)));
  manifest={files:pinned,launch,identity:await installedIdentity(engine,launch,{verifiedDisc:disc,installedSeed:seed,freshSaves:true})};
 }catch(error){unavailable=error.message;}
 const rooms=manifest&&createRooms({identity:manifest.identity,launch});
 const headers={'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 let origin;const allowed=new Map();
 const server=createServer(async(req,res)=>{
  const reply=(code,type,body)=>{res.writeHead(code,{...headers,'Content-Type':type});res.end(body);};
  if(!allowed.has(req.headers.host))return reply(403,'text/plain','Invalid approved host.');
  if(req.method!=='GET')return reply(405,'text/plain','GET only.');
  const url=new URL(req.url,origin);
  if(url.pathname==='/manifest')return reply(manifest?200:503,'application/json',JSON.stringify(manifest||{error:unavailable}));
  const path=files.get(url.pathname);if(!path)return reply(404,'text/plain','Not found.');
  try{const info=await stat(path);const ext=path.split('.').at(-1),type={html:'text/html',mjs:'text/javascript',js:'text/javascript',css:'text/css',wasm:'application/wasm'}[ext]||'application/octet-stream';res.writeHead(200,{...headers,'Content-Type':type,'Content-Length':info.size});createReadStream(path).on('error',()=>res.destroy()).pipe(res);}catch{reply(404,'text/plain','Runtime file unavailable.');}
 });
 const wss=new WebSocketServer({noServer:true,maxPayload:16384,perMessageDeflate:false});
 server.on('upgrade',(req,socket,head)=>{
  if(!rooms||req.url!=='/room'||!allowed.has(req.headers.host)||allowed.get(req.headers.host)!==req.headers.origin){socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));
 });
 wss.on('connection',socket=>{socket.on('message',data=>{try{rooms.receive(socket,JSON.parse(data.toString()));}catch{rooms.disconnected(socket);socket.close(1008,'Invalid request');}});socket.on('close',()=>rooms.disconnected(socket));socket.on('error',()=>rooms.disconnected(socket));});
 await new Promise((accept,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',accept);});
 origin='http://127.0.0.1:'+server.address().port;
 allowed.set(new URL(origin).host,origin);if(httpsOrigin)allowed.set(new URL(httpsOrigin).host,httpsOrigin);
 const sweep=setInterval(()=>rooms?.sweep(),30000);sweep.unref();
 return {origin,manifest,async close(){clearInterval(sweep);rooms?.close();for(const client of wss.clients)client.terminate();await new Promise(r=>wss.close(r));await new Promise(r=>server.close(r));}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),value=name=>args[args.indexOf(name)+1];
 const relay=await startRelay({engineRoot:args.includes('--engine-root')?value('--engine-root'):undefined,port:args.includes('--port')?Number(value('--port')):8787,httpsOrigin:args.includes('--https-origin')?value('--https-origin'):undefined});
 console.log(relay.origin+' — loopback Melee lobby'+(args.includes('--https-origin')?' with approved HTTPS proxy':''));
 if(!relay.manifest)console.log('Engine unavailable; /manifest explains missing build.');
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>relay.close().then(()=>process.exit()));
}
