// Real lobby UI with a mocked runtime surface; never gameplay or iOS proof.
import {createRequire} from 'node:module';import {mkdir,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
import {startRelay} from './netplay/server.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
if (!process.env.MELEE_PC_ROOT || !process.env.TEST_OUTPUT) throw new Error('Set MELEE_PC_ROOT and private TEST_OUTPUT');
const relay=await startRelay({engineRoot:process.env.MELEE_PC_ROOT}),out=process.env.TEST_OUTPUT;await mkdir(out,{recursive:true});let browser;const results=[];
try{browser=await chromium.launch({channel:'chrome',headless:false});
for(const viewport of [{width:390,height:844},{width:844,height:390}]){
 const context=await browser.newContext({viewport,hasTouch:true});
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==relay.origin)return route.abort();if(url.pathname.endsWith('/runtime.html'))return route.fulfill({headers:{'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'},contentType:'text/html',body:`<!doctype html><script>window.samples=[];window.addEventListener('message',e=>{if(e.data.type==='start')parent.postMessage({type:'ready-for-selection',verifiedEngine:'${relay.manifest.identity.engine}',verifiedDiscHash:'${relay.manifest.identity.disc}',seed:'17',freshSaves:true},location.origin);if(e.data.type==='input')samples.push(e.data.values);});parent.postMessage({type:'bridge-ready'},location.origin);</script>`});return route.continue();});
 const pages=[await context.newPage(),await context.newPage()];for(const p of pages)p.on('pageerror',e=>console.log('UI error',e.message));for(const p of pages)await p.goto(relay.origin);
 await pages[0].locator('#create').click();await pages[0].locator('#share').waitFor({state:'visible'});const link=await pages[0].locator('#room-link').inputValue();await pages[1].locator('#room-code').fill(link);await pages[1].locator('#join').click();
 for(const p of pages){await p.locator('#disc').setInputFiles({name:'UI-fixture.iso',mimeType:'application/octet-stream',buffer:Buffer.from('fixture')});try{await p.waitForFunction(()=>!document.getElementById('ready').disabled);}catch(e){console.log(await p.locator('#status').textContent());throw e;}await p.locator('#ready').click();}
 const page=pages[0];await page.locator('#game').waitFor({state:'visible'});await page.locator('#touch-root').scrollIntoViewIfNeeded();
 const frame=page.frames().find(f=>f.url().endsWith('/runtime.html')),cdp=await context.newCDPSession(page),stick=await page.locator('.touch-main').boundingBox(),attack=await page.locator('.touch-a').boundingBox();
 assert.ok(stick&&attack);const touches=[{x:stick.x+stick.width*.85,y:stick.y+stick.height/2,id:1},{x:attack.x+attack.width/2,y:attack.y+attack.height/2,id:2}];
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touches});await page.waitForTimeout(50);
 let last=await frame.evaluate(()=>samples.at(-1));assert.ok(last[1]&256);assert.ok(last[2]>70);const simultaneous=last.slice();
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(40);last=await frame.evaluate(()=>samples.at(-1));assert.equal(last[1]&256,0);assert.equal(last[2],0);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touches});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await page.waitForTimeout(40);last=await frame.evaluate(()=>samples.at(-1));assert.deepEqual(last.slice(1,8),Array(7).fill(0));
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touches});await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.waitForTimeout(40);assert.deepEqual((await frame.evaluate(()=>samples.at(-1))).slice(1,8),Array(7).fill(0));await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
 await page.locator('#room-link').focus();await page.keyboard.press('z');await page.keyboard.press('ArrowRight');await page.waitForTimeout(40);last=await frame.evaluate(()=>samples.at(-1));assert.deepEqual(last.slice(1,8),Array(7).fill(0));
 await page.locator('#touch-root').scrollIntoViewIfNeeded();const refreshed=await page.locator('.touch-a').boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:refreshed.x+20,y:refreshed.y+20,id:3}]});await page.locator('#stop').click();assert.equal(await page.locator('iframe').count(),0);await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
 await page.evaluate(()=>{document.getElementById('game').hidden=false;});await page.locator('#touch-root').scrollIntoViewIfNeeded();const bounds=await page.locator('.melee-touch-deck').boundingBox();assert.ok(bounds.width>=300);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:out+`/touch-${viewport.width}-private.png`,fullPage:true});results.push({viewport,passed:true,simultaneous,release:true,cancel:true,blur:true,typing:true,stop:true,horizontalOverflow:false,fixture:'real lobby UI with mocked runtime; no iOS/gameplay claim'});await context.close();
}
await writeFile(out+'/summary.json',JSON.stringify({browser:browser.version(),engineIdentity:relay.manifest.identity.engine,results},null,2)+'\n');console.log(results);
}finally{await browser?.close();await relay.close();}
