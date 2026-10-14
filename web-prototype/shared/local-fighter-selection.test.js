import test from 'node:test';import assert from 'node:assert/strict';
import {reconcileSelection,selectFighter,readyFighters,p1MenuController} from './local-fighter-selection.js';
import {pointerStep} from '../visual/menu-pointer.js';
test('two owned selections are required and replacements preserve the other player',()=>{
 let s=reconcileSelection(null,['1P','2P'],'a');
 s=selectFighter(s,{slug:'one'});assert.equal(s.active,'2P');assert.equal(readyFighters(s),null);
 s=selectFighter(s,{slug:'two'});assert.deepEqual(readyFighters(s).map(p=>p.slug),['one','two']);
 s=selectFighter({...s,active:'1P'},{slug:'three'});assert.deepEqual(readyFighters(s).map(p=>p.slug),['three','two']);
 assert.deepEqual(reconcileSelection(s,['1P','2P'],'a').picks,s.picks,'return retains choices');
 assert.deepEqual(reconcileSelection(s,['1P','2P'],'changed').picks,{},'different port/context invalidates choices');
});
test('duplicate fighters belong to independent slots and never toggle another player off',()=>{
 let s=reconcileSelection(null,['1P','2P'],'a');s=selectFighter(s,{slug:'same'});s=selectFighter(s,{slug:'same'});
 assert.equal(readyFighters(s).length,2);assert.deepEqual(readyFighters(s).map(p=>p.slot),['1P','2P']);
});
test('pointer deadzone, edge buttons, bounds, scroll and blocked match input',()=>{
 const pad={connected:true,axes:[.1,1,0,.5],buttons:[{pressed:true},{pressed:false}]};const s={x:99,y:99,down:false,back:false};
 const next=pointerStep(s,pad,.1,100,100);assert.equal(next.x,98);assert.equal(next.y,98);assert.equal(next.click,true);assert.ok(next.scroll>0);
 assert.equal(pointerStep(next,pad,.1,100,100).click,false);
 const blocked=pointerStep(s,pad,.1,100,100,false);assert.equal(blocked.click,false);assert.equal(blocked.scroll,0);
 assert.equal(pointerStep(s,{...pad,connected:false},.1,100,100).click,false);
});

test('only physical P1 can own the website cursor',()=>{
 assert.equal(p1MenuController([{kind:'keyboard'},{kind:'gamepad',index:0}]),undefined);
 assert.equal(p1MenuController([{kind:'none'},{kind:'gamepad',index:1}]),undefined);
 assert.equal(p1MenuController([{kind:'gamepad',index:2},{kind:'gamepad',index:0}]),2);
});
