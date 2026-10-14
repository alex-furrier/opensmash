import test from 'node:test';import assert from 'node:assert/strict';
import {meleeGridRoster,meleeSelectionAvailable,chosenBase,rememberBase,supportedBases,selectionPort} from './melee-roster-choice.js';
import catalog from '../../engines/melee/web/public/catalog.json' with {type:'json'};
import {mergeCharactersBySlug} from './character-roster.js';
const row={slug:'source-a',target:'luigi',defaultTarget:'luigi',supportedTargets:['luigi','fox']};
test('All retains the complete source catalog even when the website has only a small installed public subset',()=>{
 const installed=catalog.slice(0,2).map(row=>({...row,portrait:'/existing-art'}));
 const all=meleeGridRoster(mergeCharactersBySlug(catalog,installed),[],installed,'all');
 assert.equal(all.length,catalog.length);assert.equal(all.filter(row=>row.meleeAvailable).length,2);assert.equal(all[0].portrait,'/existing-art');assert.ok(all.some(row=>row.meleeAvailability==='Source unavailable'));
});
test('prepared demo reveal retains its catalog click path; ordinary play requires actual installed availability',()=>{
 assert.equal(meleeSelectionAvailable([{slug:'catalog'}],{demo:true}),true);
 assert.equal(meleeSelectionAvailable([{slug:'catalog'}]),false);
 assert.equal(meleeSelectionAvailable([{meleeAvailable:true},{meleeAvailable:false}]),false);
 assert.equal(meleeSelectionAvailable([{meleeAvailable:true}]),true);
});
test('named roster filters the existing grid and catalog membership never grants source availability',()=>{
 const catalog=[{slug:'absent',name:'Catalog Fighter'},row],active=[{...row,imported:true}];
 const all=meleeGridRoster(catalog,active,[row],'all');assert.equal(all.length,2);assert.equal(all.find(r=>r.slug==='absent').meleeAvailable,false);assert.equal(all[0].meleeAvailable,true);
 assert.deepEqual(meleeGridRoster(catalog,active,[row],'high-school').map(r=>r.slug),['source-a']);
 assert.equal(meleeGridRoster(catalog,[],[],'all',true)[0].meleeAvailability,'Checking source…');
});
test('base preferences are per physical port and source identity, preserve other choices and ignore revoked pairs',()=>{
 let choices=rememberBase({},row,'1P','fox');choices=rememberBase(choices,row,'CPU2','auto');
 assert.equal(chosenBase(row,choices,'1P'),'fox');assert.equal(chosenBase(row,choices,'CPU2'),'auto');assert.equal(selectionPort('CPU4'),3);
 assert.equal(chosenBase({...row,slug:'other'},choices,'1P'),'auto');
 assert.equal(chosenBase({...row,supportedTargets:['luigi']},choices,'1P'),'auto');
 assert.deepEqual(chosenBase(row,JSON.parse(JSON.stringify(choices)),'1P'),'fox');
 assert.throws(()=>rememberBase(choices,row,'2P','marth'),/validated/);
 assert.deepEqual(supportedBases({target:'mario'}),['mario']);
 assert.equal(chosenBase(row,{},'2P','fox'),'fox');assert.equal(chosenBase(row,{},'2P','marth'),'auto');
 assert.equal(chosenBase({slug:'catalog',target:'mario'},{},'1P','fox'),'fox','catalog without pair metadata retains valid explicit overrides');
});

test('Family isolates accepted private entries while High School keeps legacy rows and All keeps the catalog',()=>{
 const school={slug:'school-person',name:'School Person'},family={slug:'family-person',name:'Family Person',rosterCategory:'family'};
 const active=[school,family],catalog=[{slug:'public-source'},school,family];
 assert.deepEqual(meleeGridRoster(catalog,active,active,'high-school').map(row=>row.slug),['school-person']);
 assert.deepEqual(meleeGridRoster(catalog,active,active,'family').map(row=>row.slug),['family-person']);
 const all=meleeGridRoster(catalog,active,active,'all');
 assert.deepEqual(all.map(row=>row.slug),['school-person','family-person','public-source']);
 assert.equal(all.find(row=>row.slug==='public-source').meleeAvailable,false);
 assert.deepEqual(meleeGridRoster(catalog,[],active,'family'),[],'catalog membership cannot populate a named private roster');
 assert.deepEqual(meleeGridRoster(catalog,active,[],'family').map(row=>row.meleeAvailable),[false]);
});
