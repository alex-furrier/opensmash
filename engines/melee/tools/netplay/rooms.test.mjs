import test from 'node:test';
import assert from 'node:assert/strict';
import {createRooms} from './rooms.mjs';
const identity={engine:'actual-engine',disc:'actual-disc',rules:'rules',costumes:'stock',seed:'17'};
const socket=()=>({messages:[],bufferedAmount:0,send(text){this.messages.push(JSON.parse(text));},close(){this.closed=true;}});
function pair(){const rooms=createRooms({identity,launch:{mode:0}}),a=socket(),b=socket();rooms.receive(a,{type:'create'});const joined=a.messages.find(m=>m.type==='joined');rooms.receive(b,{type:'join',room:joined.room});return{rooms,a,b,joined};}
test('create/share/join requires both compatible Ready messages before start and assigns separate slots',()=>{
 const {rooms,a,b,joined}=pair();
 assert.equal(joined.player,0);assert.equal(b.messages.find(m=>m.type==='joined').player,1);
 rooms.receive(a,{type:'ready',identity});assert.ok(!a.messages.some(m=>m.type==='start'));
 rooms.receive(b,{type:'ready',identity});assert.ok([a,b].every(p=>p.messages.some(m=>m.type==='start')));
 const packet={type:'input',session:joined.session,player:0,tick:0,pad:[],state:'digest'};
 rooms.receive(a,{type:'peer',packet});assert.deepEqual(b.messages.at(-1),{type:'peer',packet});
 const third=socket();rooms.receive(third,{type:'join',room:joined.room});assert.equal(third.messages.at(-1).type,'rejected');rooms.close();
});
test('identity mismatch, forged owner and disconnect end both members; old room cannot be reused',()=>{
 for(const fault of ['identity','owner','disconnect']){
  const {rooms,a,b,joined}=pair();
  if(fault==='identity')rooms.receive(b,{type:'ready',identity:{...identity,engine:'wrong'}});
  else{rooms.receive(a,{type:'ready',identity});rooms.receive(b,{type:'ready',identity});
   if(fault==='owner')rooms.receive(b,{type:'peer',packet:{type:'input',session:joined.session,player:0}});
   else rooms.disconnected(a);
  }
  assert.ok(a.closed&&b.closed);assert.ok([a,b].every(p=>p.messages.at(-1).type==='stopped'));
  const fresh=socket();rooms.receive(fresh,{type:'join',room:joined.room});assert.equal(fresh.messages.at(-1).type,'rejected');
  const next=socket();rooms.receive(next,{type:'create'});assert.notEqual(next.messages[0].session,joined.session);rooms.close();
 }
});
test('room lifetime and stalled peer queues are bounded',()=>{
 let time=0;const rooms=createRooms({identity,launch:{},now:()=>time,ttlMs:10,maxRooms:1}),a=socket(),other=socket();
 rooms.receive(a,{type:'create'});rooms.receive(other,{type:'create'});assert.equal(other.messages[0].type,'rejected');
 time=10;rooms.sweep();assert.ok(a.closed);rooms.close();
 const p=pair();p.rooms.receive(p.a,{type:'ready',identity});p.rooms.receive(p.b,{type:'ready',identity});p.b.bufferedAmount=65537;
 p.rooms.receive(p.a,{type:'peer',packet:{type:'accepted',player:0,session:p.joined.session,tick:0}});assert.ok(p.a.closed&&p.b.closed);
});
