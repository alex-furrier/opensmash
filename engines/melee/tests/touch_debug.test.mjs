import test from 'node:test';
import assert from 'node:assert/strict';
import {neutralTouchPad,createTouchController,stickVector} from '../web/lib/touch-pad.mjs';
import {createDebugInput,validateDebug} from '../runtime/web/netplay/debug-opponent.mjs';
import {installConfirmedInput,messagePortChannel} from '../runtime/web/netplay/browser-bridge.mjs';
const element=()=>({style:{setProperty(){}},setAttribute(){},setPointerCapture(){},getBoundingClientRect:()=>({width:100,height:100,left:0,top:0})});
const event=(id,target,x=50,y=50)=>({pointerId:id,currentTarget:target,clientX:x,clientY:y,preventDefault(){}});
test('shared multi-touch preserves independent sticks, OR-held buttons and neutral cancellation',()=>{
 const pad={current:neutralTouchPad()},c=createTouchController(pad),stick=element(),attack=element();
 c.begin(event(1,stick,86),'main');c.begin(event(2,stick,14),'main');assert.equal(pad.current.x,100);
 c.begin(event(3,attack),'A',256);c.begin(event(4,attack),'A',256);c.release(3);assert.equal(pad.current.buttons,256);
 c.release(2);assert.equal(pad.current.x,100);c.release(1);assert.equal(pad.current.x,0);assert.equal(pad.current.buttons,256);
 c.begin(event(5,element(),50,14),'c');assert.equal(pad.current.cy,100);c.reset();assert.deepEqual(pad.current,neutralTouchPad());assert.deepEqual(stickVector(NaN,0,20),{x:0,y:0});
});
test('scripted pads and seeded waits are reproducible; measured wait is separate from requested wait',async()=>{
 const make=()=>{let clock=0;return createDebugInput({scripted:true,scenario:'jitter',seed:17},{now:()=>clock,wait:async ms=>{clock+=ms+1;}});};
 const a=make(),b=make(),state=Array(50).fill(0);state[1]=2;state[16]=1096810496;state[23]=1082130432;
 for(let tick=0;tick<400;tick++){const x=await a(tick,Array(10).fill(99),state),y=await b(tick,Array(10).fill(0),state);assert.deepEqual(x,y);assert.ok(x.metric.requestedMs<=12);assert.equal(x.metric.measuredMs,x.metric.requestedMs?x.metric.requestedMs+1:0);}
 assert.throws(()=>validateDebug({scripted:true,scenario:'wan',seed:17}));
});
test('actual bridge delays only owned scripted input, peer waits and Stop prevents a late input send',async()=>{
 const ports=new MessageChannel(),identity={engine:'e',disc:'d',rules:'r',costumes:'s',seed:'17'},modules=[0,1].map(()=>({ENV:{},_opensmash_confirmed_input_version:()=>1})),rows=[[],[]];
 const peers=modules.map((m,player)=>installConfirmedInput(m,{channel:messagePortChannel(player?ports.port2:ports.port1),player,identity,session:'debug',...(player?{debug:{scripted:true,scenario:'delay',seed:17}}:{})},{onTick:row=>rows[player].push(row)}));
 assert.throws(()=>installConfirmedInput({ENV:{},_opensmash_confirmed_input_version:()=>1},{player:0,debug:{scripted:true,scenario:'delay',seed:17}}),/player 2/);
 peers.forEach(p=>p.start());const state=Array(50).fill(0);state[1]=2;state[16]=1096810496;state[23]=1082130432;const physical=Array(10).fill(0);physical[0]=512;
 const pads=await Promise.all(modules.map(m=>m.onConfirmedInput(0,physical,state)));assert.deepEqual(pads[0],pads[1]);assert.equal(pads[0][0][0],512);assert.equal(pads[0][1][1],40);
 await Promise.all(modules.map((m,i)=>m.onConfirmedTick(0,pads[i].flat(),state)));assert.ok(rows[1][0].debug.measuredMs>=8);assert.equal(rows[0][0].debug,undefined);
 const pending=modules.map(m=>m.onConfirmedInput(1,physical,state));peers[0].stop('Stop during delay');peers[1].stop('Stop during delay');await Promise.all(pending.map(p=>assert.rejects(p)));ports.port1.close();ports.port2.close();
});
