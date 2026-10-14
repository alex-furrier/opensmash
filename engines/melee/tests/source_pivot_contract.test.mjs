import test from 'node:test';import assert from 'node:assert/strict';
import {buildStandardCostume} from '../runtime/fitting/costume.mjs';
import {fitCharacter} from '../runtime/fitting/native-fit.mjs';
test('source-pivot standard export is rejected at the serializer boundary',()=>{
 assert.throws(()=>buildStandardCostume(null,{fitStrategy:'source-pivot'},null,{},null),/standard DAT export is unsupported/);
 assert.throws(()=>buildStandardCostume(null,{},null,{sourcePivot:{}},null),/standard DAT export is unsupported/);
});
test('unreviewed donor or source layout is rejected before native fitting',()=>{
 const input={n:1,sourceJoints:39,mode:'source-pivot',target:'mario',sourcePivot:{target:'mario'}};
 assert.throws(()=>fitCharacter(null,input),/reviewed 39-joint four-donor source/);
 assert.throws(()=>fitCharacter(null,{...input,sourceJoints:38,target:'pikachu',sourcePivot:{target:'pikachu'}}),/reviewed 39-joint four-donor source/);
});
