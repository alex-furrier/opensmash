import test from 'node:test';
import assert from 'node:assert/strict';
import {mountSizedFile, mountSystemBundle, costumeSlot, COSTUME_SLOT_SIZE,COSTUME_SLOTS,COSTUME_ASSET_NAMES,regionalCostumeAssets} from '../runtime/web/local-files.mjs';
import {readFileSync} from 'node:fs';
import {planLaunch} from '../runtime/web/launch-options.mjs';

test('ordinary multi-Falcon lineups install the red costume under both locale filenames without replacing other slots',()=>{
 const schema=JSON.parse(readFileSync(new URL('../runtime/launch-options.json',import.meta.url)));
 const roster=['a','b','c','d'].map(slug=>({slug,target:'captain-falcon'}));
 const settings={...structuredClone(schema.defaults),ports:roster.map((row,i)=>({device:i?'cpu':'keyboard',character:row.slug,target:'auto'}))};
 const plan=planLaunch(schema,settings,roster[0],roster);
 assert.deepEqual(plan.ports.map(p=>p.color),[0,1,2,3]);
 const assets=plan.costumes.map(row=>({filename:row.filename,blob:new Blob([new Uint8Array(32)])}));
 const installed=regionalCostumeAssets(assets);assert.equal(installed.length,5);
 const red=installed.find(row=>row.filename==='PlCaRe.dat'),us=installed.find(row=>row.filename==='PlCaRe.usd');
 assert.ok(red&&us);assert.equal(red.blob,us.blob);assert.ok(COSTUME_ASSET_NAMES.includes(us.filename));assert.equal(COSTUME_SLOTS.length,124);assert.ok(!COSTUME_SLOTS.includes(us.filename));
 assert.deepEqual(installed.filter(row=>row!==us),assets);
 const repeated=planLaunch(schema,{...settings,ports:settings.ports.map((p,i)=>i===3?{...p,character:'c'}:p)},roster[0],roster);
 assert.deepEqual(repeated.ports.map(p=>p.color),[0,1,2,2]);assert.equal(repeated.costumes.length,3);
});

test('fixed costume slots preserve archive sections and only update declared file length', () => {
  const storage=new Uint8Array(160),source=storage.subarray(16,144);
  source.set(Uint8Array.from({length:128},(_,i)=>i));
  new DataView(source.buffer,source.byteOffset).setUint32(0,source.length);
  const original=source.slice(),slot=costumeSlot(source);
  assert.equal(slot.length,COSTUME_SLOT_SIZE);
  assert.equal(new DataView(slot.buffer).getUint32(0),COSTUME_SLOT_SIZE);
  assert.deepEqual(slot.subarray(4,source.length),original.subarray(4));
  assert.ok(slot.subarray(source.length).every(byte=>byte===0));
  assert.deepEqual(source,original);
  assert.throws(()=>costumeSlot(source.subarray(0,31)),/Invalid/);
  assert.throws(()=>costumeSlot(new Uint8Array(COSTUME_SLOT_SIZE+1)),/Invalid/);
  source[3]++;
  assert.throws(()=>costumeSlot(source),/Invalid/);
});

test('sized reads preserve bytes across chunks, cache them, and stop at EOF', () => {
  const source = Uint8Array.from({length:1024*1024+17}, (_,i)=>i%251), calls=[];
  const FS={createLazyFile(){return {stream_ops:{llseek:'retained'}};}};
  const node=mountSizedFile(FS,'/game','sample','local',source.length, (url,start,end)=>{
    calls.push([start,end]);return source.slice(start,end+1);
  });
  assert.equal(node.contents.length,source.length);
  assert.equal(calls.length,0);
  const out=new Uint8Array(30);
  assert.equal(node.stream_ops.read({},out,3,24,source.length-21),21);
  assert.deepEqual(out.subarray(3,24),source.subarray(source.length-21));
  assert.deepEqual(calls,[[0,1048575],[1048576,1048592]]);
  assert.equal(node.contents.get(source.length-1),source.at(-1));
  assert.equal(node.stream_ops.read({},out,0,30,source.length),0);
  assert.equal(calls.length,2);
  assert.equal(node.stream_ops.llseek,'retained');
  assert.throws(()=>mountSizedFile(FS,'','x','',-1));
});

test('system bundle copies nested files and rejects truncated or escaping entries', () => {
  const encode=(entries,payload)=>{
    const header=new TextEncoder().encode(JSON.stringify(entries)),bytes=new Uint8Array(4+header.length+payload.length);
    new DataView(bytes.buffer).setUint32(0,header.length);bytes.set(header,4);bytes.set(payload,4+header.length);return bytes.buffer;
  };
  const files=new Map(),FS={mkdirTree(){},writeFile(path,data){files.set(path,data.slice());}};
  const data=encode([{name:'GC/font.bin',offset:0,length:3}],[1,2,255]);
  mountSystemBundle(FS,data);assert.deepEqual(files.get('/sys/GC/font.bin'),new Uint8Array([1,2,255]));
  assert.throws(()=>mountSystemBundle(FS,data.slice(0,-1)),/Invalid/);
  assert.throws(()=>mountSystemBundle(FS,encode([{name:'../escape',offset:0,length:0}],[])),/Invalid/);
});
