// SPDX-License-Identifier: MIT
export const launch = Object.freeze({mode:0,stage:31,level:9,stocks:4,minutes:8,packedPorts:Object.freeze([1,2,768,768])});
export const seed = '17';
export const disc = '0de05981a34156b9cedcef73c73d4244ac05cf6149ab3c9cfed917698819e464';
export async function sha256(bytes) {
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 return Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
}
export function canonicalLaunch(value) {
 if(!value || Object.keys(value).sort().join(',')!==Object.keys(launch).sort().join(',') ||
  !Object.keys(launch).every(key=>key==='packedPorts' ? Array.isArray(value[key])&&value[key].length===4&&value[key].every((n,i)=>n===launch[key][i]) : value[key]===launch[key]))
  throw Error('This local prototype supports Donkey Kong versus Fox on Battlefield, four stocks and eight minutes.');
 return JSON.stringify(launch);
}
export async function installedIdentity(engine, config, {verifiedDisc, installedSeed, freshSaves, costumes=[], cssAssets=[]}) {
 if(!/^[a-f0-9]{64}$/.test(engine) || verifiedDisc!==disc || installedSeed!==seed || !freshSaves || costumes.length || cssAssets.length)
  throw Error('Local runtime, disc, seed, memory card or replacement assets are incompatible.');
 return {engine,disc,rules:await sha256(new TextEncoder().encode(canonicalLaunch(config))),costumes:'stock',seed};
}
export async function verifyRuntime(manifest, read = async url => {
 const response=await fetch(url);if(!response.ok)throw Error('Runtime file unavailable: '+url);return new Uint8Array(await response.arrayBuffer());
}) {
 if(!manifest || !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length>32)
  throw Error('Build the confirmed-input Melee runtime first.');
 for(const file of manifest.files){
  if(!file || !/^\/engine\/[a-zA-Z0-9_./-]+$/.test(file.url) || file.url.includes('..') || !/^[a-f0-9]{64}$/.test(file.sha256) ||
   await sha256(await read(file.url))!==file.sha256)throw Error('Runtime verification failed. Restart the relay after building.');
 }
 const engine=await sha256(new TextEncoder().encode(JSON.stringify(manifest.files)));
 if(engine!==manifest.identity?.engine)throw Error('Runtime manifest identity mismatch.');
 return engine;
}
