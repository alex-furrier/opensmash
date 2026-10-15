import {createRequire} from 'node:module';
import {mkdtemp, writeFile, rm, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {createSharedPasswordGate, passwordRecord} from '../../../web-prototype/server/shared-password.js';
const args=process.argv.slice(2), outputIndex=args.indexOf('--output');
if(outputIndex<0||!args[outputIndex+1]||!process.env.MELEE_PLAYWRIGHT_MODULE)throw Error('Supply --output and MELEE_PLAYWRIGHT_MODULE. This tool uses isolated synthetic credentials only.');
const {chromium}=createRequire(import.meta.url)(process.env.MELEE_PLAYWRIGHT_MODULE);
const out=path.resolve(args[outputIndex+1]);await mkdir(out,{recursive:true});
const dir=await mkdtemp(path.join(tmpdir(),'smash-login-visual-'));
const file=path.join(dir,'synthetic-auth.json'), password='synthetic-browser-fixture';
await writeFile(file,JSON.stringify({helperKey:randomBytes(32).toString('hex'),authVersion:randomBytes(32).toString('hex'),sealKey:randomBytes(32).toString('hex'),password:await passwordRecord(password)}),{mode:0o600});
const gate=createSharedPasswordGate({file,origin:'https://smash.alexfurrier.dev',requireProxyHttps:true});
// This isolated fixture adapts only its own local browser transport to the production gate.
const server=http.createServer(async(req,res)=>{
 req.headers.host='smash.alexfurrier.dev';req.headers['x-forwarded-proto']='https';
 if(req.headers.origin===local)req.headers.origin='https://smash.alexfurrier.dev';
 if(await gate.handle(req,res)){res.writeHead(200,{'Content-Type':'text/plain'});res.end('isolated authenticated lobby');}
});
let local, browser;
const results=[],errors=[],requests=[];
try{
 server.listen(0,'127.0.0.1');await once(server,'listening');local='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 for(const [name,width,height] of [['desktop',1440,900],['tablet',768,1024],['mobile',390,844],['small-mobile',320,640],['zoom-equivalent',640,450]]){
  await page.setViewportSize({width,height});await page.goto(local+'/login');
  assert.equal(await page.locator('input:visible').count(),1);assert.equal(await page.getByLabel('Shared password',{exact:true}).getAttribute('type'),'password');
  assert.equal(await page.locator('script,img,iframe').count(),0);
  const geometry=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,controls:[...document.querySelectorAll('input:not([type=hidden]),button')].map(e=>{const r=e.getBoundingClientRect();return {width:r.width,height:r.height,left:r.left,right:r.right}}),headings:[...document.querySelectorAll('h1 span')].map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,scroll:e.scrollWidth,width:e.clientWidth}})}));
  assert.equal(geometry.overflow,false);for(const r of geometry.controls){assert.ok(r.width>=44&&r.height>=44&&r.left>=0&&r.right<=width);}for(const r of geometry.headings)assert.ok(r.scroll<=r.width+1);
  await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').getAttribute('name'),'password');
  assert.equal(await page.locator(':focus').evaluate(e=>getComputedStyle(e).outlineStyle),'solid');
  await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').textContent(),'Enter lobby→');
  await page.screenshot({path:out+'/'+name+'.png',fullPage:true});results.push({name,width,height,...geometry});
 }
 await page.emulateMedia({colorScheme:'light',reducedMotion:'reduce'});await page.goto(local+'/login');
 assert.equal(await page.locator('button').evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
 await page.emulateMedia({forcedColors:'active'});await page.screenshot({path:out+'/forced-colors.png',fullPage:true});
 await page.emulateMedia({forcedColors:'none',colorScheme:'dark',reducedMotion:'no-preference'});
 await page.setViewportSize({width:390,height:844});await page.goto(local+'/login');
 await page.getByRole('button',{name:'Enter lobby',exact:true}).click();assert.equal(await page.locator('input:invalid').count(),1);

 await page.getByLabel('Shared password',{exact:true}).fill('wrong-fixture-password');await page.getByRole('button',{name:'Enter lobby',exact:true}).click();await page.getByRole('alert').waitFor();
 assert.match(await page.getByRole('alert').textContent(),/Check the shared password/);assert.equal(await page.getByLabel('Shared password',{exact:true}).inputValue(),'');
 await page.screenshot({path:out+'/invalid-password.png',fullPage:true});
 await page.getByLabel('Shared password',{exact:true}).fill(password);await page.getByRole('button',{name:'Enter lobby',exact:true}).click();await page.waitForURL(local+'/melee');assert.equal(await page.locator('body').textContent(),'isolated authenticated lobby');
 assert.deepEqual(errors,[]);assert.ok(requests.every(u=>u.startsWith(local+'/')));
 await writeFile(out+'/browser.json',JSON.stringify({checkedUTC:new Date().toISOString(),chrome:browser.version(),realCredentialsUsed:false,liveServiceChanged:false,results,errors,externalRequests:0,syntheticFailedAndSuccessfulLogin:true},null,2)+'\n');
 console.log('Login visual/keyboard/layout and isolated synthetic authentication checks passed');
}finally{await browser?.close();gate.close();server.closeAllConnections();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
