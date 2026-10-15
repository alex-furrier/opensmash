import {installedMatchIdentity} from '../../runtime/web/netplay/match-identity.mjs';
import {createLaunchDiagnostics} from '../lib/launch-diagnostics.mjs';
import {localOpponentStatus} from '../lib/local-opponent-status.mjs';
import MeleeTouchControls from './MeleeTouchControls';
import {resolveRenderWidth} from '../lib/render-resolution.mjs';
import {neutralTouchPad} from '../lib/touch-pad';
import {MeleeFrameWorker} from '@/lib/melee-frame-worker';
import {gameInputBlocked} from '../lib/controls';
import {meleePath} from '../lib/paths.ts';
import {prepareNativeCostume} from '../lib/native-fit';
import {useEffect,useRef,useState} from 'react';
import {plan,schema,type Settings} from '@/lib/launch';
import type {Fighter} from '../lib/fighter';
import {names,fighterLabel} from '../lib/fighter';
import {connectAudio,unlockAudio,setAudioEnabled} from '@/lib/audio';
import {stopAnnouncer} from '@/lib/announcer';
import {claimMelee,releaseMelee} from '@/lib/melee-session';
import {keyLabel,loadBindings,rawGamepads,sampleMeleePad,type Action} from '@/lib/controls';
// GameCube button bits in the pad word, keyed by the control id from the bindings module.
const bits:Record<string,number>={a:0x100,b:0x200,x:0x400,y:0x800,z:0x10,l:0x40,r:0x20,start:0x1000};
export default function Game({fighter,settings,roster,onClose,soundOn=true,chrome=true,holdForTrailer=false,trailerReveal=false,onTrailerReady,onTrailerStatus,room,onRematch}:{room?:any;onRematch?:()=>void;fighter:Fighter;settings:Settings;roster:Fighter[];onClose:()=>void;soundOn?:boolean;chrome?:boolean;holdForTrailer?:boolean;trailerReveal?:boolean;onTrailerReady?:()=>void;onTrailerStatus?:(status:string)=>void}){
 const closeCallback=useRef(onClose);closeCallback.current=onClose;
 const matchMode=room?.launch?.mode??settings.mode;
 const matchTarget=room?.launch?.ports[room.assignment.player]?.target||(settings.ports[0].target&&settings.ports[0].target!=='auto'?settings.ports[0].target:fighter.target);
 useEffect(()=>{setAudioEnabled(soundOn);},[soundOn]);
 const canvas=useRef<HTMLCanvasElement>(null),[status,setStatus]=useState('Preparing '+fighterLabel(fighter)+'…'),[error,setError]=useState(''),[fps,setFps]=useState<number|null>(null),[attempt,setAttempt]=useState(0);
 useEffect(()=>{onTrailerStatus?.(error||status||'Preparing the VS screen…');},[error,status,onTrailerStatus]);
 const [ownsInput,setOwnsInput]=useState(false);
 const [awaitingReady,setAwaitingReady]=useState(false);const readyClick=useRef<(()=>void)|undefined>(undefined);
 const gameWorker=useRef<Worker|undefined>(undefined);
 const launchDiagnostics=useRef<ReturnType<typeof createLaunchDiagnostics>|undefined>(undefined);
 useEffect(()=>{if(trailerReveal){launchDiagnostics.current?.resumeTrailer();gameWorker.current?.postMessage({type:'trailer-reveal'});}},[trailerReveal]);
 const trailerReadyCallback=useRef(onTrailerReady);trailerReadyCallback.current=onTrailerReady;
 const trailerVisible=useRef(trailerReveal);trailerVisible.current=trailerReveal;
 const touch=useRef(neutralTouchPad());
 const bindings=loadBindings(),kb=bindings.keyboard;
 useEffect(()=>{
  setOwnsInput(false);
  let worker:Worker|undefined,audioNode:AudioNode|undefined,raf=0,closed=false;const abort=new AbortController(),keys=new Set<string>(),requestedAt=Date.now();
  let playable=matchMode!==0, audioConnecting=false;
  let running=false,firstFrame=true,selectionAcknowledged=false,fullBootVisible=false,frameSamples:number[]=[],launchPlan:any;
  const skin='host';
  const diagnostics=createLaunchDiagnostics();launchDiagnostics.current=diagnostics;
  const publishDiagnostics=()=>{(window as any).meleeLaunchDiagnostics=diagnostics.snapshot();};
  const failLaunch=(message:string)=>{if(closed||abort.signal.aborted)return;diagnostics.observe({type:'error',message});publishDiagnostics();abort.abort();running=false;setOwnsInput(false);clearInterval(watchdog);cancelAnimationFrame(raf);audioNode?.disconnect();stopAnnouncer();room?.connection.stop(message);worker?.terminate();setError(message);};
  const watchdog=setInterval(()=>{if(closed)return;const error=diagnostics.expired();publishDiagnostics();if(error)failLaunch(error);},1000);
  diagnostics.arm('Preparing fighters');
  const send=(schedule=true)=>{
   if(worker&&running){
    // Modal visibility is constant for this input sample. Querying layout for
    // every button and axis multiplies main-thread work during gameplay.
    const blocked=gameInputBlocked()||(holdForTrailer&&!trailerVisible.current);
    for(let port=0;port<4;port++){
    if(room&&port!==0)continue;
    const device=room?room.localDevice:launchPlan?.ports[port]?.device;
    if(device==='off'||device==='cpu') {worker.postMessage({type:'pad',values:[port,0,0x80808080,0,0]});continue;}
    // A port assigned to a gamepad the browser does not currently expose
    // (Chrome hides pads until a button press) would otherwise be dead. Let
    // the keyboard drive it when no port is bound to the keyboard.
    const ownedIds=!room&&(settings as any).ownedControllerIds;
    const ownedPad=(p:any)=>p?.connected&&p.index===Number(device.slice(7))&&(!ownedIds||p.id===ownedIds[port]);
    const padPresent=device?.startsWith('gamepad')&&rawGamepads().some(ownedPad);
    const keyboardHere=device==='keyboard'||(device?.startsWith('gamepad')&&!ownedIds&&!padPresent&&(!!room||!launchPlan?.ports.some((p:any)=>p?.device==='keyboard')));
    const held=(action:Action)=>!blocked&&keyboardHere&&keys.has(kb[action]);
    let buttons=0;for(const [action,bit] of Object.entries(bits))if(held(action as Action))buttons|=bit;
    let x=128+((held('right')?1:0)-(held('left')?1:0))*100;
    let y=128+((held('up')?1:0)-(held('down')?1:0))*100;
    let cx=128+((held('cright')?1:0)-(held('cleft')?1:0))*100;
    let cy=128+((held('cup')?1:0)-(held('cdown')?1:0))*100;
    let l=0,r=0;
    const pad=device?.startsWith('gamepad')?rawGamepads().find(ownedPad):null;
    if(pad&&!blocked){
     const sample=sampleMeleePad(pad);
     buttons|=sample[2];x=128+sample[3];y=128+sample[4];cx=128+sample[5];cy=128+sample[6];l=sample[7];r=sample[8];
    }
    const mobile=port===0&&!blocked?touch.current:null;
    if(mobile){buttons|=mobile.buttons;if(mobile.main){x=128+mobile.x;y=128+mobile.y;}if(mobile.c){cx=128+mobile.cx;cy=128+mobile.cy;}if(mobile.buttons&0x40)l=255;if(mobile.buttons&0x20)r=255;}
    if(room)worker.postMessage({type:'input',values:[0,buttons,x-128,y-128,cx-128,cy-128,l,r,1]});
    else worker.postMessage({type:'pad',values:[port,buttons,(x|(y<<8)|(cx<<16)|(cy<<24))>>>0,l|(r<<8),keyboardHere||!!pad||!!mobile?.active?1:0]});
    }
   }if(schedule)raf=requestAnimationFrame(()=>send());
  };
  const code=(e:KeyboardEvent)=>e.code||(/^[a-z]$/i.test(e.key)?'Key'+e.key.toUpperCase():/^[0-9]$/.test(e.key)?'Digit'+e.key:e.key===' '?'Space':e.key);
  const bound=new Set(Object.values(kb));
  const keydown=(e:KeyboardEvent)=>{if((holdForTrailer&&!trailerVisible.current)||gameInputBlocked()||(e.target instanceof HTMLElement&&e.target.matches('input,select,textarea,[contenteditable=true]')))return;const key=code(e);if(bound.has(key)){e.preventDefault();keys.add(key);send(false);}};
  const keyup=(e:KeyboardEvent)=>{keys.delete(code(e));send(false);};
  const blur=()=>{keys.clear();touch.current=neutralTouchPad();if(room){worker?.postMessage({type:'input',values:[0,0,0,0,0,0,0,0,1]});return;}for(let port=0;port<4;port++)worker?.postMessage({type:'pad',values:[port,0,0x80808080,0,launchPlan?.ports[port]?.device==='keyboard'?1:0]});};
  window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',blur);
  async function start(){try{
   if(!crossOriginIsolated||!canvas.current?.transferControlToOffscreen)throw Error('This browser needs shared memory and OffscreenCanvas support. Open the local game in Chrome.');
   const session=claimMelee(canvas.current||undefined,!!room);worker=session.worker;gameWorker.current=worker;
   if(worker instanceof MeleeFrameWorker&&canvas.current)worker.attachSurface(canvas.current);
   launchPlan=room?.launch||plan(settings,fighter,roster);
   if(new URLSearchParams(location.search).get('benchmark')==='1') {
    launchPlan.packedPorts=launchPlan.packedPorts.map((p:number,i:number)=>i<2?(p&~0xff00)|256:p);
    launchPlan.stocks=20;
   }
   let preparedCostumes=0;const costumeTotal=launchPlan.costumes.length;
   if(costumeTotal)setStatus(`Preparing fighters… 0/${costumeTotal}`);
   // Menus depend on the selected identities, not on completed costume fitting.
   // Observe both tasks together so failures and cancellation cannot leave an
   // unhandled rejection while the other task is still preparing.
   const [costumes,cssAssets]=await Promise.all([
    Promise.all(launchPlan.costumes.map(async (entry:any)=>{
     const costume=await prepareNativeCostume(entry,abort.signal);
     if(!closed){
      preparedCostumes++;
      setStatus(preparedCostumes===costumeTotal?'Preparing character select…':`Preparing fighters… ${preparedCostumes}/${costumeTotal}`);
     }
     return costume;
    })),
    (async()=>{
     if(!costumeTotal)return [];
     const response=await meleeFetch('/api/character-select',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({costumes:launchPlan.costumes,sourceOnly:true}),signal:abort.signal});
     const prepared=await response.json();if(!response.ok)throw Error(prepared.error||'Character select could not be prepared.');
     return Promise.all(prepared.assets.map(async(entry:{filename:string;url:string})=>{
      const asset=await meleeFetch(entry.url,{signal:abort.signal});if(!asset.ok)throw Error('Character select assets could not load.');
      return {filename:entry.filename,blob:await asset.blob()};
     }));
    })(),
   ]);
   setStatus('Loading Melee…');diagnostics.arm('Loading Melee');if(closed)return;
   const audio=session.audio;
   const startAudio=()=>{if(audioConnecting)return;audioConnecting=true;connectAudio(audio).then(node=>{if(closed||abort.signal.aborted)node.disconnect();else audioNode=node;}).catch(error=>{audioConnecting=false;console.warn('[Melee audio]',error);});};
   startAudio();
   worker.onerror=e=>failLaunch(e.message||'The game worker stopped.');
   worker.onmessage=({data})=>{
    if(closed||abort.signal.aborted)return;
    diagnostics.observe(data);
    if(data.type==='frame'){if(data.bitmap)canvas.current?.getContext('bitmaprenderer')?.transferFromImageBitmap(data.bitmap);if(firstFrame){firstFrame=false;if(!holdForTrailer||trailerVisible.current)canvas.current?.focus();}}
    if(data.type==='session' && data.launch)selectionAcknowledged=true;
    if(data.type==='frame' && matchMode===4 && selectionAcknowledged && !fullBootVisible){fullBootVisible=true;setStatus('');}
    if(data.type==='status' && !fullBootVisible)setStatus(data.message);
    if(data.type==='started'){running=true;setOwnsInput(true);}
    if(data.type==='trailer-ready')trailerReadyCallback.current?.();
    if(data.type==='intro'){if(holdForTrailer&&!trailerVisible.current){setError('The deployed Melee runtime does not support trailer preloading. Deploy the updated engine input release, then reload this page.');return;}stopAnnouncer();setStatus('');startAudio();}
    if(data.type==='playable'){playable=true;setStatus('');startAudio();if(!gameInputBlocked())canvas.current?.focus({preventScroll:true});}
    // Native GS_RESULTS follows the finished VS match, including sudden death.
    // Other launch modes intentionally retain their own native menu lifecycle.
    if(data.type==='progress'&&matchMode===0&&playable&&data.sceneKind===5){
     closed=true;running=false;blur();cancelAnimationFrame(raf);setOwnsInput(false);
     if(document.fullscreenElement)void document.exitFullscreen().catch(()=>{});
     closeCallback.current();return;
    }
    if(data.type==='error')failLaunch(data.message||'Melee initialization failed without an error message.');
    if(data.type==='log'){console.log('[Melee]',data.text);if(playable&&data.text.includes('[opensmash] destination ready'))setStatus('');}
    if(data.type==='metrics'){
     setFps(playable&&data.completeCombatInterval!==false&&data.combatFrames>0?data.fps:null);frameSamples.push(...data.frameTimes);if(frameSamples.length>36000)frameSamples=frameSamples.slice(-36000);
     (window as any).meleePerformance={frames:data.frames,fps:data.fps,frameTimes:frameSamples};
    }
   };
   await session.ready;if(closed||abort.signal.aborted)return;diagnostics.pause();
   let netplay;
   if(room){
    const verified=session.identity;if(!verified)throw Error('Runtime verification unavailable.');
    const identity=await installedMatchIdentity(verified.verifiedEngine,launchPlan,{verifiedDisc:verified.verifiedDiscHash,installedSeed:verified.seed,freshSaves:verified.freshSaves,costumes,cssAssets});
    if(closed)return;setStatus('Your game and fighters are verified. Press Ready.');setAwaitingReady(true);
    await new Promise<void>(resolve=>{readyClick.current=resolve;});if(closed)return;setAwaitingReady(false);setStatus(room.assignment.testBot?'Waiting for the local opponent…':'Waiting for your friend…');
    netplay=await room.connection.ready(identity,(state:{opponentPhase?:string})=>{if(!closed&&room.assignment.testBot)setStatus(localOpponentStatus(state));});if(closed)return;
   }
   if(abort.signal.aborted)return;diagnostics.arm('Starting Melee');running=true;setOwnsInput(true);
   const selection={type:'select',...(netplay?{netplay}:{}),holdForTrailer,renderWidth:resolveRenderWidth(settings.renderWidth),requestedAt,warmReadyBeforeClick:session.readyAt<=requestedAt,character:fighter.slug,skin,fighter:launchPlan.ports[0].fighter,launch:launchPlan,costumes,cssAssets};
   if(worker instanceof MeleeFrameWorker)worker.postMessage(selection,netplay?[netplay.port]:[]);else worker.postMessage(selection,netplay?[netplay.port]:[]);
   raf=requestAnimationFrame(()=>send());
  }catch(e){failLaunch((e as Error)?.message||String(e||'Melee could not start.'));}}
  // StrictMode replays setup/cleanup synchronously. Claim the warmed engine
  // only after that replay so the discarded effect cannot terminate it.
  queueMicrotask(()=>{if(!closed)void start();});
  return()=>{closed=true;clearInterval(watchdog);publishDiagnostics();if(launchDiagnostics.current===diagnostics)launchDiagnostics.current=undefined;readyClick.current?.();readyClick.current=undefined;abort.abort();if(worker)room?.connection.stop();cancelAnimationFrame(raf);if(worker)releaseMelee(worker);audioNode?.disconnect();window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',blur);touch.current=neutralTouchPad();};
 },[fighter,settings,roster,attempt,holdForTrailer,room]);
 return <div className="game-overlay" data-melee-input-owned={ownsInput} role="region" aria-label={'Play as '+fighterLabel(fighter)}><section className="game-panel">{chrome&&<header className="game-toolbar"><div className="game-title"><h2 title={fighterLabel(fighter)}>{fighterLabel(fighter)}</h2><p title={`${names[matchTarget]} moveset · ${schema.modes.find(m=>m.id===matchMode)?.label}`}>Base: {names[matchTarget]} · {schema.modes.find(m=>m.id===matchMode)?.label}</p>{room?.assignment.testBot&&<small className="game-peer-label">Local simulated opponent</small>}</div><span className="fps" data-slow={fps!==null&&fps<58.5} title="Target: sustained 60 FPS in combat">{fps===null?'':Math.round(fps)+' FPS'}</span><div className="game-toolbar-actions" role="group" aria-label="Match controls">{!room&&<><button className="sound-game" aria-label="Enable sound" title="Enable sound" onClick={()=>void unlockAudio()}>Sound</button><button className="confirm-game" aria-label="Confirm · A" title="Confirm · A" onClick={()=>gameWorker.current?.postMessage({type:'confirm'})}>A</button></>}<button title="Toggle fullscreen" onClick={()=>{const panel=canvas.current?.closest('.game-surface-shell')||canvas.current?.closest('.game-panel');if(document.fullscreenElement)void document.exitFullscreen();else void panel?.requestFullscreen();}} aria-label="Toggle fullscreen">⛶</button><button onClick={()=>{if(document.fullscreenElement)void document.exitFullscreen();onClose();}} title={room?'Stop friend match':'Return to roster'} aria-label={room?'Stop friend match':'Return to roster'}>{room?'Stop':'✕'}</button>{room&&onRematch&&<button onClick={onRematch} aria-label="Rematch" title="Rematch">↻</button>}{room&&!room.assignment.testBot&&<button aria-label="Copy room link" title="Copy room link" onClick={()=>void navigator.clipboard.writeText(location.origin+'/melee#room='+room.assignment.room)}>↗</button>}</div></header>}<div className="game-screen"><canvas id="canvas" key={attempt} ref={canvas} width={960} height={720} tabIndex={0}/>{status&&!error&&<div className="game-message" role="status"><p>{status}</p>{awaitingReady&&<button onClick={()=>void unlockAudio().then(()=>readyClick.current?.())}>Ready</button>}</div>}{error&&<div className="game-message" role="alert"><p>{error.split('\n')[0]}</p>{error.includes('\n')&&<details className="game-error-details"><summary>Details</summary><pre>{error.slice(error.indexOf('\n')+1)}</pre></details>}<button onClick={()=>{setError('');setStatus('Preparing…');setFps(null);setAttempt(n=>n+1);}}>Try again</button></div>}</div>{chrome&&<p className="game-help">{[keyLabel(kb.up),keyLabel(kb.left),keyLabel(kb.down),keyLabel(kb.right)].join(' ')} move · {keyLabel(kb.a)} attack · {keyLabel(kb.b)} special · {keyLabel(kb.x)} / {keyLabel(kb.y)} jump · {keyLabel(kb.l)} / {keyLabel(kb.r)} shield · {keyLabel(kb.z)} grab · {[kb.cup,kb.cleft,kb.cdown,kb.cright].map(keyLabel).join(' ')} smash · {keyLabel(kb.start)} start / pause<br/>Rebind keys and gamepads in Settings → Players &amp; Controllers. Press {keyLabel(kb.a)} to confirm any first-run memory card prompt.</p>}<MeleeTouchControls pad={touch}/></section></div>;
}

function meleeFetch(input:string, init?:RequestInit){return fetch(meleePath(input),init);}
