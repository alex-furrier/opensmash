import test from 'node:test';import assert from 'node:assert/strict';
import {assertOwnedPadPhase} from '../tools/proof/owned-pad-phase.mjs';
const pad=(port,x)=>({type:'pad',values:[port,0,(0x80808000|x)>>>0,0,0]});
test('owned acquisition proof accepts directed input and requires the other port neutral',()=>{assert.equal(assertOwnedPadPhase([pad(0,200),pad(1,128)],0,1),2);});
test('swapped, mirrored, opposite and missing port traces fail ownership proof',()=>{
 for(const rows of [[pad(0,128),pad(1,200)],[pad(0,200),pad(1,200)],[pad(0,40),pad(1,128)],[pad(0,200)]])assert.throws(()=>assertOwnedPadPhase(rows,0,1));
});
