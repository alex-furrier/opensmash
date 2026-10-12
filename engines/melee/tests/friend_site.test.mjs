import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
test('unconfigured normal website reports friend mode disabled and still exits on SIGINT',async()=>{
 const env={...process.env,PORT:'0',HOST:'127.0.0.1',NODE_ENV:'development',SERVE_BUILT_FRONTEND:'1',FIGHTER_WORKER_DISABLED:'1',FIREBASE_AUTH_ENABLED:'0',OBJECT_STORE:'local',JOB_DATABASE:'local',FIGHTER_EXECUTION_MODE:'local'};
 for(const name of ['MELEE_NETPLAY_ENGINE_ROOT','MELEE_EMBEDDED','MELEE_LOCAL_ORIGIN','MELEE_SERVICE_ORIGIN'])delete env[name];
 const child=spawn(process.execPath,[fileURLToPath(new URL('../../../web-prototype/server/index.js',import.meta.url))],{env,cwd:fileURLToPath(new URL('../../../',import.meta.url)),stdio:['ignore','pipe','pipe']});
 const exit=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));let timer,output='';
 try{
  const origin=await new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Website startup timed out')),5000);child.once('error',reject);child.stdout.on('data',chunk=>{output+=chunk;const match=/OpenSmash web: (http:\/\/127\.0\.0\.1:\d+)/.exec(output);if(match){clearTimeout(timer);resolve(match[1]);}});});
  const response=await fetch(origin+'/melee/api/netplay/config');assert.equal(response.status,200);assert.deepEqual(await response.json(),{enabled:false});
  child.kill('SIGINT');const result=await Promise.race([exit,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Website did not stop on SIGINT')),2000);})]);assert.equal(result.signal,'SIGINT');
 }finally{clearTimeout(timer);if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await exit;}}
});

test('friend runtime rejects a non-loopback listener before importing or serving engine assets',async()=>{
 const env={...process.env,PORT:'0',HOST:'0.0.0.0',NODE_ENV:'development',FIGHTER_WORKER_DISABLED:'1',MELEE_NETPLAY_ENGINE_ROOT:'/unbuilt-friend-fixture'};
 const child=spawn(process.execPath,[fileURLToPath(new URL('../../../web-prototype/server/index.js',import.meta.url))],{env,cwd:fileURLToPath(new URL('../../../',import.meta.url)),stdio:['ignore','pipe','pipe']});
 let output='',errors='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>errors+=c);
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
 assert.equal(code,1);assert.match(errors,/Friend runtime requires a loopback HOST/);assert.doesNotMatch(output,/OpenSmash web:/);
});

test('private-origin-only configuration rejects a direct remote listener before startup',async()=>{
 const env={...process.env,PORT:'0',HOST:'0.0.0.0',NODE_ENV:'development',MELEE_PRIVATE_ORIGIN:'https://approved.example.ts.net:8450'};
 for(const name of ['MELEE_NETPLAY_ENGINE_ROOT','MELEE_SIMULATED_PEER_ISO'])delete env[name];
 const child=spawn(process.execPath,[fileURLToPath(new URL('../../../web-prototype/server/index.js',import.meta.url))],{env,cwd:fileURLToPath(new URL('../../../',import.meta.url)),stdio:['ignore','pipe','pipe']});
 let output='',errors='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>errors+=c);
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
 assert.equal(code,1);assert.match(errors,/Friend runtime requires a loopback HOST/);assert.doesNotMatch(output,/OpenSmash web:/);
});

test('private website rejects outer sprite renderer requests with a spoofed loopback Host',async()=>{
 const env={...process.env,PORT:'0',HOST:'127.0.0.1',NODE_ENV:'development',SERVE_BUILT_FRONTEND:'1',FIGHTER_WORKER_DISABLED:'1',FIREBASE_AUTH_ENABLED:'0',OBJECT_STORE:'local',JOB_DATABASE:'local',MELEE_PRIVATE_ORIGIN:'https://approved.example.ts.net:8450'};
 for(const name of ['MELEE_NETPLAY_ENGINE_ROOT','MELEE_SIMULATED_PEER_ISO','MELEE_EMBEDDED','MELEE_LOCAL_ORIGIN','MELEE_SERVICE_ORIGIN'])delete env[name];
 const child=spawn(process.execPath,[fileURLToPath(new URL('../../../web-prototype/server/index.js',import.meta.url))],{env,cwd:fileURLToPath(new URL('../../../',import.meta.url)),stdio:['ignore','pipe','pipe']});
 const exit=new Promise(resolve=>child.once('exit',resolve));let timer,output='';
 try{
  const origin=await new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Website startup timed out')),5000);child.once('error',reject);child.stdout.on('data',chunk=>{output+=chunk;const match=/OpenSmash web: (http:\/\/127\.0\.0\.1:\d+)/.exec(output);if(match){clearTimeout(timer);resolve(match[1]);}});});
  const response=await fetch(origin+'/api/og-sprite?slug=invalid_slug&fkind=-1&force=1');assert.equal(response.status,404);
  child.kill('SIGINT');await exit;
 }finally{clearTimeout(timer);if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await exit;}}
});
