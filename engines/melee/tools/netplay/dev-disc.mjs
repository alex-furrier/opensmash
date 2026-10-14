// SPDX-License-Identifier: MIT
// Explicit, temporary owner-device dev source. Never enabled by default.
import {open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isIP} from 'node:net';
import {Readable} from 'node:stream';
import {ISO_SIZE,ISO_SHA256} from '../../runtime/web/disc.mjs';
export async function createDevDisc({path,owner,deviceIPs,httpsOrigin,now=Date.now,ttlMs=20*60*1000,expiresAt:deadline,expectedSize=ISO_SIZE,expectedHash=ISO_SHA256}){
 if(!Number.isSafeInteger(ttlMs)||ttlMs<=0||ttlMs>24*60*60*1000)throw Error('Dev access duration must be positive and at most 24 hours.');
 if(!path||!owner||!deviceIPs?.length||deviceIPs.some(ip=>!isIP(ip))||!httpsOrigin)throw Error('Dev disc requires one explicit file, owner, device addresses and HTTPS origin.');
 if(deadline!==undefined&&(!Number.isSafeInteger(deadline)||deadline<=now()||deadline>now()+24*60*60*1000))throw Error('Invalid fixed dev expiry.');
 const handle=await open(path,'r');
 try{
  const info=await handle.stat();if(!info.isFile()||info.size!==expectedSize)throw Error('Dev source has the wrong disc size.');
  const hash=createHash('sha256');for await(const chunk of handle.createReadStream({start:0,autoClose:false}))hash.update(chunk);
  if(hash.digest('hex')!==expectedHash)throw Error('Dev source does not match the known disc.');
 }catch(error){await handle.close();throw error;}
 const expiresAt=deadline??now()+ttlMs;let active,closed=false;
 const authorized=req=>['127.0.0.1','::ffff:127.0.0.1','::1'].includes(req.socket.remoteAddress)&&req.headers.host===new URL(httpsOrigin).host&&req.headers['x-forwarded-host']===req.headers.host&&req.headers['x-forwarded-proto']==='https'&&req.headers['tailscale-headers-info']==='https://tailscale.com/s/serve-headers'&&!req.headers['tailscale-funnel-request']&&req.headers['tailscale-user-login']===owner&&deviceIPs.includes(req.headers['x-forwarded-for']);
 function respond(req,res,reply){
  if(!authorized(req)){reply(403,'text/plain','This temporary dev source is unavailable to this device.');return;}
  if(req.url==='/dev-disc/config'&&req.method==='GET'){reply(200,'application/json',JSON.stringify({size:expectedSize,expiresAt,available:!closed&&now()<expiresAt}));return;}
  if(closed||now()>=expiresAt){reply(403,'text/plain','Download access expired. Your saved game remains on your device.');return;}
  if(req.url!=='/dev-disc/load'||req.method!=='POST'){reply(405,'text/plain','Unsupported dev source request.');return;}
  if(req.headers.origin!==httpsOrigin||req.headers['transfer-encoding']||Number(req.headers['content-length']||0)!==0){reply(403,'text/plain','Invalid dev source request.');return;}
  if(active){reply(409,'text/plain','A load is already running on your device.');return;}
  res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':expectedSize,'Cache-Control':'no-store','Cross-Origin-Resource-Policy':'same-origin','X-Content-Type-Options':'nosniff'});
  const stream=Readable.from((async function*(){for(let offset=0;offset<expectedSize;){const chunk=Buffer.alloc(Math.min(65536,expectedSize-offset));const{bytesRead}=await handle.read(chunk,0,chunk.length,offset);if(!bytesRead)throw Error('Dev disc ended early.');offset+=bytesRead;yield chunk.subarray(0,bytesRead);}})(),{objectMode:false,highWaterMark:65536});active=stream;
  const timer=setTimeout(()=>{stream.destroy();res.destroy();},Math.max(1,expiresAt-now()));timer.unref();
  const done=()=>{clearTimeout(timer);if(active===stream)active=undefined;};
  stream.on('error',()=>res.destroy());stream.on('end',done);res.on('close',()=>{stream.destroy();done();});stream.pipe(res);
 }
 return{expiresAt,authorized,respond,async close(){closed=true;active?.destroy();await handle.close();}};
}
