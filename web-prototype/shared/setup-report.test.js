import test from 'node:test';import assert from 'node:assert/strict';
import {setupReport,validSetupReport} from './setup-report.js';
import {createSetupReportClient} from './setup-report-client.js';
const failure={name:'UnknownError',discStage:'download-open-root',expectedBytes:1459978240};
const raw={version:1,state:'error',expectedBytes:1459978240,lastFailure:failure,storageAvailable:true,probeError:'UnknownError',sharedMemory:true};
test('projection drops private and unknown fields and server schema rejects them',()=>{
 const report=setupReport({...raw,url:'https://private.invalid',filename:'private.iso',token:'secret'}, {...failure,message:'private message',stack:'private stack'});
 assert(validSetupReport(report));assert.doesNotMatch(JSON.stringify(report),/private|secret|url|filename|stack/);
 for(const bad of [{...report,url:'private'}, {...report,lastFailure:{...failure,message:'private'}}, {...report,probeError:'https://private.invalid'}, {...report,lastFailure:{...failure,discStage:'private-stage'}}, {...report,lastFailure:{...failure,expectedBytes:-1}}, {...report,state:'private'}, {...report,version:2}])assert.equal(validSetupReport(bad),false);
});
function fixture({inspect=async()=>raw,fetchImpl,clock=1000}={}){
 const calls=[],states=[],timers=[];let time=clock;
 const fetchRequest=async(path,options)=>{calls.push({path,...options,value:JSON.parse(options.body)});if(fetchImpl)return fetchImpl(calls.at(-1));return{ok:true,status:200,json:async()=>JSON.parse(options.body).action==='arm'?{token:'a'.repeat(32),expiresAt:time+900000}:{received:true}};};
 const client=createSetupReportClient({inspect,fetchRequest,onStatus:s=>states.push(s),now:()=>time,schedule:(fn,ms)=>{timers.push({fn,ms});return 1;},unschedule:()=>{}});
 return{client,calls,states,timers,advance:n=>{time+=n;}};
}
test('capture is disabled by default, single use, and transmits no private error content',async()=>{
 const f=fixture();assert.equal(await f.client.capture(failure),false);assert.equal(f.calls.length,0);
 assert(await f.client.arm());assert(await f.client.capture({...failure,message:'private'}));assert.equal(await f.client.capture(failure),false);
 assert.deepEqual(f.calls.map(c=>c.value.action),['arm','report']);assert.equal(f.calls[1].credentials,'same-origin');assert.equal(f.calls[1].redirect,'error');assert.doesNotMatch(f.calls[1].body,/private|message/);assert.equal(f.states.at(-1).armed,false);assert.equal(f.states.at(-1).busy,false);assert.match(f.states.at(-1).message,/sent/);
});
test('AbortError does not consume opt-in; expiration and opt-out prevent sending',async()=>{
 const f=fixture();await f.client.arm();assert.equal(await f.client.capture({name:'AbortError'}),false);f.advance(900000);assert.equal(await f.client.capture(failure),false);assert.equal(f.calls.length,1);
 const g=fixture();await g.client.arm();g.client.disable();await Promise.resolve();assert.equal(await g.client.capture(failure),false);assert.deepEqual(g.calls.map(c=>c.value.action),['arm','cancel']);
});
test('concurrent failures consume one permit and retain the first failure snapshot',async()=>{
 let release;const f=fixture({inspect:()=>new Promise(r=>{release=r;})});await f.client.arm();const sending=f.client.capture(failure);await Promise.resolve();assert.equal(await f.client.capture({...failure,discStage:'download-open-file'}),false);release({...raw,lastFailure:{...failure,discStage:'download-open-writable'}});assert(await sending);assert.equal(f.calls[1].value.report.lastFailure.discStage,'download-open-root');
});
test('inspection failure falls back to safe failure metadata; network errors do not escape',async()=>{
 const f=fixture({inspect:async()=>{throw Error('private');}});await f.client.arm();assert(await f.client.capture(failure));assert.equal(f.calls[1].value.report.probeError,'Timeout');assert.doesNotMatch(f.calls[1].body,/private/);
 let count=0;const g=fixture({fetchImpl:async()=>{if(count++===0)return{ok:true,status:200,json:async()=>({token:'a'.repeat(32),expiresAt:901000})};throw Error('network');}});await g.client.arm();assert.equal(await g.client.capture(failure),false);assert.match(g.states.at(-1).message,/Could not send/);assert.equal(g.states.at(-1).busy,false);assert.equal(await g.client.capture(failure),false);
});
test('late arm completion after opt-out never enables collection',async()=>{
 let resolve;const f=fixture({fetchImpl:()=>new Promise(r=>{resolve=r;})});const arming=f.client.arm();f.client.disable();resolve({ok:true,status:200,json:async()=>({token:'a'.repeat(32),expiresAt:901000})});assert.equal(await arming,false);assert.equal(await f.client.capture(failure),false);
});
