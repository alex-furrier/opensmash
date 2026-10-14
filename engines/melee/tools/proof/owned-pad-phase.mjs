import assert from 'node:assert/strict';
// Check acquisition messages, rather than inferring ownership from physics alone.
export function assertOwnedPadPhase(events, activePort, direction) {
 const samples=events.filter(e=>e.type==='pad'&&Array.isArray(e.values));
 for(const port of [0,1]) {
  const rows=samples.filter(e=>e.values[0]===port);assert.ok(rows.length,`port ${port} acquired input`);
  const x=row=>row.values[2]&255;
  if(port===activePort) {
   assert.ok(rows.some(row=>direction*(x(row)-128)>0),`port ${port} acquired its directed stick`);
   assert.ok(rows.every(row=>direction*(x(row)-128)>=0),`port ${port} never acquired the opposite stick`);
  } else assert.ok(rows.every(row=>row.values[1]===0&&(row.values[2]>>>0)===0x80808080&&row.values[3]===0),`inactive port ${port} remains neutral`);
 }
 return samples.length;
}
