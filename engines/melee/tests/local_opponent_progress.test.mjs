import test from 'node:test';import assert from 'node:assert/strict';
import {createRooms} from '../tools/netplay/rooms.mjs';import {localOpponentStatus} from '../web/lib/local-opponent-status.mjs';
const socket=()=>({messages:[],send(raw){this.messages.push(JSON.parse(raw));},close(){this.closed=true;}});
test('local opponent startup exposes progress and stops a stalled owned room; late progress cannot revive it',async()=>{
 let clock=1,start,stops=[];const rooms=createRooms({identity:{engine:'fixture'},launch:{},now:()=>clock,testBotStartupMs:100,permitTestBot:()=>true,startTestBot:request=>{start=request;return new Promise(()=>{});},stopTestBot:session=>stops.push(session)});
 const host=socket();rooms.receive(host,{type:'create',testBot:true});await Promise.resolve();start.onPhase('opening');assert.equal(host.messages.at(-1).opponentPhase,'opening');assert.match(localOpponentStatus(host.messages.at(-1)),/Starting the local opponent browser/);
 clock=102;rooms.sweep();assert.equal(host.messages.at(-1).type,'stopped');assert.match(host.messages.at(-1).reason,/timed out/);assert.equal(stops.length,1);const count=host.messages.length;start.onPhase('ready');assert.equal(host.messages.length,count);rooms.close();
});
test('verified opponent may wait for human Ready; after that barrier startup is bounded and a legacy ready peer clears it',async()=>{
 let clock=1,start;const rooms=createRooms({identity:{engine:'fixture'},launch:{},now:()=>clock,testBotStartupMs:100,permitTestBot:()=>true,permitTestBotJoin:()=>true,startTestBot:request=>{start=request;return new Promise(()=>{});}});
 const host=socket();rooms.receive(host,{type:'create',testBot:true});await Promise.resolve();start.onPhase('verified');clock=150;rooms.sweep();assert.ok(!host.closed);
 rooms.receive(host,{type:'ready',identity:{engine:'fixture'}});const guest=socket();rooms.receive(guest,{type:'join',room:start.room});rooms.receive(guest,{type:'ready',identity:{engine:'fixture'}});assert.equal(host.messages.at(-1).type,'start');clock=300;rooms.sweep();assert.ok(!host.closed);rooms.close();
});

test('a Ready click observation does not clear the relay acknowledgement deadline',async()=>{
 let clock=1,start;const rooms=createRooms({identity:{engine:'fixture'},launch:{},now:()=>clock,testBotStartupMs:100,permitTestBot:()=>true,startTestBot:request=>{start=request;return new Promise(()=>{});}});
 const host=socket();rooms.receive(host,{type:'create',testBot:true});await Promise.resolve();start.onPhase('verified');rooms.receive(host,{type:'ready',identity:{engine:'fixture'}});start.onPhase('ready');
 clock=102;rooms.sweep();assert.equal(host.messages.at(-1).type,'stopped');assert.match(host.messages.at(-1).reason,/timed out/);rooms.close();
});
