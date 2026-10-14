import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {resolvedLaunchRoster} from '../launcher/launch-roster.mjs';import {planLaunch} from '../runtime/web/launch-options.mjs';
import {applyLauncherSelection} from '../launcher/launch-plan.mjs';
const schema=JSON.parse(readFileSync(new URL('../runtime/launch-options.json',import.meta.url)));
test('fresh browser default CPU picks use active installed sources, not absent catalog models or superseded imports',()=>{
 const catalog=Array.from({length:1000},(_,i)=>({slug:'absent-'+i,name:'Catalog '+i,target:'mario'}));
 const imports=[{slug:'old',target:'mario'},...['one','two','three'].map(slug=>({slug,target:'mario',imported:true}))];
 const roster=resolvedLaunchRoster(catalog,imports,imports.slice(1),true);
 for(const random of [0,.25,.9,.999]){
  const launch=planLaunch(schema,structuredClone(schema.defaults),imports[1],roster,()=>random);
  assert.equal(launch.ports[0].character,'one');assert.match(launch.ports[1].character,/^vanilla:/);
  assert.deepEqual(new Set(launch.costumes.map(c=>c.character)),new Set(['one','two','three']));
 }
 assert.ok(roster.find(row=>row.slug==='old'),'frozen prior matches retain explicit source lookup');
});
test('acquired choices attach to their physical ports and unsupported explicit/random pairs never prepare',()=>{
 const active=[{slug:'a',name:'A',target:'luigi',supportedTargets:['luigi','fox']},{slug:'b',name:'B',target:'mario',supportedTargets:['mario']}];
 const settings={...structuredClone(schema.defaults),ports:[{device:'cpu',character:'random',target:'auto'},{device:'keyboard',character:'selected',target:'auto'},{device:'gamepad0',character:'selected',target:'auto'},{device:'off',character:'vanilla:2',target:'auto'}]};
 const next=applyLauncherSelection(settings,{type:'character',character:active[0],picks:[active[1]],targets:['fox','mario'],portPlan:[{kind:'cpu'},{kind:'keyboard'},{kind:'gamepad',index:0},{kind:'none'}]});
 assert.deepEqual(next.ports.map(p=>p.target),['auto','fox','mario','auto']);
 const planned=planLaunch(schema,next,active[0],active,()=>0);assert.equal(planned.ports[1].target,'fox');assert.equal(planned.ports[2].target,'mario');
 assert.throws(()=>planLaunch(schema,{...next,ports:next.ports.map((p,i)=>i===2?{...p,target:'fox'}:p)},active[0],active),/not validated/);
 const random=planLaunch(schema,{...next,ports:next.ports.map((p,i)=>i===0?{...p,target:'fox'}:p)},active[0],active,()=>.99);assert.equal(random.ports[0].character,'a');
});
test('an empty installed browser pool falls back to vanilla CPU fighters; native catalog behavior is preserved',()=>{
 const catalog=[{slug:'chosen',target:'mario'},{slug:'other',target:'fox'}];
 const browser=planLaunch(schema,structuredClone(schema.defaults),catalog[0],resolvedLaunchRoster(catalog,[],[],true),()=>0);
 assert.ok(browser.ports.slice(1).every(port=>port.character.startsWith('vanilla:')));
 const native=resolvedLaunchRoster(catalog,[],[],false);assert.deepEqual(native,catalog);
 assert.equal(planLaunch(schema,structuredClone(schema.defaults),catalog[0],native,()=>0).ports[2].character,'other');
});
test('active presentation metadata overrides stale lookup rows without replacing source identity',()=>{
 const source={slug:'stable',name:'Source Person',target:'mario',imported:true};
 const rows=resolvedLaunchRoster([], [source], [{...source,displayName:'Stage Name'}],true);
 assert.equal(rows[0].name,'Source Person');assert.equal(rows[0].displayName,'Stage Name');assert.equal(rows[0].slug,'stable');
});

test('fixed active assignments with auto use their own bases and allocate distinct same-base costume slots; explicit override still applies',()=>{
 const active=[{slug:'a',target:'luigi',imported:true},{slug:'b',target:'fox',imported:true},{slug:'c',target:'captain-falcon',imported:true},{slug:'d',target:'luigi',imported:true}];
 const settings={...structuredClone(schema.defaults),ports:active.map((row,i)=>({device:i?'cpu':'keyboard',character:row.slug,target:'auto'}))};
 const launch=planLaunch(schema,settings,active[0],resolvedLaunchRoster([],active,active,true));assert.deepEqual(launch.ports.map(p=>p.fighter),[7,2,0,7]);assert.notEqual(launch.ports[0].color,launch.ports[3].color);assert.deepEqual(launch.costumes.map(c=>c.target),['luigi','fox','captain-falcon','luigi']);
 const overridden=planLaunch(schema,{...settings,ports:settings.ports.map(p=>({...p,target:'mario'}))},active[0],active);assert.ok(overridden.ports.every(p=>p.fighter===8));
});
