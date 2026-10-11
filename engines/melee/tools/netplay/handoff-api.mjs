// SPDX-License-Identifier: MIT
import {MemoryHandoffRooms,HandoffError} from '../../../../web-prototype/server/handoff-rooms.js';
/** Separate, bounded signalling mailbox. No disc data or file paths are accepted. */
export function createPrivateHandoff({now=Date.now}={}){
 const rooms=new MemoryHandoffRooms({now,ttlMs:5*60*1000,maxRooms:8});
 function signal(message){
  if(!message||!['offer','answer','candidate','bye'].includes(message.type))throw new HandoffError(400,'Only pairing signals are accepted.');
  if(['offer','answer'].includes(message.type)&&(!message.sdp?.startsWith('v=0')||!message.sdp.includes('a=fingerprint:sha-256 ')))throw new HandoffError(400,'Invalid pairing description.');
  if(message.type==='candidate'&&(!message.candidate||typeof message.candidate.candidate!=='string'))throw new HandoffError(400,'Invalid pairing candidate.');
 }
 async function receive(path,body,address){
  if(path==='/api/handoff/rooms')return rooms.create({address});
  const match=/^\/api\/handoff\/rooms\/([A-Z2-9]{6})\/(join|messages|close)$/.exec(path);
  if(!match)throw new HandoffError(404,'Unknown pairing route.');
  const [,code,action]=match;
  if(action==='join')return rooms.join(code);
  if(action==='close')return rooms.close(code,body);
  if(body.poll===true)return rooms.poll(code,body);
  for(const message of body.messages||[body.message])signal(message);
  return rooms.post(code,body);
 }
 return{receive,sweep:()=>rooms.sweep(),close:()=>rooms.rooms.clear()};
}
export async function pairingBody(req){
 if(!req.headers['content-type']?.startsWith('application/json'))throw new HandoffError(415,'JSON pairing signals required.');
 let size=0;const chunks=[];
 for await(const chunk of req){size+=chunk.length;if(size>16384)throw new HandoffError(413,'Pairing request too large.');chunks.push(chunk);}
 try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw new HandoffError(400,'Invalid pairing request.');}
}
