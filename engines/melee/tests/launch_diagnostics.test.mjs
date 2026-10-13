import test from 'node:test';
import assert from 'node:assert/strict';
import {createLaunchDiagnostics} from '../web/lib/launch-diagnostics.mjs';
test('repeated graphics progress cannot extend the loading deadline; a fresh retry owns a new deadline',()=>{
 let time=0;const options={now:()=>time,timeoutMs:100};const d=createLaunchDiagnostics(options);d.arm('Loading Melee');
 time=90;d.observe({type:'status',message:'Preparing graphics… 97%'});assert.equal(d.expired(),undefined);
 time=100;assert.match(d.expired(),/97%/);assert.equal(d.expired(),undefined);
 const retry=createLaunchDiagnostics(options);retry.arm('Loading Melee');assert.equal(retry.expired(),undefined);
});
test('human Ready waits and successful gameplay do not time out; diagnostics stay bounded',()=>{
 let time=0;const d=createLaunchDiagnostics({now:()=>time,timeoutMs:100});d.arm('Loading');d.pause();time=1000;assert.equal(d.expired(),undefined);
 d.arm('Starting');d.observe({type:'playable'});time=2000;assert.equal(d.expired(),undefined);
 for(let i=0;i<500;i++)d.observe({type:'frame-stall',frame:i,durationMs:90});
 d.observe({type:'metrics',frameTimes:[16,45,NaN,80]});const s=d.snapshot();assert.equal(s.events.length,120);assert.equal(s.frames,3);assert.equal(s.over33ms,2);assert.equal(s.longestStallMs,80);
});
