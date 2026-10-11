import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {installedIdentity,canonicalLaunch,launch,disc,seed} from '../runtime/web/netplay/identity.mjs';
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
async function fixture(){
 const identity=await installedIdentity('e'.repeat(64),launch,{verifiedDisc:disc,installedSeed:seed,freshSaves:true}),events=new Map(),elements=new Map(),sockets=[],contexts=[];
 const element=id=>{if(!elements.has(id))elements.set(id,{value:'',files:[],children:[],append(child){this.children.push(child);},replaceChildren(){this.children=[];},hidden:false,textContent:''});return elements.get(id);};
 const document={hidden:false,hasFocus:()=>true,getElementById:element,addEventListener(){},createElement:()=>{const frame={steps:[],contentWindow:{postMessage(){}},remove(){this.steps.push('remove');this.removed=true;}};frame.contentWindow.dispatchEvent=event=>{frame.steps.push(event.type);};return frame;}};
 class Socket{
  static OPEN=1;
  constructor(){this.readyState=1;this.sent=[];sockets.push(this);}
  send(value){this.sent.push(JSON.parse(value));}
  close(){this.closed=true;this.readyState=3;}
  async joined(number){await this.onmessage({data:JSON.stringify({type:'joined',room:String(number).repeat(32),session:'room-'+number,player:0,identity,launch})});}
 }
 class Audio{
  constructor(){this.load=defer();this.audioWorklet={addModule:()=>this.load.promise};contexts.push(this);}
  resume(){return this.paused?.promise||Promise.resolve();}
  close(){this.closed=true;return Promise.resolve();}
 }
 class Node{connect(){}disconnect(){this.disconnected=true;}}
 const window={addEventListener:(name,fn)=>events.set(name,fn),dispatchEvent(){}};
 const context=vm.createContext({document,window,location:{origin:'http://127.0.0.1:9999',hash:''},history:{replaceState(){}},navigator:{},URLSearchParams,neutralTouchPad:()=>({}),mountTouchDeck:()=>({reset(){}}),typingTarget:()=>false,validateDebug:()=>undefined,WebSocket:Socket,AudioContext:Audio,AudioWorkletNode:Node,SharedArrayBuffer,Event:class{constructor(type){this.type=type;}},CustomEvent:class{},URL,requestAnimationFrame(){},fetch:async()=>({ok:true,json:async()=>({identity,launch})}),installedIdentity,canonicalLaunch,console});
 const source=(await readFile(new URL('../runtime/web/netplay/lobby-client.mjs',import.meta.url),'utf8')).replace(/^import .*\n/gm,'');
 await new vm.Script('(async()=>{'+source+'})()').runInContext(context);
 const create=async n=>{element('create').onclick();const socket=sockets.at(-1);socket.onopen();await socket.joined(n);return socket;};
 const choose=()=>{element('disc').files=[{name:'local.iso'}];return element('disc').onchange();};
 const verified=async()=>{const frame=element('screen').children.at(-1);await events.get('message')({source:frame.contentWindow,origin:'http://127.0.0.1:9999',data:{type:'ready-for-selection',verifiedEngine:identity.engine,verifiedDiscHash:disc,seed,freshSaves:true}});};
 return{element,sockets,contexts,create,choose,verified};
}
test('late old socket and audio worklet completion cannot close or modify a fresh room',async()=>{
 const f=await fixture(),old=await f.create(1),oldChoose=f.choose(),first=f.contexts[0];
 f.element('stop').onclick();const fresh=await f.create(2),freshChoose=f.choose(),second=f.contexts[1];
 second.load.resolve();await freshChoose;await f.verified();
 first.load.resolve();await oldChoose;old.onclose();old.onerror();await old.onmessage({data:JSON.stringify({type:'stopped',reason:'old room'})});
 assert.ok(!fresh.closed);assert.equal(f.element('ready').disabled,false);assert.equal(f.element('screen').children.length,1);assert.ok(first.closed);assert.ok(!second.closed);
});
test('old Ready resume and stale audio failures cannot Ready or stop the replacement room',async()=>{
 const f=await fixture();await f.create(1);const choosing=f.choose(),oldAudio=f.contexts[0];oldAudio.load.resolve();await choosing;await f.verified();
 oldAudio.paused=defer();const oldReady=f.element('ready').onclick();f.element('stop').onclick();
 const fresh=await f.create(2),newChoose=f.choose(),newAudio=f.contexts[1];newAudio.load.resolve();await newChoose;await f.verified();
 oldAudio.paused.resolve();await oldReady;assert.ok(!fresh.sent.some(m=>m.type==='ready'));assert.ok(!fresh.closed);assert.equal(f.element('ready').disabled,false);
 // A worklet error from a discarded selection has no authority over this room.
 f.element('stop').onclick();await f.create(3);const stale=f.choose(),audio=f.contexts[2];f.element('stop').onclick();const last=await f.create(4);
 audio.load.reject(Error('old worklet failed'));await stale;assert.ok(!last.closed);
});

test('Stop synchronously closes the runtime before removing its iframe',async()=>{
 const f=await fixture();await f.create(1);const choosing=f.choose(),audio=f.contexts[0];audio.load.resolve();await choosing;
 const frame=f.element('screen').children.at(-1);f.element('stop').onclick();
 assert.deepEqual(frame.steps,['opensmash-runtime-close','remove']);
});
