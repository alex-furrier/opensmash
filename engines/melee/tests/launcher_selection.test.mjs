import test from 'node:test';
import assert from 'node:assert/strict';
import {applyLauncherSelection,friendMatchSettings} from '../launcher/launch-plan.mjs';
import schema from '../runtime/launch-options.json' with {type:'json'};
import {planLaunch} from '../runtime/web/launch-options.mjs';
const roster=[{slug:'one',target:'fox'},{slug:'two',target:'mario'}];
test('shared assignments preserve CPU and off slots before human ports',()=>{
 const settings=applyLauncherSelection(structuredClone(schema.defaults),{character:roster[0],picks:[roster[1]],portPlan:[{kind:'cpu'},{kind:'gamepad',index:2},{kind:'none'},{kind:'keyboard'}]});
 const plan=planLaunch(schema,settings,roster[0],roster,()=>0);
 assert.deepEqual(plan.ports.map(p=>p.device),['cpu','gamepad2','off','keyboard']);
 assert.equal(plan.ports[1].character,'one');assert.equal(plan.ports[3].character,'two');
 assert.equal(plan.ports[2].custom,false);
});
test('engine settings and moveset overrides survive shared device translation',()=>{
 const defaults=structuredClone(schema.defaults);defaults.ports[0].target='marth';
 const settings=applyLauncherSelection(defaults,{character:roster[0],portPlan:[{kind:'keyboard'},null,null,{kind:'none'}]});
 assert.equal(settings.ports[0].target,'marth');assert.equal(settings.stage,defaults.stage);
 assert.notEqual(settings.ports,defaults.ports);
});

test('manual opponents follow human picks even when CPUs occupy earlier ports',()=>{
 const settings=applyLauncherSelection(structuredClone(schema.defaults),{character:roster[0],picks:[roster[1]],selectionMode:'full-roster',portPlan:[{kind:'cpu'},{kind:'keyboard'},{kind:'none'},{kind:'none'}]});
 assert.equal(settings.ports[1].character,'one');assert.equal(settings.ports[0].character,'two');
});
test('full-game and character-select actions retain their meaning in Melee',()=>{
 for(const [type,mode] of [['start',4],['select',2]]){
  const settings=applyLauncherSelection(structuredClone(schema.defaults),{type,portPlan:[{kind:'keyboard'},null,null,null]});
  assert.equal(settings.mode,mode);
 }
});

test('Melee trailer fixes the cast, stage and CPU slots regardless of saved settings',()=>{
 const settings=applyLauncherSelection({...structuredClone(schema.defaults),mode:4},{meleeTrailer:true,character:{slug:'thomasdimson'},picks:[{slug:'mahatmagandhi'},{slug:'eliezeryudkowsky'}]});
 const cast=['thomasdimson','mahatmagandhi','eliezeryudkowsky'].map(slug=>({slug,target:'fox'}));
 const result=planLaunch(schema,settings,cast[0],cast,()=>0);
 assert.equal(settings.mode,0);assert.equal(settings.stage,4);
 assert.deepEqual(settings.ports.map(p=>p.character),[...cast.map(f=>f.slug),'vanilla:9']);
 assert.deepEqual(result.ports.map(p=>p.device),['keyboard','cpu','cpu','cpu']);
 assert.equal(result.ports[3].custom,false);
 assert.deepEqual(settings.ports.map(p=>p.target),['mario','sheik','young-link','auto']);
 assert.equal(new Set(result.ports.map(p=>p.fighter)).size,4);
});

test('shared-link joining translates unified devices without choosing unrelated fighters',()=>{
 const before=structuredClone(schema.defaults);before.minutes=0;
 const settings=applyLauncherSelection(before,{type:'friend-room',portPlan:[{kind:'cpu'},{kind:'gamepad',index:2},{kind:'none'},{kind:'none'}]});
 assert.deepEqual(settings.ports.map(p=>p.device),['cpu','gamepad2','off','off']);
 for(const key of ['mode','stage','level','stocks','minutes'])assert.equal(settings[key],before[key]);
});

test('friend slots retain human fighter choices from later local ports and moveset overrides',()=>{
 const before={...structuredClone(schema.defaults),ports:[{device:'off',character:'vanilla:2'},{device:'off',character:'vanilla:2'},{device:'keyboard',character:'one',target:'marth'},{device:'gamepad2',character:'two',target:'mario'}]};
 const normalized=friendMatchSettings(before);assert.deepEqual(normalized.ports.slice(0,2).map(p=>[p.character,p.target,p.device]),[['one','marth','keyboard'],['two','mario','gamepad0']]);
 assert.deepEqual(planLaunch(schema,normalized,roster[0],roster,()=>0).costumes.map(c=>c.character),['one','two']);
 assert.equal(before.ports[2].device,'keyboard');assert.equal(before.ports[3].device,'gamepad2');
});
test('one local human keeps their chosen fighter first and uses the configured CPU opponent',()=>{
 const before={...structuredClone(schema.defaults),ports:[{device:'cpu',character:'two'},{device:'keyboard',character:'one'},{device:'off',character:'vanilla:2'},{device:'off',character:'vanilla:2'}]};
 assert.deepEqual(friendMatchSettings(before).ports.slice(0,2).map(p=>p.character),['one','two']);
 assert.throws(()=>friendMatchSettings({...before,ports:before.ports.map(p=>({...p,device:p.device==='cpu'?'off':p.device}))}),/Choose two active fighters/);
});

test('room drafts freeze both selected fighters before converting any saved solo mode',()=>{
 for(const mode of [1,2,3,4]){
  const saved={...structuredClone(schema.defaults),mode};saved.ports[1].character='vanilla:2';
  const selected=applyLauncherSelection(saved,{type:'character',roomMode:'computer',selectionMode:'full-roster',character:roster[0],picks:[roster[1]],portPlan:[{kind:'keyboard'},{kind:'cpu'},{kind:'none'},{kind:'none'}]});
  const frozen=friendMatchSettings(selected);
  assert.equal(selected.mode,0);assert.deepEqual(frozen.ports.slice(0,2).map(p=>p.character),['one','two']);assert.equal(frozen.stage,saved.stage);
 }
});
