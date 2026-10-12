// SPDX-License-Identifier: MIT
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {readFile,stat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {WebSocketServer} from 'ws';
import {createTestBot} from './test-bot.mjs';
import {createDevDisc} from './dev-disc.mjs';
import {createRooms} from './rooms.mjs';
import {createPrivateHandoff,pairingBody} from './handoff-api.mjs';
import {launch,seed,disc,sha256,installedIdentity} from '../../runtime/web/netplay/identity.mjs';
const here=dirname(fileURLToPath(import.meta.url)),web=resolve(here,'../../runtime/web');
/** Loopback listener, optionally behind one approved HTTPS proxy. Never serves a disc. */
export async function startRelay({engineRoot,port=0,httpsOrigin,devDisc,testBot}={}) {
 if(httpsOrigin){const url=new URL(httpsOrigin);if(url.protocol!=='https:'||url.origin!==httpsOrigin||url.username||url.password)throw Error('Pass one exact HTTPS origin without path or credentials.');}
 const source=engineRoot&&resolve(engineRoot,'platforms/browser'),binary=engineRoot&&resolve(engineRoot,'build/browser/runtime/platforms/browser');
 const files=new Map([['/',resolve(web,'netplay/lobby.html')],['/lobby-client.mjs',resolve(web,'netplay/lobby-client.mjs')],['/lobby.css',resolve(web,'netplay/lobby.css')]]);
 for(const name of ['verify-disc.mjs','disc.mjs','disc-chunks.mjs','local-files.mjs','audio-worklet.js'])files.set('/engine/'+name,resolve(web,name));
 for(const name of ['confirmed-input.mjs','browser-bridge.mjs','identity.mjs','debug-opponent.mjs','lobby-input.mjs','match-identity.mjs'])files.set('/engine/netplay/'+name,resolve(web,'netplay',name));
 files.set('/engine/touch-pad.mjs',resolve(here,'../../web/lib/touch-pad.mjs'));
 files.set('/touch-controls.css',resolve(here,'../../web/app/MeleeTouchControls.css'));
 if(source)for(const name of ['runtime.mjs','runtime.html','gpu-preflight.mjs','disc-cache.mjs','save-migration.mjs','initial_pipeline_cache.db'])files.set('/engine/upstream/'+name,resolve(source,name));
 if(binary)for(const name of ['melee_browser.js','melee_browser.wasm','melee_browser.worker.js'])files.set('/engine/upstream/'+name,resolve(binary,name));
 for(const [url,path] of [['/transfer/disc-transfer.mjs',resolve(web,'netplay/disc-transfer.mjs')],['/transfer/disc-cache.mjs',resolve(here,'../../web/lib/disc-cache.mjs')],['/transfer/rom-handoff-client.js',resolve(here,'../../../../web-prototype/src/rom-handoff-client.js')],['/shared/handoff-transfer.js',resolve(here,'../../../../web-prototype/shared/handoff-transfer.js')],['/shared/rom-handoff.js',resolve(here,'../../../../web-prototype/shared/rom-handoff.js')]])files.set(url,path);
 const required=[...files.keys()].filter(url=>url.startsWith('/engine/')&&!url.endsWith('melee_browser.worker.js'));
 let manifest,unavailable;
 try {
  if(!engineRoot)throw Error('Pass --engine-root with a built candidate checkout.');
  const pinned=[];for(const url of required)pinned.push({url,sha256:await sha256(await readFile(files.get(url)))});
  const engine=await sha256(new TextEncoder().encode(JSON.stringify(pinned)));
  manifest={files:pinned,launch,identity:await installedIdentity(engine,launch,{verifiedDisc:disc,installedSeed:seed,freshSaves:true})};
 }catch(error){unavailable=error.message;}
 const dev=devDisc&&await createDevDisc({...devDisc,httpsOrigin});
 const handoff=createPrivateHandoff();
 if(testBot&&(!dev||!manifest)){await dev?.close();throw Error('Test opponent requires the configured private dev disc/runtime.');}
 let bot;const rooms=manifest&&createRooms({identity:manifest.identity,launch,permitTestBot:socket=>!!bot&&socket.privateOwner===true,startTestBot:request=>bot.start(request),stopTestBot:session=>bot?.stop(session),permitTestBotJoin:socket=>socket.localHelper===true});
 const headers={'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 let origin;const allowed=new Map();
 const server=createServer(async(req,res)=>{
  const reply=(code,type,body)=>{res.writeHead(code,{...headers,'Content-Type':type});res.end(body);};
  if(!allowed.has(req.headers.host))return reply(403,'text/plain','Invalid approved host.');
  const url=new URL(req.url,origin);
  if(url.pathname.startsWith('/dev-disc/')){if(!dev)return reply(404,'text/plain','Not found.');if(url.pathname==='/dev-disc/config'&&dev.authorized(req)){const info={size:1459978240,expiresAt:dev.expiresAt,available:Date.now()<dev.expiresAt,testBot:!!bot};return reply(200,'application/json',JSON.stringify(info));}dev.respond(req,res,reply);return;}
  if(url.pathname.startsWith('/api/handoff/')){
   if(req.method!=='POST')return reply(405,'text/plain','POST only.');
   if(req.headers.origin!==allowed.get(req.headers.host))return reply(403,'text/plain','Invalid pairing origin.');
   try{return reply(200,'application/json',JSON.stringify(await handoff.receive(url.pathname,await pairingBody(req),req.socket.remoteAddress)));}catch(error){return reply(error.status||400,'application/json',JSON.stringify({error:error.status?error.message:'Invalid pairing request.'}));}
  }
  if(req.method!=='GET')return reply(405,'text/plain','GET only.');
  if(url.pathname==='/manifest')return reply(manifest?200:503,'application/json',JSON.stringify(manifest||{error:unavailable}));
  const path=files.get(url.pathname);if(!path)return reply(404,'text/plain','Not found.');
  try{const info=await stat(path);const ext=path.split('.').at(-1),type={html:'text/html',mjs:'text/javascript',js:'text/javascript',css:'text/css',wasm:'application/wasm'}[ext]||'application/octet-stream';res.writeHead(200,{...headers,'Content-Type':type,'Content-Length':info.size});createReadStream(path).on('error',()=>res.destroy()).pipe(res);}catch{reply(404,'text/plain','Runtime file unavailable.');}
 });
 const wss=new WebSocketServer({noServer:true,maxPayload:16384,perMessageDeflate:false});
 server.on('upgrade',(req,socket,head)=>{
  if(!rooms||req.url!=='/room'||!allowed.has(req.headers.host)||allowed.get(req.headers.host)!==req.headers.origin){socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
  wss.handleUpgrade(req,socket,head,ws=>{ws.privateOwner=!!dev?.authorized(req);ws.localHelper=req.headers.host===new URL(origin).host&&req.headers.origin===origin&&!req.headers['x-forwarded-for']&&!req.headers['x-forwarded-proto'];wss.emit('connection',ws);});
 });
 wss.on('connection',socket=>{socket.on('message',data=>{try{rooms.receive(socket,JSON.parse(data.toString()));}catch{rooms.disconnected(socket);socket.close(1008,'Invalid request');}});socket.on('close',()=>rooms.disconnected(socket));socket.on('error',()=>rooms.disconnected(socket));});
 await new Promise((accept,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',accept);});
 origin='http://127.0.0.1:'+server.address().port;
 allowed.set(new URL(origin).host,origin);if(httpsOrigin)allowed.set(new URL(httpsOrigin).host,httpsOrigin);
 if(testBot){bot=createTestBot({...testBot,origin,iso:devDisc.path});}
 const sweep=setInterval(()=>{rooms?.sweep();handoff.sweep();},30000);sweep.unref();
 return {origin,manifest,devExpiresAt:dev?.expiresAt,testBot:bot,async close(){clearInterval(sweep);rooms?.close();await bot?.close();await dev?.close();handoff.close();for(const client of wss.clients)client.terminate();await new Promise(r=>wss.close(r));await new Promise(r=>server.close(r));}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),value=name=>args[args.indexOf(name)+1];
 const relay=await startRelay({engineRoot:args.includes('--engine-root')?value('--engine-root'):undefined,port:args.includes('--port')?Number(value('--port')):8787,httpsOrigin:args.includes('--https-origin')?value('--https-origin'):undefined,devDisc:args.includes('--dev-disc')?{path:value('--dev-disc'),owner:value('--dev-owner'),deviceIPs:value('--dev-device-ips').split(','),ttlMs:args.includes('--dev-hours')?Number(value('--dev-hours'))*60*60*1000:undefined,expiresAt:args.includes('--dev-until')?Date.parse(value('--dev-until')):undefined}:undefined,testBot:args.includes('--test-bot')?{chromium:(await import('node:module')).createRequire(import.meta.url)(value('--playwright-module')).chromium}:undefined});
 if(relay.devExpiresAt)console.log('Temporary own-phone dev source expires '+new Date(relay.devExpiresAt).toISOString());
 console.log(relay.origin+' — loopback Melee lobby'+(args.includes('--https-origin')?' with approved HTTPS proxy':''));
 if(!relay.manifest)console.log('Engine unavailable; /manifest explains missing build.');
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>relay.close().then(()=>process.exit()));
}
