import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
// Uses the existing Melee web TypeScript development dependency; no native game in this fixture.
const require=createRequire(new URL('../web/package.json',import.meta.url));
const ts=require(process.env.MELEE_TYPESCRIPT_MODULE||'typescript');
async function component(path,globals){
 const effects=[],slots=[];let cursor=0,pending=[];
 const useRef=value=>{const i=cursor++;return slots[i]??=( {current:value});};
 const useState=value=>{const i=cursor++;if(!(i in slots))slots[i]=typeof value==='function'?value():value;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];};
 const useEffect=(fn,deps)=>{const i=cursor++,old=effects[i];if(!old||!deps||deps.some((v,j)=>!Object.is(v,old.deps?.[j])))pending.push(()=>{old?.cleanup?.();effects[i]={deps,cleanup:fn()};});};
 const source=(await readFile(new URL(path,import.meta.url),'utf8')).replace(/^import .*\n/gm,'');
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
 const context=vm.createContext({exports:{},console,AbortController,URLSearchParams,queueMicrotask,HTMLElement:class{},location:{search:'',hash:'',origin:'http://local'},React:{createElement:(type,props,...children)=>({type,props:props||{},children})},useRef,useState,useEffect,useMemo:fn=>fn(),...globals});
 new vm.Script(code).runInContext(context);
 return {render(props){cursor=0;pending=[];const tree=context.exports.default(props);const attach=node=>{if(!node||typeof node!=='object')return;if(node.type==='canvas'&&node.props.ref)node.props.ref.current={transferControlToOffscreen(){},focus(){}};for(const child of node.children||[])if(Array.isArray(child))child.forEach(attach);else attach(child);};attach(tree);for(const fn of pending)fn();return tree;},unmount(){for(const effect of effects)effect?.cleanup?.();}};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function game(mode=0){
 const messages=[],listeners=new Map(),released=[],closes=[],raf=new Map();let seq=0,audioDisconnected=0,fullscreenExits=0;
 const worker={postMessage:m=>messages.push(m),terminate(){}};
 const globals={
  setAudioEnabled(){},neutralTouchPad:()=>({buttons:0}),loadBindings:()=>({keyboard:{right:'KeyD'}}),keyLabel:x=>x,
  window:{addEventListener:(k,fn)=>listeners.set(k,fn),removeEventListener:k=>listeners.delete(k)},document:{fullscreenElement:{},exitFullscreen:async()=>{fullscreenExits++;}},
  setInterval:()=>1,clearInterval(){},requestAnimationFrame:fn=>{raf.set(++seq,fn);return seq;},cancelAnimationFrame:id=>raf.delete(id),
  crossOriginIsolated:true,claimMelee:()=>({worker,ready:Promise.resolve(),readyAt:0,audio:{}}),releaseMelee:w=>released.push(w),MeleeFrameWorker:class{},
  createLaunchDiagnostics:()=>({arm(){},snapshot:()=>({}),observe(){},expired(){},pause(){}}),gameInputBlocked:()=>false,rawGamepads:()=>[],connectAudio:async()=>({disconnect(){audioDisconnected++;}}),stopAnnouncer(){},resolveRenderWidth:()=>640,plan:()=>({costumes:[],ports:[{device:'keyboard'},{device:'off'},{device:'off'},{device:'off'}]}),
  fighterLabel:()=> 'Fighter',names:{mario:'Mario'},schema:{modes:[{id:mode,label:'Mode'}]},MeleeTouchControls(){},
 };
 const mounted=await component('../web/app/Game.tsx',globals);
 mounted.render({fighter:{target:'mario'},settings:{mode,ports:[{target:'auto'}]},roster:[],onClose:()=>closes.push('close')});await flush();
 const emit=data=>worker.onmessage({data});
 return {mounted,emit,messages,listeners,released,closes,raf,get audioDisconnected(){return audioDisconnected;},get fullscreenExits(){return fullscreenExits;}};
}
test('direct match returns once only after playable native results, then releases its owned resources',async()=>{
 const g=await game();g.emit({type:'progress',sceneKind:5});assert.equal(g.closes.length,0,'stale/prelaunch results cannot return');
 g.emit({type:'playable'});for(const sceneKind of [2,3,8,9])g.emit({type:'progress',sceneKind});assert.equal(g.closes.length,0,'combat/sudden death/native selection are not results');
 g.listeners.get('keydown')({code:'KeyD',preventDefault(){}});g.emit({type:'progress',sceneKind:5});g.emit({type:'progress',sceneKind:5});g.emit({type:'playable'});
 assert.equal(g.closes.length,1);assert.equal(g.fullscreenExits,1);assert.equal(g.raf.size,0);assert.ok(g.messages.slice(-4).every(m=>m.values[1]===0),'held input is neutral before return');
 g.mounted.unmount();assert.equal(g.released.length,1);assert.equal(g.audioDisconnected,1);assert.equal(g.listeners.size,0);
 g.emit({type:'progress',sceneKind:5});assert.equal(g.closes.length,1,'discarded worker has no close authority');
 const next=await game();next.emit({type:'progress',sceneKind:5});assert.equal(next.closes.length,0);next.emit({type:'playable'});next.emit({type:'progress',sceneKind:5});assert.equal(next.closes.length,1);next.mounted.unmount();
});
test('native menu and adventure launches preserve their own results navigation',async()=>{
 for(const mode of [1,2,3,4,5,6]){const g=await game(mode);g.emit({type:'playable'});g.emit({type:'progress',sceneKind:5});assert.equal(g.closes.length,0);g.mounted.unmount();}
});
async function friend(settleConnection=true){
 const rooms=[],closed=[];let resolve;
 const globals={Game(){},applyLauncherSelection:s=>s,localFriendDevice:()=> 'keyboard',friendMatchSettings:s=>s,plan:()=>({mode:0,ports:[{character:'test'},{character:'test'}]}),connectFriendRoom:(request,changed)=>{const room={request,assignment:new Promise(r=>resolve=r),closed:false,stop(reason){if(room.closed)return;room.closed=true;changed({type:'stopped',reason});},join(){resolve({player:0,match:{mode:0,ports:[{character:'test'},{character:'test'}]}});}};rooms.push(room);return room;}};
 const mounted=await component('../launcher/FriendMatch.tsx',globals),props={fighter:{slug:'test'},settings:{ports:[]},roster:[],onClose:()=>closed.push('close'),soundOn:false,automatic:true};
 const render=()=>mounted.render(props);render();if(settleConnection)render();return{mounted,rooms,closed,render};
}
test('assigned room termination returns to roster; setup rejection remains visible',async()=>{
 for(const assigned of [false,true]){const f=await friend();if(assigned){f.rooms[0].join();await flush();f.render();}f.rooms[0].stop('Peer disconnected');f.render();assert.equal(f.closed.length,assigned?1:0);f.mounted.unmount();assert.equal(f.closed.length,assigned?1:0);}
});
test('explicit rematch creates a fresh room without leaving, and unmount cannot close a replacement experience',async()=>{
 const f=await friend();f.rooms[0].join();await flush();const game=f.render();game.props.onRematch();f.render();f.render();assert.equal(f.closed.length,0);assert.equal(f.rooms.length,2);assert.ok(f.rooms[0].closed);assert.equal(f.rooms[1].request.type,'create');
 f.rooms[1].join();await flush();f.render();f.mounted.unmount();assert.ok(f.rooms[1].closed);assert.equal(f.closed.length,0);
});

test('a fast assignment before the connection effect commits still returns on Stop',async()=>{
 const f=await friend(false);f.rooms[0].join();await flush();f.render();f.rooms[0].stop();assert.equal(f.closed.length,1);f.mounted.unmount();
});
