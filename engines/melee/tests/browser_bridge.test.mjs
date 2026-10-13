import test from 'node:test';
import assert from 'node:assert/strict';
import {installConfirmedInput, messagePortChannel} from '../runtime/web/netplay/browser-bridge.mjs';
import {neutralPad} from '../runtime/web/netplay/confirmed-input.mjs';
const identity = {engine:'test-engine',disc:'test-disc',rules:'test-rules',costumes:'stock',seed:'17'};
const module = () => ({ENV:{},_opensmash_confirmed_input_version:()=>1});

test('runtime capability, replay ownership and repeated installation fail before start', () => {
  assert.throws(() => installConfirmedInput({ENV:{}}, {}), /boundary/);
  const runtime = module(); runtime.ENV.MELEE_NET_REPLAY = 'file';
  assert.throws(() => installConfirmedInput(runtime, {}), /ownership/);
});

test('bridge owns actual tick acquisition and prior-consumed-input comparison in fresh instances', async () => {
  const ports = new MessageChannel(), modules = [module(),module()], calls = [0,0], rows = [[],[]];
  const peers = modules.map((runtime,player)=>installConfirmedInput(runtime,
    {channel:messagePortChannel(player?ports.port2:ports.port1),session:'fresh',player,identity},
    {now:()=>0,acquireOwnedPad:(tick,physical)=>{calls[player]++;assert.deepEqual(physical,neutralPad());const p=neutralPad();p[0]=256<<player;p[1]=player?-25:19;return p;},onTick:row=>rows[player].push(row)}));
  peers.forEach(p=>p.start());
  try {
    for(let tick=0;tick<64;tick++){
      const state=Array.from({length:50},(_,i)=>tick+i);
      const pads=await Promise.all(modules.map(m=>m.onConfirmedInput(tick,neutralPad(),state)));
      assert.deepEqual(pads[0],pads[1]);
      await Promise.all(modules.map((m,i)=>m.onConfirmedTick(tick,pads[i].flat(),state)));
    }
    assert.deepEqual(calls,[64,64]);assert.deepEqual(rows[0],rows[1]);
    // A valid input intervention at the consumed boundary must fail before completing the final tick,
    // even when the selected-state fields themselves are identical (e.g. a pause).
    const state=Array(50).fill(0),pads=await Promise.all(modules.map(m=>m.onConfirmedInput(64,neutralPad(),state)));
    pads[1][0][0]^=256;
    const result=await Promise.allSettled(modules.map((m,i)=>m.onConfirmedTick(64,pads[i].flat(),state)));
    assert.ok(result.every(r=>r.status==='rejected'));
  }finally{peers.forEach(p=>p.stop());ports.port1.close();ports.port2.close();}
});

test('unequal graphics readiness releases preparation on the same confirmed tick',async()=>{
 const ports=new MessageChannel(),modules=[module(),module()],released=[[],[]];
 const peers=modules.map((m,player)=>{
  m._opensmash_finish_intro_preparation=()=>released[player].push('intro');
  m._opensmash_finish_preparation=()=>released[player].push('match');
  return installConfirmedInput(m,{channel:messagePortChannel(player?ports.port2:ports.port1),session:'prep',player,identity});
 });peers.forEach(p=>p.start());
 try{for(let tick=0;tick<3;tick++){
  modules[0].confirmedPreparationReady=[true,tick>=1];modules[1].confirmedPreparationReady=[tick>=1,tick>=2];
  const state=Array(50).fill(0),pads=await Promise.all(modules.map(m=>m.onConfirmedInput(tick,neutralPad(),state)));
  assert.deepEqual(released[0],released[1]);
  if(tick===0)assert.deepEqual(released[0],[]);
  if(tick===1)assert.deepEqual(released[0],['intro']);
  if(tick===2)assert.deepEqual(released[0],['intro','intro','match']);
  await Promise.all(modules.map((m,i)=>m.onConfirmedTick(tick,pads[i].flat(),state)));
 }}finally{peers.forEach(p=>p.stop());ports.port1.close();ports.port2.close();}
});


test('tick timings distinguish a delayed owned acquisition from simulation without changing pads or divergence checks',async()=>{
 const ports=new MessageChannel(),modules=[module(),module()],rows=[[],[]];
 const peers=modules.map((m,player)=>installConfirmedInput(m,{channel:messagePortChannel(player?ports.port2:ports.port1),session:'timed',player,identity},{onTick:row=>rows[player].push(row),acquireOwnedPad:async(tick,pad)=>{if(player===1)await new Promise(resolve=>setTimeout(resolve,35));return pad;}}));
 peers.forEach(p=>p.start());
 try{
  const state=Array(50).fill(0),pads=await Promise.all(modules.map(m=>m.onConfirmedInput(0,neutralPad(),state)));
  assert.deepEqual(pads[0],pads[1]);await Promise.all(modules.map((m,i)=>m.onConfirmedTick(0,pads[i].flat(),state)));
  for(const row of rows.flat()){assert.ok(row.timing.inputWaitMs>=25);assert.ok(row.timing.totalMs>=row.timing.inputWaitMs);assert.ok(row.timing.simulationMs>=0);}
 }finally{peers.forEach(p=>p.stop());ports.port1.close();ports.port2.close();}
});
