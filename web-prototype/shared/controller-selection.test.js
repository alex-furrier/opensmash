import test from 'node:test';import assert from 'node:assert/strict';
import {reconcileControllers,lockControllerChoice,unlockControllerChoice,controllerLaunchChoices,isPrimaryController,invalidateControllerChoices,controllerOwner,setControllerChoiceTarget,baseSelectionOwner} from './controller-selection.js';
const pad=(index,id='Pad '+index)=>({index,id,connected:true});
test('each controller locks only its own fighter; locked choice needs its own unlock',()=>{
 let s=reconcileControllers(undefined,[pad(0),pad(1)]);const [p1,p2]=s.devices;
 s=lockControllerChoice(s,p2,{slug:'two'});assert.equal(controllerLaunchChoices(s),null);assert.equal(s.devices[0].choice,null);
 s=lockControllerChoice(s,p1,{slug:'one'});assert.deepEqual(controllerLaunchChoices(s).map(d=>d.slug),['one','two']);
 s=lockControllerChoice(s,p2,{slug:'wrong'});assert.equal(s.devices[1].choice.slug,'two');
 s=unlockControllerChoice(s,p2);assert.equal(s.devices[0].locked,true);assert.equal(controllerLaunchChoices(s),null);
 s=lockControllerChoice(s,p2,{slug:'new'});assert.deepEqual(controllerLaunchChoices(s).map(d=>d.slug),['one','new']);
});
test('disconnect removes that player, preserves the remaining choice, and restores primary ownership',()=>{
 let s=reconcileControllers(undefined,[pad(0),pad(1)]);const [a,b]=s.devices;s=lockControllerChoice(s,a,{slug:'a'});s=lockControllerChoice(s,b,{slug:'b'});
 s=reconcileControllers(s,[pad(1)]);assert.equal(s.devices.length,1);assert.equal(s.devices[0].choice.slug,'b');assert.equal(s.devices[0].port,0);assert.equal(isPrimaryController(s,b),true);
});
test('reconnection is a new owner and stale callbacks cannot lock it; no ghost choice survives',()=>{
 let s=reconcileControllers(undefined,[pad(0)]);const old=s.devices[0];s=lockControllerChoice(s,old,{slug:'old'});
 s=reconcileControllers(s,[]);s=reconcileControllers(s,[pad(0)]);assert.equal(s.devices[0].choice,null);assert.notEqual(s.devices[0].generation,old.generation);
 s=lockControllerChoice(s,old,{slug:'stale'});assert.equal(s.devices[0].choice,null);assert.equal(controllerLaunchChoices(s),null);
});
test('extra pads are counted but cannot create unsupported or duplicate human players',()=>{
 let s=reconcileControllers(undefined,[pad(0),pad(1),pad(2),pad(3),pad(4),pad(4)]);assert.equal(s.connectedCount,5);assert.equal(s.devices.length,4);
 for(const owner of s.devices)s=lockControllerChoice(s,owner,{slug:owner.id});
 assert.equal(controllerLaunchChoices(s),null);
 s=reconcileControllers(s,[pad(0),pad(1)]);assert.equal(controllerLaunchChoices(s).length,2);
});
test('empty and disconnected controller lists cannot launch ghost players',()=>{
 let s=reconcileControllers(undefined,[]);assert.equal(controllerLaunchChoices(s),null);
 s=reconcileControllers(s,[pad(0)]);s=lockControllerChoice(s,s.devices[0],{slug:'one'});
 s=reconcileControllers(s,[{...pad(0),connected:false},null]);assert.equal(controllerLaunchChoices(s),null);
});
test('polling order changes retain ownership, choices and primary controller',()=>{
 let s=reconcileControllers(undefined,[pad(7),pad(2)]);const [one,two]=s.devices;
 s=lockControllerChoice(s,one,{slug:'one'});s=lockControllerChoice(s,two,{slug:'two'});
 s=reconcileControllers(s,[pad(2),pad(7)]);
 assert.deepEqual(s.devices.map(d=>d.generation),[one.generation,two.generation]);
 assert.deepEqual(controllerLaunchChoices(s).map(d=>[d.slug,d.port,d.index]),[['one',0,7],['two',1,2]]);
 assert.equal(isPrimaryController(s,two),false);
});

test('roster invalidation clears every lock and rejects callbacks from the previous roster',()=>{
 let s=reconcileControllers(undefined,[pad(0),pad(1)]);const old=s.devices[0];
 s=lockControllerChoice(s,old,{slug:'old-roster'});s=invalidateControllerChoices(s);
 assert.equal(controllerLaunchChoices(s),null);assert.equal(s.devices[0].choice,null);
 assert.deepEqual(s.devices.map(d=>d.index),[0,1]);
 s=lockControllerChoice(s,old,{slug:'stale'});assert.equal(s.devices[0].choice,null);
});

test('duplicate fighters retain per-port bases and stale picker owners cannot edit a promoted port',()=>{
 let s=reconcileControllers(undefined,[pad(0),pad(1)]);const [one,two]=s.devices;
 s=lockControllerChoice(s,one,{slug:'same',target:'mario'});s=lockControllerChoice(s,two,{slug:'same',target:'mario'});
 s=setControllerChoiceTarget(s,two,'same','fox');assert.deepEqual(controllerLaunchChoices(s).map(d=>d.target),['mario','fox']);
 s=reconcileControllers(s,[pad(1)]);assert.equal(controllerOwner(s,two),undefined);
 assert.equal(setControllerChoiceTarget(s,two,'same','luigi'),s,'old port identity cannot edit promoted controller');
 const current=s.devices[0];s=setControllerChoiceTarget(s,current,'same','luigi');assert.equal(s.devices[0].choice.target,'luigi');
});

test('base picker keeps unambiguous mouse ownership and explicit duplicate controller ownership',()=>{
 let s=reconcileControllers(undefined,[pad(0),pad(1)]);const [one,two]=s.devices;
 s=lockControllerChoice(s,one,{slug:'one'});s=lockControllerChoice(s,two,{slug:'two'});
 assert.equal(baseSelectionOwner(s,'two',null).port,1);
 s=unlockControllerChoice(s,two);s=lockControllerChoice(s,two,{slug:'one'});
 assert.equal(baseSelectionOwner(s,'one',two).port,1);assert.equal(baseSelectionOwner(s,'one',null).port,0);
 s=invalidateControllerChoices(s);assert.equal(baseSelectionOwner(s,'one',two),undefined,'stale actor never falls through to another owner');
});

for(const count of [2,3,4])test(count+' identical controllers retain independent locked choices',()=>{let s=reconcileControllers(undefined,Array.from({length:count},(_,index)=>({...pad(index),id:'same adapter'})));for(const owner of s.devices)s=lockControllerChoice(s,owner,{slug:'same fighter',target:['mario','fox','luigi','falco'][owner.port]});const picks=controllerLaunchChoices(s);assert.equal(picks.length,count);assert.equal(new Set(picks.map(p=>p.index)).size,count);for(const owner of s.devices){const next=unlockControllerChoice(s,owner);assert.equal(next.devices.filter(d=>!d.locked).length,1);}});
