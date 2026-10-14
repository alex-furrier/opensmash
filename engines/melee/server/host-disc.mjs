// SPDX-License-Identifier: MIT
import {open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {ISO_SIZE,ISO_SHA256} from '../runtime/web/disc.mjs';
export const HOST_DISC_PATH='/melee/api/disc';
export const HOST_DISC_CONFIG_PATH='/melee/api/disc-source';
/** One explicitly configured, verified file; no caller-supplied filesystem path. */
export async function createHostDisc({file,expectedSize=ISO_SIZE,expectedHash=ISO_SHA256}){
 const handle=await open(file,'r');let info;
 try{
  info=await handle.stat();if(!info.isFile()||info.size!==expectedSize)throw Error('Configured host disc has an unexpected size.');
  const hash=createHash('sha256');
  for(let offset=0;offset<expectedSize;){const bytes=Buffer.alloc(Math.min(65536,expectedSize-offset));const {bytesRead}=await handle.read(bytes,0,bytes.length,offset);if(!bytesRead)throw Error('Configured host disc ended early.');hash.update(bytes.subarray(0,bytesRead));offset+=bytesRead;}
  if(hash.digest('hex')!==expectedHash)throw Error('Configured host disc does not match the pinned disc digest.');
 }catch(error){await handle.close();throw error;}
 const streams=new Set();let closed=false;
 const unchanged=current=>current.size===info.size&&current.mtimeMs===info.mtimeMs&&current.ctimeMs===info.ctimeMs;
 return{
  metadata:{available:true,url:HOST_DISC_PATH,size:expectedSize,sha256:expectedHash},
  async respond(req,res){
   const reject=status=>{res.writeHead(status,{'Cache-Control':'no-store'});res.end();};
   if(req.url!==HOST_DISC_PATH||!['GET','HEAD'].includes(req.method)||req.headers.range)return reject(404);
   if(closed||!unchanged(await handle.stat()))return reject(503);
   res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':expectedSize,'Cache-Control':'no-store','Cross-Origin-Resource-Policy':'same-origin','X-Content-Type-Options':'nosniff'});
   if(req.method==='HEAD'){res.end();return;}
   const stream=Readable.from((async function*(){for(let offset=0;offset<expectedSize;){const bytes=Buffer.alloc(Math.min(65536,expectedSize-offset));const {bytesRead}=await handle.read(bytes,0,bytes.length,offset);if(!bytesRead)throw Error('Host disc ended early.');offset+=bytesRead;yield bytes.subarray(0,bytesRead);}})(),{objectMode:false,highWaterMark:65536});streams.add(stream);
   const done=()=>{streams.delete(stream);res.removeListener('close',cancel);};
   const cancel=()=>stream.destroy();res.once('close',cancel);stream.once('close',done);stream.once('end',done);stream.once('error',()=>res.destroy());stream.pipe(res);
  },
  async close(){closed=true;for(const stream of streams)stream.destroy();await handle.close();}
 };
}
