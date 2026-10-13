// SPDX-License-Identifier: MIT
import {randomBytes, randomUUID} from 'node:crypto';

/** One ephemeral registry per relay server. Every room owns exactly two sockets.
 * No game inputs are synthesized here and no game/asset state is persisted. */
export function createRooms({identity, launch, maxRooms = 32, now = Date.now, ttlMs = 15 * 60 * 1000,testBotStartupMs = 180000,permitTestBot=()=>false,startTestBot,stopTestBot,permitTestBotJoin=()=>false,resolveMatch,validateReady}) {
  identity = Object.freeze({...identity});
  launch = Object.freeze({...launch, packedPorts: Object.freeze([...(launch.packedPorts || [])])});
  const rooms = new Map(), memberships = new Map();
  const send = (socket, message) => socket.send(JSON.stringify(message));
  function finish(room, reason) {
    if (!rooms.has(room.code)) return;
    rooms.delete(room.code);if(room.testBot)stopTestBot?.(room.session);
    for (const member of room.members) if (member) {
      memberships.delete(member.socket);
      try { send(member.socket, {type:'stopped', reason}); } catch {}
      member.socket.close(1000, 'Room ended');
    }
  }
  function sweep() { for (const room of rooms.values()) {if (now() >= room.expires) finish(room, 'Room expired. Create a fresh room.');else if(room.opponentDeadline && now() >= room.opponentDeadline)finish(room,'Local opponent preparation timed out. Stop the room and retry.');} }
  function welcome(room, member) {
    send(member.socket, {type:'joined', room:room.code, session:room.session, player:member.player, identity:room.identity, launch:room.launch,testBot:room.testBot,match:room.match});
    status(room);
  }
  function status(room) {
    for (const member of room.members) if (member) send(member.socket, {type:'room',
      players:room.members.map(m=>m?{player:m.player,ready:m.ready}:null), started:room.started,...(room.opponentPhase?{opponentPhase:room.opponentPhase}:{})});
  }
  function reject(socket, reason) { send(socket,{type:'rejected',reason}); socket.close(1008,'Room rejected'); }
  return {
    receive(socket, message) {
      sweep();
      try {
        if (!message || typeof message.type !== 'string') throw Error('Invalid room request.');
        let member = memberships.get(socket), room = member?.room;
        if (message.type === 'create') {
          if(message.testBot&&(!permitTestBot(socket)||!startTestBot||!['reference','delay','jitter','hold'].includes(message.scenario||'reference')))throw Error('Test opponent is unavailable for this request.');
          if (member || rooms.size >= maxRooms) throw Error('Cannot create another room.');
          const match=resolveMatch?resolveMatch(message.match):{identity,launch};
          room = {identity:match.identity,launch:match.launch,match:match.proposal,code:randomBytes(16).toString('hex'),session:randomUUID(),members:[null,null],started:false,expires:now()+ttlMs,testBot:!!message.testBot,...(message.testBot?{opponentDeadline:now()+testBotStartupMs}:{})};
          member = {socket,player:0,ready:false,room};room.members[0]=member;
          rooms.set(room.code,room);memberships.set(socket,member);welcome(room,member);if(room.testBot)Promise.resolve().then(()=>{if(rooms.has(room.code))return startTestBot({room:room.code,session:room.session,scenario:message.scenario||'reference',onPhase:phase=>{if(rooms.has(room.code)&&!room.started){room.opponentPhase=phase;if(phase==='verified'&&!room.members[0]?.ready)delete room.opponentDeadline;status(room);}}});}).catch(error=>finish(room,'Test opponent: '+error.message));return;
        }
        if (message.type === 'join') {
          if (member || !/^[a-f0-9]{32}$/.test(message.room || '')) throw Error('Invalid room link.');
          room = rooms.get(message.room);
          if(room?.testBot&&!permitTestBotJoin(socket))throw Error('This room has its own local test opponent.');
          if (!room || room.started || room.members[1]) throw Error('Room unavailable. Create a fresh room.');
          member = {socket,player:1,ready:false,room};room.members[1]=member;
          memberships.set(socket,member);welcome(room,member);return;
        }
        if (!member || !rooms.has(room.code)) throw Error('Join a room first.');
        if (message.type === 'stop') { finish(room,'Match stopped. Create a fresh room.');return; }
        if (message.type === 'ready') {
          if(validateReady){validateReady(message.identity,room);if(!room.identity)room.identity=Object.freeze({...message.identity});}
          if (room.started || member.ready || !message.identity ||
              Object.keys(room.identity).some(key=>message.identity[key]!==room.identity[key])) throw Error('Local game or settings are incompatible.');
          member.ready=true;if(room.testBot){if(member.player===1)delete room.opponentDeadline;else if(!room.members[1]?.ready)room.opponentDeadline=now()+testBotStartupMs;}status(room);
          if (room.members.every(m=>m?.ready)) {
            room.started=true;
            for (const peer of room.members) send(peer.socket,{type:'start',session:room.session});
          }
          return;
        }
        if (message.type === 'peer' && room.started) {
          const packet=message.packet;
          if (!packet || !['ready','input','accepted','applied','appliedAccepted','stop'].includes(packet.type) ||
              packet.session!==room.session || (packet.type!=='stop' && packet.player!==member.player))
            throw Error('Peer input ownership mismatch.');
          const peer=room.members[1-member.player];
          if (!peer || peer.socket.bufferedAmount > 65536) throw Error('Peer connection stalled.');
          send(peer.socket,{type:'peer',packet});return;
        }
        throw Error('Unexpected room request.');
      } catch (error) {
        const room=memberships.get(socket)?.room;
        if (room) finish(room,error.message);else reject(socket,error.message);
      }
    },
    disconnected(socket) { const room=memberships.get(socket)?.room;if(room)finish(room,'Peer disconnected. Create a fresh room.'); },
    close() { for (const room of [...rooms.values()]) finish(room,'Relay stopped.'); },
    sweep,
  };
}
