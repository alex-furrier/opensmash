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
