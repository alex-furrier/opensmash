// Opt-in real launcher journey. Uses a task-owned profile/fixture adapter, never CI by default.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const args=process.argv.slice(2),option=name=>{const i=args.indexOf('--'+name);return i<0?undefined:args[i+1];};
const origin=option('origin'),output=option('output'),characters=option('characters')?.split(','),adapter=option('context-module'),profile=option('profile'),iso=option('iso');
const only=option('only')||'pair',padIndex=option('gamepad-index')===undefined?undefined:Number(option('gamepad-index'));
if(padIndex!==undefined&&(!Number.isInteger(padIndex)||padIndex<0||padIndex>99))throw Error('Invalid --gamepad-index.');
if(!origin||!output||characters?.length!==2||!['create','pair'].includes(only))throw Error('Supply --origin, --output, --characters first,second and optional --only create|pair.');
if(!adapter&&(!profile||!process.env.MELEE_PLAYWRIGHT_MODULE))throw Error('Supply a task-owned --profile and MELEE_PLAYWRIGHT_MODULE, or --context-module exporting createContext().');
await mkdir(output,{recursive:true});
const context=adapter?await (await import(pathToFileURL(resolve(adapter)).href)).createContext():await createRequire(import.meta.url)(process.env.MELEE_PLAYWRIGHT_MODULE).chromium.launchPersistentContext(profile,{channel:'chrome',headless:!args.includes('--headed'),viewport:{width:1440,height:1000}});
if(padIndex!==undefined)await context.addInitScript(index=>{const pads=Array(index+1).fill(null);pads[index]={index,id:'Synthetic friend pad',mapping:'standard',connected:true,axes:[0,0,0,0],buttons:Array.from({length:16},()=>({pressed:false,value:0}))};navigator.getGamepads=()=>pads;},padIndex);
const result={journey:only,syntheticGamepadIndex:padIndex,checks:[],scope:'Actual launcher, two peer pages in one task-owned browser context; no WAN or physical-controller certification',errors:[]},pages=[];
await context.addInitScript(()=>{
 window.roomJourney={room:null,events:[]};const Native=window.WebSocket;
 window.WebSocket=class extends Native{constructor(...args){super(...args);this.addEventListener('message',({data})=>{try{const m=JSON.parse(data);if(m.type==='joined')window.roomJourney.room=m.room;}catch{}});}};
 window.addEventListener('message',({data})=>{if(['playable','error','progress','session'].includes(data?.type)){window.roomJourney.events.push(data);if(window.roomJourney.events.length>500)window.roomJourney.events.shift();}});
});
const checkpoint=async name=>{result.checks.push({name,status:'passed'});await writeFile(resolve(output,'summary.json'),JSON.stringify(result,null,2)+'\n');console.log('PASS',name);};
async function page(){const p=await context.newPage();p.setDefaultTimeout(90000);p.on('pageerror',e=>result.errors.push(e.message));pages.push(p);return p;}
async function open(p,hash=''){await p.goto(origin+'/melee'+hash,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>!!window.openSmashReactBridge?.characters?.length);}
async function disc(p){if(!iso)return;await p.getByRole('button',{name:'Settings',exact:true}).click();await p.getByRole('button',{name:'ROM Management',exact:true}).click();await p.getByRole('tab',{name:'Melee',exact:true}).click();if(!await p.getByRole('button',{name:'Clear disc',exact:true}).isVisible())await p.locator('.melee-disc-settings input[type=file]').setInputFiles(iso);await p.getByRole('button',{name:'Clear disc',exact:true}).waitFor();await p.getByRole('button',{name:'Back',exact:true}).click();await p.getByRole('button',{name:'Cancel',exact:true}).click();}
async function create(p){await p.getByRole('button',{name:'Create room',exact:true}).click();for(const slug of characters){await p.locator(`[data-roster-character="${slug}"] .replica-select-control`).click();await p.waitForTimeout(200);}await p.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Ready')||document.body.innerText.includes('Choose a keyboard or gamepad in Players & Controllers first.'));assert.equal(await p.getByRole('button',{name:'Ready',exact:true}).count(),1,'configured human input must create a room and reach Ready');await p.waitForFunction(()=>/^[a-f0-9]{32}$/.test(window.roomJourney.room));return p.evaluate(()=>window.roomJourney.room);}
async function join(p,room){await open(p,'#room='+room);await p.getByRole('button',{name:'Join room',exact:true}).click();await p.getByRole('button',{name:'Ready',exact:true}).waitFor();}
async function playable(p){await p.waitForFunction(()=>window.roomJourney.events.some(e=>e.type==='playable')||document.querySelector('.game-message[role=alert]'),{},{timeout:150000});assert.equal(await p.locator('.game-message[role=alert]').count(),0);assert.ok(await p.evaluate(()=>window.roomJourney.events.some(e=>e.type==='playable')));const f=p.frames().find(f=>f.url().includes('/engine/upstream/runtime.html'));assert.ok(f,'actual native iframe');const start=await f.evaluate(()=>window.Module._direct_frame_count());await f.waitForFunction(n=>window.Module._direct_frame_count()>n+60,start);}
async function start(a,b){await Promise.all([a.evaluate(()=>window.roomJourney.events=[]),b.evaluate(()=>window.roomJourney.events=[])]);await a.getByRole('button',{name:'Ready',exact:true}).click();assert.equal(await a.evaluate(()=>window.roomJourney.events.some(e=>e.type==='playable')),false,'one Ready cannot start a match');await b.getByRole('button',{name:'Ready',exact:true}).click();await Promise.all([playable(a),playable(b)]);}
try{
 const host=await page();await open(host);await disc(host);const room=await create(host);await checkpoint('create-load-and-ready');
 if(only==='pair'){
  const guest=await page();await join(guest,room);await checkpoint('join-link-and-prepare');await start(host,guest);await checkpoint('both-ready-and-native-progress');
  await host.getByRole('button',{name:'Rematch',exact:true}).click();await host.getByRole('button',{name:'Ready',exact:true}).waitFor();const fresh=await host.evaluate(()=>window.roomJourney.room);assert.notEqual(fresh,room,'rematch creates a fresh room');await guest.waitForFunction(()=>!document.querySelector('.game-overlay'));await join(guest,fresh);await start(host,guest);await checkpoint('fresh-rematch-and-native-progress');
  await guest.getByRole('button',{name:'Stop friend match',exact:true}).click();await Promise.all([host.waitForFunction(()=>!document.querySelector('.game-overlay')),guest.waitForFunction(()=>!document.querySelector('.game-overlay'))]);await checkpoint('disconnect-stops-both-and-returns');
  await open(guest,'#room='+fresh);await guest.getByRole('button',{name:'Join room',exact:true}).click();await guest.getByRole('status').filter({hasText:'Room unavailable. Create a fresh room.'}).waitFor();await guest.getByRole('button',{name:'Return to roster',exact:true}).click();await checkpoint('stale-room-rejected-and-rejoin-recovery');
 }
 assert.deepEqual(result.errors,[]);result.complete=true;
}catch(error){result.failure=error.message;for(let i=0;i<pages.length;i++)await pages[i].screenshot({path:resolve(output,'failure-'+i+'.png')}).catch(()=>{});process.exitCode=1;
}finally{
 for(const p of pages){const stop=p.getByRole('button',{name:'Stop friend match',exact:true});if(await stop.count())await stop.click().catch(()=>{});}
 await writeFile(resolve(output,'summary.json'),JSON.stringify(result,null,2)+'\n');await context.close();
}
