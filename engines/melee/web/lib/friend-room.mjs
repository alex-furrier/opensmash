export const localFriendDevice=ports=>ports?.find(p=>p.device==='keyboard'||/^gamepad(?:[0-9]|[1-9][0-9])$/.test(p.device))?.device;
// SPDX-License-Identifier: MIT
/** One room connection for one Game instance. The engine owns tick/input synchronization. */
export function connectFriendRoom(request,onChange,{WebSocketImpl=WebSocket,origin=location.origin}={}){
 const socket=new WebSocketImpl(origin.replace('http','ws')+'/melee/room');
 let joined,closed=false,channel,resolveJoin,rejectJoin,resolveStart,rejectStart,roomState,progress;
 const assignment=new Promise((ok,fail)=>{resolveJoin=ok;rejectJoin=fail;});void assignment.catch(()=>{});
 const started=new Promise((ok,fail)=>{resolveStart=ok;rejectStart=fail;});void started.catch(()=>{});
 const send=value=>{if(closed||socket.readyState!==1)throw Error('Friend room unavailable.');socket.send(JSON.stringify(value));};
 const stop=(reason='Room stopped. Create a fresh room.')=>{
  if(closed)return;try{send({type:'stop'});}catch{}closed=true;
  channel?.port1.close();channel?.port2.close();socket.close();
  const error=Error(reason);rejectJoin(error);rejectStart(error);onChange?.({type:'stopped',reason});
 };
 socket.onopen=()=>{try{send(request);}catch(error){stop(error.message);}};
 socket.onerror=()=>stop('Room connection failed. Create a fresh room.');
 socket.onclose=()=>stop('Peer disconnected. Create a fresh room.');
 socket.onmessage=({data})=>{
  if(closed)return;
  try{
   const message=JSON.parse(data);
   if(message.type==='joined'){if(joined)throw Error('Duplicate room assignment.');joined=message;resolveJoin(message);}
   else if(message.type==='start'){
    if(!joined||message.session!==joined.session)throw Error('Wrong match session.');
    channel=new MessageChannel();channel.port1.onmessage=event=>{try{send({type:'peer',packet:event.data});}catch(error){stop(error.message);}};channel.port1.start();resolveStart({session:joined.session,player:joined.player,port:channel.port2,friendMatch:true});
   }else if(message.type==='peer'){if(!channel)throw Error('Input outside match.');channel.port1.postMessage(message.packet);}
   else if(['rejected','stopped'].includes(message.type)){stop(message.reason);return;}
   else if(message.type==='room'){roomState=message;progress?.(message);}
   else throw Error('Invalid room response.');
   onChange?.(message);
  }catch(error){stop(error.message);}
 };
 return {assignment,stop,get closed(){return closed;},async ready(identity,onProgress){await assignment;progress=onProgress;if(roomState)progress?.(roomState);try{send({type:'ready',identity});return {...await started,identity};}finally{progress=undefined;}}};
}
