// SPDX-License-Identifier: MIT
import {installedIdentity,canonicalLaunch} from '/engine/netplay/identity.mjs';
import {neutralTouchPad} from '/engine/touch-pad.mjs';
import {mountTouchDeck,typingTarget} from '/engine/netplay/lobby-input.mjs';
import {validateDebug} from '/engine/netplay/debug-opponent.mjs';
const $=id=>document.getElementById(id),status=message=>{$('status').textContent=message;};
let manifest,room,socket,frame,port,audioContext,audioNode,audioRing,iso,warm=false,starting=false,leaving=false;
let runtimeGeneration=0;
const held=new Set(),touch={current:neutralTouchPad()},touchController=mountTouchDeck($('touch-root'),touch);
const debugging=new URLSearchParams(location.search).get('debug')==='1';$('debug-controls').hidden=!debugging;
const keys={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down',KeyZ:'attack',KeyX:'special',KeyC:'jump',KeyQ:'shield',Enter:'start'};
function send(message){if(socket?.readyState!==WebSocket.OPEN)throw Error('Room connection unavailable.');socket.send(JSON.stringify(message));}
function post(data,transfer=[]){frame?.contentWindow.postMessage(data,location.origin,transfer);}
function controls(){
 $('create').disabled=!!room||!manifest;$('join').disabled=!!room||!manifest;
 $('ready').disabled=!room||!warm||starting||leaving||!!room.ready;
 $('stop').disabled=!room;$('disc').disabled=starting||!!room?.ready;
 $('debug-scripted').disabled=room?.player!==1||starting||!!room?.ready;$('debug-scenario').disabled=starting||!!room?.ready;
}
function release(){held.clear();touchController.reset();post({type:'input',values:[0,0,0,0,0,0,0,0,1]});}
function destroyRuntime(){
 runtimeGeneration++;
 release();post({type:'netplay-stop'});
 // Close the runtime synchronously before removing its realm. An iframe removal
 // does not reliably dispatch pagehide/unload or terminate its worker pool.
 frame?.contentWindow.dispatchEvent?.(new Event('opensmash-runtime-close'));
 port?.close();port=undefined;frame?.remove();frame=undefined;
 audioNode?.disconnect();audioNode=undefined;audioRing=undefined;audioContext?.close().catch(()=>{});audioContext=undefined;
 warm=false;starting=false;$('debug-measured').textContent='Stopped. Create a fresh room.';$('screen').replaceChildren();$('game').hidden=true;
}
function leave(reason='Room closed. Create a fresh room.'){
 if(leaving)return;leaving=true;
 try{if(room&&socket?.readyState===WebSocket.OPEN)send({type:'stop'});}catch{}
 destroyRuntime();iso=undefined;$('disc').value='';socket?.close();socket=undefined;room=undefined;$('share').hidden=true;$('players').textContent='Create or join a fresh room.';
 status(reason);leaving=false;controls();
}
async function sound(){
 if(audioContext)return true;
 const generation=runtimeGeneration,context=new AudioContext({sampleRate:48000});audioContext=context;
 try{
  await context.audioWorklet.addModule('/engine/audio-worklet.js');
  if(generation!==runtimeGeneration||audioContext!==context){await context.close().catch(()=>{});return false;}
  const ring=new SharedArrayBuffer(16+32768*2*4);
  const node=new AudioWorkletNode(context,'melee-audio',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{ring}});
  audioRing=ring;audioNode=node;node.connect(context.destination);await context.resume();
  return generation===runtimeGeneration&&audioContext===context;
 }catch(error){if(generation!==runtimeGeneration||audioContext!==context)return false;throw error;}
}
function warmRuntime(){
 if(!room||!iso||frame)return;
 warm=false;frame=document.createElement('iframe');frame.title='Melee game';frame.src='/engine/upstream/runtime.html';$('screen').append(frame);
 status('Checking your local game and preparing the Melee runtime…');controls();
}
async function begin(){
 if(!warm||!frame||starting)throw Error('Local Melee runtime is not ready.');
 starting=true;const channel=new MessageChannel(),ownedPort=channel.port1,currentRoom=room,connection=socket,generation=runtimeGeneration;port=ownedPort;
 ownedPort.onmessage=event=>{
  if(port!==ownedPort||room!==currentRoom||socket!==connection||generation!==runtimeGeneration)return;
  try{send({type:'peer',packet:event.data});}catch(error){leave(error.message);}
 };ownedPort.start();
 post({type:'surface',direct:true});
 post({type:'select',launch:manifest.launch,costumes:[],cssAssets:[],renderWidth:960,requestedAt:Date.now(),
  netplay:{session:room.session,player:room.player,identity:room.localIdentity,port:channel.port2,...(room.debug?{debug:room.debug}:{})}},[channel.port2]);
 $('game').hidden=false;status('Both players ready. Opening Melee…');controls();
}
function connect(request){
 if(!manifest||socket)return;
 leaving=false;status('Connecting to the local room…');
 const connection=new WebSocket(location.origin.replace('http','ws')+'/room');socket=connection;
 socket.onopen=()=>{if(socket===connection)send(request);};
 socket.onerror=()=>{if(socket===connection)leave('Room connection failed. Create a fresh room.');};
 socket.onclose=()=>{if(socket!==connection)return;if(!leaving&&room)leave('Peer disconnected. Create a fresh room.');else if(!room){socket=undefined;controls();}};
 socket.onmessage=async({data})=>{if(socket!==connection)return;try{
  const message=JSON.parse(data);
  if(message.type==='joined'){
   if(room)throw Error('Duplicate room assignment.');canonicalLaunch(message.launch);
   if(!Object.keys(manifest.identity).every(key=>message.identity?.[key]===manifest.identity[key]))throw Error('Room runtime mismatch.');
   room={...message,ready:false};$('share').hidden=false;$('room-link').value=location.origin+'/#'+room.room;
   history.replaceState(null,'','#'+room.room);status('You are player '+(room.player+1)+'. Choose your local game, then Ready.');warmRuntime();controls();
  }else if(message.type==='room'){
   $('players').textContent=message.players.map((p,i)=>p?'Player '+(i+1)+': '+(p.ready?'Ready':'Preparing'):'Waiting for player '+(i+1)).join(' · ');
  }else if(message.type==='start'){
   if(!room||message.session!==room.session||!room.ready)throw Error('Unexpected start.');await begin();
  }else if(message.type==='peer'){
   if(!starting||!port)throw Error('Input arrived outside a match.');port.postMessage(message.packet);
  }else if(message.type==='stopped'||message.type==='rejected')leave(message.reason);
  else throw Error('Invalid room response.');
 }catch(error){leave(error.message);}};
}
window.addEventListener('message',async event=>{
 if(!frame||event.source!==frame.contentWindow||event.origin!==location.origin)return;
 const data=event.data,currentRoom=room,currentFrame=frame;
 try{
  if(data.type==='bridge-ready')post({type:'start',warm:true,freshNetplay:true,iso,discVerified:false,args:['--seed','17'],audio:audioRing});
  else if(data.type==='ready-for-selection'){
   const localIdentity=await installedIdentity(data.verifiedEngine,manifest.launch,{verifiedDisc:data.verifiedDiscHash,installedSeed:data.seed,freshSaves:data.freshSaves});
   if(room!==currentRoom||frame!==currentFrame)return;
   room.localIdentity=localIdentity;
   if(!Object.keys(manifest.identity).every(key=>room.localIdentity[key]===manifest.identity[key]))throw Error('Installed runtime identity mismatch.');
   warm=true;status('Local game verified. Press Ready when you are set.');controls();
  }else if(data.type==='status')status(data.message);
  else if(data.type==='error')leave(data.message);
  else if(data.type==='playable')status(room.debug?.scripted?'Scripted test opponent running. This is not native CPU AI.':'Match running. You control player '+(room.player+1)+'.');
  else if(data.type==='confirmed-tick'&&data.debug){const m=data.debug;$('debug-measured').textContent='Tick '+m.tick+' · '+m.scenario+' · requested '+m.requestedMs+' ms · measured '+m.measuredMs.toFixed(1)+' ms input wait';}
  // Observation has no authority over the simulation or remote input.
  window.dispatchEvent(new CustomEvent('opensmash-runtime',{detail:data}));
 }catch(error){if(room===currentRoom&&frame===currentFrame)leave(error.message);}
});
$('create').onclick=()=>connect({type:'create'});
$('join-form').onsubmit=event=>{event.preventDefault();let code=$('room-code').value.trim();try{if(code.includes('://'))code=new URL(code).hash.slice(1);}catch{}if(!/^[a-f0-9]{32}$/.test(code)){status('Paste a valid room link or code.');return;}connect({type:'join',room:code});};
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('room-link').value);status('Room link copied.');}catch{status('Select the room link and copy it.');}};
$('disc').onchange=async()=>{
 let generation=runtimeGeneration;
 try{
  if(room?.ready)throw Error('Create a fresh room before changing the verified game.');
  if(frame||audioContext)destroyRuntime();generation=runtimeGeneration;
  const selected=$('disc').files[0];iso=selected;if(!selected)return;
  if(!await sound()||generation!==runtimeGeneration||iso!==selected)return;
  warmRuntime();
 }catch(error){if(generation===runtimeGeneration)leave(error.message);}
};
$('ready').onclick=async()=>{
 const currentRoom=room,currentContext=audioContext,generation=runtimeGeneration;
 try{
  await currentContext?.resume();
  if(room!==currentRoom||audioContext!==currentContext||generation!==runtimeGeneration)return;
  if(!room?.localIdentity)throw Error('Verify your local game first.');
  room.debug=debugging?validateDebug({scripted:room.player===1&&$('debug-scripted').checked,scenario:$('debug-scenario').value,seed:17}):undefined;
  release();room.ready=true;send({type:'ready',identity:room.localIdentity});status('Ready. Waiting for the other player…');controls();
 }catch(error){if(room===currentRoom&&generation===runtimeGeneration)leave(error.message);}
};
$('stop').onclick=()=>leave('You left the room. Create a fresh room to play again.');
window.addEventListener('keydown',event=>{if(!starting||room?.debug?.scripted||typingTarget(event.target)||!keys[event.code])return;event.preventDefault();held.add(keys[event.code]);});
window.addEventListener('keyup',event=>{if(keys[event.code])held.delete(keys[event.code]);});
document.addEventListener('focusin',event=>{if(typingTarget(event.target))release();});
window.addEventListener('blur',release);document.addEventListener('visibilitychange',()=>{if(document.hidden)release();});
window.addEventListener('pagehide',()=>leave());window.addEventListener('orientationchange',release);window.addEventListener('resize',release);
function physical(){
 if(starting&&frame&&!document.hidden&&!room?.debug?.scripted){
  let button=(held.has('attack')?256:0)|(held.has('special')?512:0)|(held.has('jump')?1024:0)|(held.has('shield')?64:0)|(held.has('start')?4096:0);
  let x=(held.has('right')?80:0)-(held.has('left')?80:0),y=(held.has('up')?80:0)-(held.has('down')?80:0),cx=0,cy=0,left=held.has('shield')?255:0,right=0;
  const pad=navigator.getGamepads?.()[0];
  if(pad?.connected&&!document.hidden&&document.hasFocus()){const axis=n=>Math.abs(n||0)<.15?0:Math.round(Math.max(-1,Math.min(1,n))*80),pressed=i=>!!pad.buttons[i]?.pressed;
   x=axis(pad.axes[0]);y=-axis(pad.axes[1]);cx=axis(pad.axes[2]);cy=-axis(pad.axes[3]);
   button|=(pressed(0)?256:0)|(pressed(1)?512:0)|((pressed(2)||pressed(3))?1024:0)|(pressed(4)?64:0)|(pressed(5)?32:0)|(pressed(9)?4096:0);
   left=Math.round((pad.buttons[6]?.value||0)*255);right=Math.round((pad.buttons[7]?.value||0)*255);
  }
  const mobile=touch.current;button|=mobile.buttons;if(mobile.main){x=mobile.x;y=mobile.y;}if(mobile.c){cx=mobile.cx;cy=mobile.cy;}if(mobile.buttons&64)left=255;
  post({type:'input',values:[0,button,x,y,cx,cy,left,right,1]});
 }
 requestAnimationFrame(physical);
}
requestAnimationFrame(physical);
try{const response=await fetch('/manifest'),data=await response.json();if(!response.ok)throw Error(data.error||'Melee runtime unavailable.');manifest=data;canonicalLaunch(manifest.launch);const code=location.hash.slice(1);if(/^[a-f0-9]{32}$/.test(code))$('room-code').value=code;status('Create a room, or join using a room link.');}catch(error){status('Engine unavailable: '+error.message);}controls();
