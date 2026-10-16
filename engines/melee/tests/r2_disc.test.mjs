import test from 'node:test';import assert from 'node:assert/strict';
import {createR2Disc} from '../server/r2-disc.mjs';
const config={account:'a'.repeat(32),bucket:'opensmash-private-disc',key:'disc/melee-usa-1.02.iso',accessKeyId:'b'.repeat(32),secretAccessKey:'c'.repeat(64),expectedSize:123,expectedHash:'d'.repeat(64),now:()=>Date.parse('2026-10-16T21:00:00Z')};
const head=()=>new Response(null,{headers:{'content-length':'123','x-amz-meta-sha256':'d'.repeat(64)}});
test('fixed private object uses method-bound 15-minute signatures and no-store redirect after metadata check',async()=>{
 let checked;const disc=await createR2Disc({...config,fetchObject:async request=>{checked=request;return head();}});
 assert.equal(checked.method,'HEAD');const check=new URL(checked.url);assert.equal(check.pathname,'/opensmash-private-disc/disc/melee-usa-1.02.iso');assert.equal(check.searchParams.get('X-Amz-Expires'),'900');
 let status,headers,ended=false;await disc.redirect({writeHead:(s,h)=>{status=s;headers=h;},end:()=>ended=true});
 assert.equal(status,302);assert.equal(ended,true);assert.equal(headers['Cache-Control'],'no-store');assert.equal(headers['Referrer-Policy'],'no-referrer');const get=new URL(headers.Location);assert.equal(get.origin,check.origin);assert.equal(get.pathname,check.pathname);assert.match(get.searchParams.get('X-Amz-Signature'),/^[a-f0-9]{64}$/);assert.notEqual(get.searchParams.get('X-Amz-Signature'),check.searchParams.get('X-Amz-Signature'));assert.equal(get.searchParams.get('X-Amz-Expires'),'900');assert.doesNotMatch(headers.Location,new RegExp(config.secretAccessKey));
});
test('disabled delivery and invalid authority or object metadata fail closed',async()=>{
 assert.equal(await createR2Disc(),null);
 for(const change of [{bucket:'other'},{key:'other.iso'},{account:'bad'},{accessKeyId:'bad'},{secretAccessKey:'bad'}])await assert.rejects(createR2Disc({...config,...change,fetchObject:async()=>head()}));
 for(const response of [new Response(null,{status:403}),new Response(null,{headers:{'content-length':'124','x-amz-meta-sha256':config.expectedHash}}),new Response(null,{headers:{'content-length':'123','x-amz-meta-sha256':'e'.repeat(64)}}),new Response(null,{headers:{'content-length':'123','x-amz-meta-sha256':config.expectedHash,'content-encoding':'gzip'}})])await assert.rejects(createR2Disc({...config,fetchObject:async()=>response}),/identity/);
});
