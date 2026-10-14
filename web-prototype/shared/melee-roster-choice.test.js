import test from 'node:test';import assert from 'node:assert/strict';
import {rosterTabs,rosterScopes,restoreRosterUi,meleeGridRoster,meleeSelectionAvailable,chosenBase,rememberBase,supportedBases,selectionPort} from './melee-roster-choice.js';
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
 const school={slug:'school-alex',name:'Alex Furrier'},family={slug:'family-alex',name:'Alex (Family)',rosterCategory:'family'};
 const active=[school,family],catalog=[{slug:'public-source'},school,family];
 assert.deepEqual(meleeGridRoster(catalog,active,active,'high-school').map(row=>row.slug),['school-alex']);
 assert.deepEqual(meleeGridRoster(catalog,active,active,'family').map(row=>row.slug),['family-alex']);
 const all=meleeGridRoster(catalog,active,active,'all');
 assert.deepEqual(all.map(row=>row.slug),['school-alex','family-alex','public-source']);
 assert.equal(all.find(row=>row.slug==='public-source').meleeAvailable,false);
 assert.deepEqual(meleeGridRoster(catalog,[],active,'family'),[],'catalog membership cannot populate a named private roster');
 assert.deepEqual(meleeGridRoster(catalog,active,[],'family').map(row=>row.meleeAvailable),[false]);
});

test('ordinary installed sources receive the private helper portrait route without replacing imported derivatives',()=>{
 const rows=meleeGridRoster([{slug:'regular'}],[{slug:'custom',imported:true,portraitTile:'/melee/private-tile'}],[{slug:'regular'},{slug:'custom'}],'all');
 assert.equal(rows.find(r=>r.slug==='regular').portraitTile,'/melee/api/source-portraits/regular.webp');assert.equal(rows.find(r=>r.slug==='custom').portraitTile,'/melee/private-tile');
});

test('existing website artwork survives unavailable source checks and takes precedence over the private helper',()=>{
 const row={slug:'regular',portraitTile:'/website/tile.webp'};
 assert.equal(meleeGridRoster([row],[],[],'all')[0].portraitTile,row.portraitTile);
 assert.equal(meleeGridRoster([row],[],[row],'all')[0].portraitTile,row.portraitTile);
 assert.equal(meleeGridRoster([{slug:'missing'}],[],[],'all')[0].portraitTile,undefined);
});


test('roster tabs use stable IDs in Friends and Family, High School, All order',()=>{
 assert.deepEqual(rosterTabs,[{id:'family',label:'Friends and Family'},{id:'high-school',label:'High School'},{id:'all',label:'All'}]);
 assert.deepEqual(rosterScopes,['family','high-school','all']);
});

test('new, malformed and reset preferences open Friends and Family',()=>{
 for(const saved of [null,'{','null','[]','{}',JSON.stringify({defaultVersion:2,roster:'removed',choices:[]})]){
  assert.deepEqual(restoreRosterUi(saved),{defaultVersion:2,roster:'family',choices:{}});
 }
});

test('prior tabs migrate once without losing per-port base choices; later tab choices persist',()=>{
 const choices=rememberBase(rememberBase({},row,'1P','fox'),row,'2P','auto');
 for(const roster of ['all','high-school','family']){
  const migrated=restoreRosterUi(JSON.stringify({roster,choices}));
  assert.equal(migrated.roster,'family');assert.deepEqual(migrated.choices,choices);
  assert.equal(chosenBase(row,migrated.choices,'1P'),'fox');
  for(const next of rosterScopes){
   const reopened=restoreRosterUi(JSON.stringify({...migrated,roster:next}));
   assert.equal(reopened.roster,next);assert.deepEqual(reopened.choices,choices);
  }
 }
});


test('private manifest order precedes unspecified rows, keeps ties stable and never mutates source or asset links',()=>{
 const active=[{slug:'legacy',rosterCategory:'family',portraitTile:'/existing/legacy.webp'},
  {slug:'later',rosterCategory:'family',rosterOrder:20},
  {slug:'first',rosterCategory:'family',rosterOrder:0,portraitTile:'/existing/first.webp'},
  {slug:'tie',rosterCategory:'family',rosterOrder:20},
  {slug:'school',rosterOrder:3},{slug:'invalid',rosterCategory:'family',rosterOrder:'1'}];
 const original=structuredClone(active);
 const family=meleeGridRoster([],active,active,'family');
 assert.deepEqual(family.map(row=>row.slug),['first','later','tie','legacy','invalid']);
 assert.equal(family[0].portraitTile,'/existing/first.webp');
 assert.equal(family[3].portraitTile,'/existing/legacy.webp');assert.deepEqual(active,original);
 assert.deepEqual(meleeGridRoster([],active,active,'high-school').map(row=>row.slug),['school']);
 assert.equal(meleeGridRoster([{slug:'catalog'}],active,active,'all').at(-1).slug,'catalog');
 assert.deepEqual(meleeGridRoster([],active.map(({rosterOrder,...row})=>row),active,'family').map(row=>row.slug),['legacy','later','first','tie','invalid']);
});
