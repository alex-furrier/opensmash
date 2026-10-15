// SPDX-License-Identifier: MIT
import schema from '../runtime/launch-options.json' with {type:'json'};
import {createRequire} from 'node:module';
const {WebSocketServer}=createRequire(new URL('../tools/netplay/package.json',import.meta.url))('ws');
import {createHash} from 'node:crypto';
import {createRooms} from '../tools/netplay/rooms.mjs';
import {resolvedRules} from '../runtime/web/netplay/match-identity.mjs';
import {disc,seed} from '../runtime/web/netplay/identity.mjs';
const companionKinds=new Map(Object.values(schema.companions).map(row=>[row.slug,row.fighter]));
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function validateFriendProposal(value){
 if(!value||!Array.isArray(value.costumes)||value.costumes.length>4||!Array.isArray(value.ports)||value.ports.length!==4)throw Error('Invalid friend match proposal.');
 const rules=resolvedRules(value);
 const costumes=value.costumes.map(c=>{
  if(!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(c.character)||!/^[a-z][a-z-]{0,31}$/.test(c.target)||!Number.isInteger(c.fighter)||c.fighter<0||c.fighter>26||!Number.isInteger(c.color)||c.color<0||c.color>5||!/^Pl[A-Za-z0-9]+\.dat$/.test(c.filename))throw Error('Invalid proposed costume.');
  if(c.companion!==undefined&&(c.companion!==true||companionKinds.get(c.target)!==c.fighter))throw Error('Invalid companion costume.');
  return {character:c.character,target:c.target,fighter:c.fighter,color:c.color,filename:c.filename,...(c.companion?{companion:true}:{})};
 });
 const ports=value.ports.map((p,i)=>({device:i<2?'keyboard':'off',character:String(p.character).slice(0,64),target:p.target,fighter:rules.packedPorts[i]&255,color:(rules.packedPorts[i]>>>16)&255,custom:!!p.custom}));
 return {...rules,ports,costumes};
}
/** One local website owns its ephemeral room registry; browsers own prepared assets/game. */
export function privateFriendOrigin(value){
 if(!value)return undefined;
 const url=new URL(value);
 if(url.protocol!=='https:'||(!url.hostname.endsWith('.ts.net')&&!(value==='https://smash.alexfurrier.dev'&&process.env.MELEE_SHARED_HOSTING==='1'&&process.env.MELEE_SHARED_AUTH_FILE))||url.username||url.password||url.pathname!=='/'||url.search||url.hash||url.origin!==value)throw Error('MELEE_PRIVATE_ORIGIN must be one exact approved HTTPS private origin.');
 return url.origin;
}
export function friendOriginAllowed(req,{host='127.0.0.1',privateOrigin}={}){
 if(!['127.0.0.1','localhost','::1'].includes(host)||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))return false;
 const origin=req.headers.origin,authority=req.headers.host;
 if(privateOrigin&&origin===privateOrigin&&authority===new URL(privateOrigin).host)return true;
 try{const url=new URL(`http://${authority}`);return ['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&origin===url.origin;}catch{return false;}
}
export function attachFriendRooms(server,{engine,host='127.0.0.1',simulatedPeer,privateOrigin,sharedPassword}){
 privateOrigin=privateFriendOrigin(privateOrigin);
 if(privateOrigin==='https://smash.alexfurrier.dev'&&!sharedPassword)throw Error('Custom origin requires shared-password upgrade authorization.');
 const rooms=createRooms({identity:{},launch:{},maxRooms:8,ttlMs:60*60*1000,permitTestBot:()=>!!simulatedPeer,startTestBot:request=>simulatedPeer.start(request),stopTestBot:session=>simulatedPeer?.stop(session),permitTestBotJoin:()=>!!simulatedPeer,resolveMatch:value=>{const proposal=validateFriendProposal(value);return {identity:null,launch:resolvedRules(proposal),proposal};},validateReady:(identity,room)=>{
  if(identity?.engine!==engine||identity.disc!==disc||identity.seed!==seed||identity.rules!==digest(resolvedRules(room.launch))||!/^[a-f0-9]{64}$/.test(identity.costumes))throw Error('Installed friend match identity mismatch.');
 }});
 const wss=new WebSocketServer({noServer:true,maxPayload:16384,perMessageDeflate:false});
 const upgrade=async(req,socket,head)=>{
  let auth;
  if(sharedPassword){
   try{auth=await sharedPassword.authorizeUpgrade(req);}catch{}
   if(!auth){socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\nCache-Control: no-store\r\n\r\n');return;}
  }
  if(req.url!=='/melee/room')return;
  if(!friendOriginAllowed(req,{host,privateOrigin})){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\nCache-Control: no-store\r\n\r\n');return;}
  wss.handleUpgrade(req,socket,head,ws=>{if(sharedPassword&&!sharedPassword.trackSocket(ws,auth))return;wss.emit('connection',ws);});
 };
 server.on('upgrade',upgrade);
 wss.on('connection',socket=>{socket.on('message',raw=>{try{rooms.receive(socket,JSON.parse(raw.toString()));}catch{rooms.disconnected(socket);socket.close(1008);}});socket.on('close',()=>rooms.disconnected(socket));socket.on('error',()=>rooms.disconnected(socket));});
 const sweep=setInterval(()=>rooms.sweep(),30000);sweep.unref();
 return {close(){clearInterval(sweep);server.off('upgrade',upgrade);rooms.close();for(const socket of wss.clients)socket.terminate();wss.close();}};
}
