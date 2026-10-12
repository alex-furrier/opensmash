// SPDX-License-Identifier: MIT
import {disc,seed,sha256} from './identity.mjs';
/** Hash only resolved rules and installed bytes, never mutable character names or URLs. */
export function resolvedRules(value){
 const keys=['mode','stage','level','stocks','minutes'];
 if(!value||value.mode!==0||!Number.isInteger(value.stage)||value.stage<0||value.stage>100||!Number.isInteger(value.level)||value.level<1||value.level>9||!Number.isInteger(value.stocks)||value.stocks<1||value.stocks>99||!Number.isInteger(value.minutes)||value.minutes<1||value.minutes>99||!Array.isArray(value.packedPorts)||value.packedPorts.length!==4||value.packedPorts.some(n=>!Number.isInteger(n)||n<0||n>0xffffff))throw Error('Invalid resolved friend match.');
 if(value.packedPorts.some((n,i)=>((n>>>8)&255)!==(i<2?0:3)))throw Error('Friend match needs exactly two human ports.');
 return Object.fromEntries([...keys.map(key=>[key,value[key]]),['packedPorts',value.packedPorts.slice()]]);
}
export async function installedMatchIdentity(engine,launch,{verifiedDisc,installedSeed,freshSaves,costumes=[],cssAssets=[]}){
 if(!/^[a-f0-9]{64}$/.test(engine)||verifiedDisc!==disc||installedSeed!==seed||!freshSaves)throw Error('Unverified friend-match runtime.');
 const entries=[];
 for(const [kind,assets] of [['costume',costumes],['css',cssAssets]]){
  const names=new Set();
  for(const asset of assets){
   if(typeof asset.filename!=='string'||!/^[a-zA-Z0-9_./-]+$/.test(asset.filename)||asset.filename.includes('..')||names.has(asset.filename)||!asset.blob?.arrayBuffer)throw Error('Invalid installed match asset.');
   names.add(asset.filename);const bytes=await asset.blob.arrayBuffer();
   if(bytes.byteLength<32||bytes.byteLength>(kind==='costume'?2:16)*1024*1024)throw Error('Invalid installed match asset size.');
   entries.push({kind,filename:asset.filename,size:bytes.byteLength,sha256:await sha256(bytes)});
  }
 }
 entries.sort((a,b)=>a.kind.localeCompare(b.kind)||a.filename.localeCompare(b.filename));
 return {engine,disc,rules:await sha256(new TextEncoder().encode(JSON.stringify(resolvedRules(launch)))),costumes:await sha256(new TextEncoder().encode(JSON.stringify(entries))),seed};
}
