// Opt-in CSS regression: no engine, disc, private roster or hardware GPU required.
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const args=process.argv.slice(2),option=name=>{const i=args.indexOf('--'+name);return i<0?undefined:args[i+1];};
const output=option('output'),ref=option('style-ref');
if(!output||!process.env.MELEE_PLAYWRIGHT_MODULE)throw Error('Supply --output and MELEE_PLAYWRIGHT_MODULE.');
if(ref&&!/^[a-f0-9]{40}$/.test(ref))throw Error('--style-ref must be a full committed SHA.');
const root=fileURLToPath(new URL('../../../',import.meta.url));
const styles=await Promise.all(['engines/melee/launcher/launcher.css','engines/melee/launcher/trailer-capture.css'].map(path=>ref?execFileSync('git',['show',ref+':'+path],{cwd:root,encoding:'utf8'}):readFile(new URL('../'+path.replace('engines/melee/',''),import.meta.url),'utf8')));
const {chromium}=createRequire(import.meta.url)(process.env.MELEE_PLAYWRIGHT_MODULE);await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']}),page=await browser.newPage();const results=[];
try{
 for(const [label,width,height,phase] of [['wide',1920,1080,'is-visible'],['laptop',1280,720,'is-visible'],['standard',960,720,'is-visible'],['portrait',720,1280,'is-visible'],['preview',1920,1080,'is-preparing']]){
  await page.setViewportSize({width,height});
  await page.setContent('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;background:#222}'+styles.join('\n')+'</style><div class="melee-trailer-capture melee-surface '+phase+'"><div class="game-overlay"><section class="game-panel"><div class="game-screen"><canvas width="960" height="720"></canvas></div></section></div></div>');
  await page.locator('canvas').evaluate(canvas=>{const c=canvas.getContext('2d');c.fillStyle='#254b67';c.fillRect(0,0,960,720);c.strokeStyle='#adcddd';c.lineWidth=3;for(let x=0;x<=960;x+=120){c.beginPath();c.moveTo(x,0);c.lineTo(x,720);c.stroke();}for(let y=0;y<=720;y+=120){c.beginPath();c.moveTo(0,y);c.lineTo(960,y);c.stroke();}c.fillStyle='#fff2d6';c.font='32px sans-serif';c.fillText('4:3 capture layout fixture',240,350);for(const [x,y,color]of [[0,0,'#ff6040'],[900,0,'#60ef80'],[0,660,'#f4df60'],[900,660,'#db80ff']]){c.fillStyle=color;c.fillRect(x,y,60,60);}});
  const geometry=await page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};return {surface:rect('.melee-trailer-capture'),overlay:rect('.game-overlay'),panel:rect('.game-panel'),screen:rect('.game-screen')};});
  results.push({label,width,height,phase,...geometry});await page.screenshot({path:output+'/'+label+'.png'});
  for(const name of ['overlay','panel','screen']){const b=geometry[name],s=geometry.surface;assert.ok(Math.abs(b.x-s.x)<=1&&Math.abs(b.y-s.y)<=1&&Math.abs(b.width-s.width)<=1&&Math.abs(b.height-s.height)<=1,label+' '+name+' stays inside capture bounds');}
 }
 await writeFile(output+'/result.json',JSON.stringify({scope:'CSS geometry fixture; real engine and capture recording are not exercised',styleRef:ref||'working-tree',chrome:browser.version(),results},null,2));console.log('Trailer capture layout passed',results.map(r=>r.label));
}catch(error){await writeFile(output+'/failure.json',JSON.stringify({message:error.message,styleRef:ref||'working-tree',results},null,2));throw error;}finally{await browser.close();}
