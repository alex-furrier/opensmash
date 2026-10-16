// SPDX-License-Identifier: MIT
import {createRequire} from 'node:module';
import {ISO_SIZE,ISO_SHA256} from '../runtime/web/disc.mjs';
const {AwsClient}=createRequire(new URL('../../../web-prototype/package.json',import.meta.url))('aws4fetch');

/** Read-only signing for one dedicated private bucket and one pinned disc object. */
export async function createR2Disc({account,bucket,key,accessKeyId,secretAccessKey,fetchObject=fetch,now=Date.now,expectedSize=ISO_SIZE,expectedHash=ISO_SHA256}={}){
 if(!account&&!bucket&&!key&&!accessKeyId&&!secretAccessKey)return null;
 if(!/^[a-f0-9]{32}$/.test(account||'')||bucket!=='opensmash-private-disc'||key!=='disc/melee-usa-1.02.iso'||!/^[a-f0-9]{32}$/.test(accessKeyId||'')||!/^[a-f0-9]{64}$/.test(secretAccessKey||''))throw Error('Invalid private disc delivery configuration.');
 const object=new URL(`https://${account}.r2.cloudflarestorage.com/${bucket}/${key}`);
 const signer=new AwsClient({accessKeyId,secretAccessKey,service:'s3',region:'auto'});
 async function sign(method){
  const url=new URL(object);url.searchParams.set('X-Amz-Expires','900');
  return signer.sign(url,{method,aws:{signQuery:true,datetime:new Date(now()).toISOString().replace(/[:-]|\.\d{3}/g,'')}});
 }
 // Metadata is a startup consistency check; the browser still authenticates every chunk.
 const head=await fetchObject(await sign('HEAD'),{redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!head.ok||Number(head.headers.get('content-length'))!==expectedSize||head.headers.get('x-amz-meta-sha256')!==expectedHash||head.headers.get('content-encoding'))throw Error('Private disc object identity check failed.');
 return {async redirect(res){const request=await sign('GET');res.writeHead(302,{Location:request.url,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();}};
}
