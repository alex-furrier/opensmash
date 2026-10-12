import test from 'node:test';import assert from 'node:assert/strict';
import {privateFriendOrigin,friendOriginAllowed} from '../server/friend-rooms.mjs';
const privateOrigin='https://approved-device.example.ts.net:8450';
const request=(origin,host,address='127.0.0.1')=>({headers:{origin,host},socket:{remoteAddress:address}});
test('private room access requires exact approved HTTPS origin and authority from loopback proxy',()=>{
 const config={privateOrigin:privateFriendOrigin(privateOrigin)};
 assert.equal(friendOriginAllowed(request(privateOrigin,'approved-device.example.ts.net:8450'),config),true);
 for(const r of [request('https://other.example.ts.net:8450','approved-device.example.ts.net:8450'),request(privateOrigin,'approved-device.example.ts.net'),request(privateOrigin,'127.0.0.1:4196'),request(privateOrigin,'approved-device.example.ts.net:8450','100.64.0.2'),request(undefined,'approved-device.example.ts.net:8450')])assert.equal(friendOriginAllowed(r,config),false);
 assert.equal(friendOriginAllowed(request(privateOrigin,'approved-device.example.ts.net:8450')),false);
});
test('existing loopback rooms remain available without accepting arbitrary authorities or forwarded headers',()=>{
 assert.equal(friendOriginAllowed(request('http://127.0.0.1:4196','127.0.0.1:4196')),true);
 assert.equal(friendOriginAllowed(request('http://localhost:4196','localhost:4196')),true);
 assert.equal(friendOriginAllowed(request('http://[::1]:4196','[::1]:4196','::1')),true);
 assert.equal(friendOriginAllowed(request('http://evil.test','evil.test')),false);
 assert.equal(friendOriginAllowed(request('http://127.0.0.1:4196','localhost:4196')),false);
 assert.equal(friendOriginAllowed(request('http://127.0.0.1:4196','127.0.0.1:4196'),{host:'0.0.0.0'}),false);
});
test('private origin configuration rejects broad, insecure and non-origin values',()=>{
 assert.equal(privateFriendOrigin(undefined),undefined);
 for(const value of ['http://approved-device.example.ts.net:8450','https://example.com','https://approved-device.example.ts.net:8450/','https://user@approved-device.example.ts.net:8450','https://approved-device.example.ts.net:8450/path','https://approved-device.example.ts.net:8450?x=1','*.ts.net'])assert.throws(()=>privateFriendOrigin(value));
});

import {privateMeleeRequestAllowed,allowedPrivateMeleeRoute} from '../server/handler.mjs';
test('tailnet cannot access operator disc setup, raw game, native process or system files',()=>{
 for(const path of ['/api/game','/api/game/PlMr.dat','/api/setup','/api/setup/disc','/api/setup/clear','/api/native/status','/api/native/disc','/engine/sys/main.dol','/engine/sys-bundle.bin','/engine/sys-manifest.json','/engine/v/0123456789abcdef/sys/main.dol'])for(const method of ['GET','POST'])assert.equal(allowedPrivateMeleeRoute(method,path),false,path);
 for(const path of ['/api/netplay/config','/api/netplay/manifest','/api/imports','/api/imports/portraits/import-'+ 'a'.repeat(24)+'-tile.webp','/engine/upstream/runtime.mjs'])assert.equal(allowedPrivateMeleeRoute('GET',path),true,path);
 assert.equal(allowedPrivateMeleeRoute('POST','/api/character-select'),true);
});
test('private gateway route limits also hold with spoofed loopback Host and no Origin',()=>{
 const r={...request(privateOrigin,'approved-device.example.ts.net:8450'),method:'GET',url:'/melee/api/imports?roster=active'};
 assert.equal(privateMeleeRequestAllowed(r,privateOrigin),true);
 assert.equal(privateMeleeRequestAllowed({...r,url:'/melee/api/game'},privateOrigin),false);
 assert.equal(privateMeleeRequestAllowed({...r,headers:{...r.headers,origin:'https://other.example.ts.net:8450'}},privateOrigin),false);
 assert.equal(privateMeleeRequestAllowed({...r,headers:{host:'other.example.ts.net:8450'}},privateOrigin),false);
 assert.equal(privateMeleeRequestAllowed({...r,headers:{host:'127.0.0.1:4196'},url:'/melee/api/game'},privateOrigin),false);
 assert.equal(privateMeleeRequestAllowed({...r,headers:{host:r.headers.host}},privateOrigin),true);
});

test('loopback Host cannot exempt restricted routes when private-origin mode is active',()=>{
 for(const host of ['localhost:4196','127.0.0.1:4196','[::1]:4196'])for(const path of ['/api/game/PlMr.dat','/api/setup/disc','/engine/sys/main.dol'])assert.equal(privateMeleeRequestAllowed({headers:{host},socket:{remoteAddress:'127.0.0.1'},method:'GET',url:'/melee'+path},privateOrigin),false);
 const r={headers:{host:'127.0.0.1:4196'},socket:{remoteAddress:'127.0.0.1'},method:'GET',url:'/melee/api/imports'};
 assert.equal(privateMeleeRequestAllowed(r,privateOrigin),true);
 assert.equal(privateMeleeRequestAllowed({...r,url:'/melee/api/game'},undefined),true);
});

test('private-origin mode denies the outer native sprite studio before any renderer/cache action',()=>{
 for(const host of ['approved-device.example.ts.net:8450','localhost:4196','127.0.0.1:4196']){
  const req={headers:{host},socket:{remoteAddress:'127.0.0.1'},method:'GET',url:'/api/og-sprite?slug=existingfighter&fkind=0&force=1'};
  assert.equal(privateMeleeRequestAllowed(req,privateOrigin),false);
  assert.equal(privateMeleeRequestAllowed(req,undefined),true);
 }
 assert.equal(privateMeleeRequestAllowed({url:'/melee',method:'GET',headers:{},socket:{}},privateOrigin),true);
});
