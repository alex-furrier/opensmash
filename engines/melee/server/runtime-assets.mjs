// SPDX-License-Identifier: MIT
import {createReadStream} from 'node:fs';
import {readFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {launch,seed,disc,sha256,installedIdentity} from '../runtime/web/netplay/identity.mjs';
export const runtimeAssetHeaders=Object.freeze({'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
/** Runtime asset identity and streaming; no listener, room or handoff lifetime. */
export async function createRuntimeAssets(engineRoot){
 const web=fileURLToPath(new URL('../runtime/web/',import.meta.url));
 const source=engineRoot&&resolve(engineRoot,'platforms/browser'),binary=engineRoot&&resolve(engineRoot,'build/browser/runtime/platforms/browser');
 const files=new Map();
 for(const name of ['verify-disc.mjs','disc.mjs','disc-chunks.mjs','local-files.mjs','audio-worklet.js'])files.set('/engine/'+name,resolve(web,name));
 for(const name of ['confirmed-input.mjs','browser-bridge.mjs','identity.mjs','debug-opponent.mjs','lobby-input.mjs','match-identity.mjs'])files.set('/engine/netplay/'+name,resolve(web,'netplay',name));
 files.set('/engine/touch-pad.mjs',fileURLToPath(new URL('../web/lib/touch-pad.mjs',import.meta.url)));
 if(source)for(const name of ['runtime.mjs','runtime.html','gpu-preflight.mjs','disc-cache.mjs','save-migration.mjs','initial_pipeline_cache.db'])files.set('/engine/upstream/'+name,resolve(source,name));
 if(binary)for(const name of ['melee_browser.js','melee_browser.wasm','melee_browser.worker.js'])files.set('/engine/upstream/'+name,resolve(binary,name));
 let manifest,unavailable;
 try{
  if(!engineRoot)throw Error('Pass --engine-root with a built candidate checkout.');
  const pinned=[];for(const [url,path] of files)if(!url.endsWith('melee_browser.worker.js'))pinned.push({url,sha256:await sha256(await readFile(path))});
  const engine=await sha256(new TextEncoder().encode(JSON.stringify(pinned)));
  manifest={files:pinned,launch,identity:await installedIdentity(engine,launch,{verifiedDisc:disc,installedSeed:seed,freshSaves:true})};
 }catch(error){unavailable=error.message;}
 return {manifest,unavailable,handle(req,res,path=req.url){
  const pathname=new URL(path,'http://localhost').pathname;
  if(!pathname.startsWith('/engine/'))return false;
  const reply=(code,body)=>{res.writeHead(code,{...runtimeAssetHeaders,'Content-Type':'text/plain'});res.end(body);};
  if(req.method!=='GET'){reply(405,'GET only.');return true;}
  const file=files.get(pathname);if(!file){reply(404,'Not found.');return true;}
  void (async()=>{try{const info=await stat(file);const ext=file.split('.').at(-1),type={html:'text/html',mjs:'text/javascript',js:'text/javascript',css:'text/css',wasm:'application/wasm'}[ext]||'application/octet-stream';res.writeHead(200,{...runtimeAssetHeaders,'Content-Type':type,'Content-Length':info.size});createReadStream(file).on('error',()=>res.destroy()).pipe(res);}catch{reply(404,'Runtime file unavailable.');}})();
  return true;
 }};
}
