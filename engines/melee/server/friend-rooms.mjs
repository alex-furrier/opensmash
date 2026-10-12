// SPDX-License-Identifier: MIT
import {createRequire} from 'node:module';
const {WebSocketServer}=createRequire(new URL('../tools/netplay/package.json',import.meta.url))('ws');
import {createHash} from 'node:crypto';
import {createRooms} from '../tools/netplay/rooms.mjs';
import {resolvedRules} from '../runtime/web/netplay/match-identity.mjs';
import {disc,seed} from '../runtime/web/netplay/identity.mjs';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function validateFriendProposal(value){
 if(!value||!Array.isArray(value.costumes)||value.costumes.length>4||!Array.isArray(value.ports)||value.ports.length!==4)throw Error('Invalid friend match proposal.');
 const rules=resolvedRules(value);
 const costumes=value.costumes.map(c=>{
  if(!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(c.character)||!/^[a-z][a-z-]{0,31}$/.test(c.target)||!Number.isInteger(c.fighter)||c.fighter<0||c.fighter>26||!Number.isInteger(c.color)||c.color<0||c.color>5||!/^Pl[A-Za-z0-9]+\.dat$/.test(c.filename))throw Error('Invalid proposed costume.');
  return {character:c.character,target:c.target,fighter:c.fighter,color:c.color,filename:c.filename};
 });
 const ports=value.ports.map((p,i)=>({device:i<2?'keyboard':'off',character:String(p.character).slice(0,64),target:p.target,fighter:rules.packedPorts[i]&255,color:(rules.packedPorts[i]>>>16)&255,custom:!!p.custom}));
 return {...rules,ports,costumes};
}
/** One local website owns its ephemeral room registry; browsers own prepared assets/game. */
export function attachFriendRooms(server,{engine,host='127.0.0.1'}){
 const rooms=createRooms({identity:{},launch:{},maxRooms:8,ttlMs:60*60*1000,resolveMatch:value=>{const proposal=validateFriendProposal(value);return {identity:null,launch:resolvedRules(proposal),proposal};},validateReady:(identity,room)=>{
  if(identity?.engine!==engine||identity.disc!==disc||identity.seed!==seed||identity.rules!==digest(resolvedRules(room.launch))||!/^[a-f0-9]{64}$/.test(identity.costumes))throw Error('Installed friend match identity mismatch.');
 }});
 const wss=new WebSocketServer({noServer:true,maxPayload:16384,perMessageDeflate:false});
 const upgrade=(req,socket,head)=>{
  if(req.url!=='/melee/room')return;
  if(!['127.0.0.1','localhost','[::1]'].includes(host)||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)||req.headers.origin!==`http://${req.headers.host}`){socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));
 };
 server.on('upgrade',upgrade);
 wss.on('connection',socket=>{socket.on('message',raw=>{try{rooms.receive(socket,JSON.parse(raw.toString()));}catch{rooms.disconnected(socket);socket.close(1008);}});socket.on('close',()=>rooms.disconnected(socket));socket.on('error',()=>rooms.disconnected(socket));});
 const sweep=setInterval(()=>rooms.sweep(),30000);sweep.unref();
 return {close(){clearInterval(sweep);server.off('upgrade',upgrade);rooms.close();for(const socket of wss.clients)socket.terminate();wss.close();}};
}
