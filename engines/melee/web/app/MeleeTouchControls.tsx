import './MeleeTouchControls.css';
import {useEffect,useRef,type MutableRefObject,type PointerEvent} from 'react';
import {createTouchController,touchActions as actions,type TouchPad} from '../lib/touch-pad.mjs';
export default function MeleeTouchControls({pad}:{pad:MutableRefObject<TouchPad>}){
 const deck=useRef<HTMLDivElement>(null);
 const controller=useRef(createTouchController(pad)).current;
 useEffect(()=>{
  const reset=()=>controller.reset();
  const visibility=()=>{if(document.hidden)reset();};
  window.addEventListener('blur',reset);window.addEventListener('pagehide',reset);window.addEventListener('orientationchange',reset);window.addEventListener('resize',reset);document.addEventListener('visibilitychange',visibility);
  return()=>{reset();window.removeEventListener('blur',reset);window.removeEventListener('pagehide',reset);window.removeEventListener('orientationchange',reset);window.removeEventListener('resize',reset);document.removeEventListener('visibilitychange',visibility);};
 },[]);
 const handlers=(kind:string,button?:number)=>({
  onPointerDown:(e:PointerEvent<HTMLElement>)=>controller.begin(e,kind,button),onPointerMove:controller.move,
  onPointerUp:(e:PointerEvent<HTMLElement>)=>controller.release(e.pointerId),onPointerCancel:(e:PointerEvent<HTMLElement>)=>controller.release(e.pointerId),onLostPointerCapture:(e:PointerEvent<HTMLElement>)=>controller.release(e.pointerId)
 });
 return <div ref={deck} className="melee-touch-deck" aria-label="Melee touch controller" onContextMenu={e=>e.preventDefault()}>
  <div className="melee-touch-shoulders">{actions.slice(0,3).map(([label,help,bit])=><button key={label} className={`melee-touch-button touch-${label.toLowerCase()}`} aria-label={`${label}: ${help}`} aria-pressed="false" {...handlers(label,bit)}><span>{label}</span><small>{help}</small></button>)}</div>
  <button className="melee-touch-button touch-taunt" aria-label="D-pad up: taunt" aria-pressed="false" {...handlers('taunt',0x8)}><span>D↑</span><small>Taunt</small></button>
  <button className="melee-touch-stick touch-main" aria-label="Control stick: move" aria-pressed="false" {...handlers('main')}><i/><span>Move</span></button>
  <button className="melee-touch-stick touch-c" aria-label="C-stick: smash attacks" aria-pressed="false" {...handlers('c')}><i/><span>C-stick</span></button>
  <div className="melee-touch-actions">{actions.slice(3).map(([label,help,bit])=><button key={label} className={`melee-touch-button touch-${label.toLowerCase()}`} aria-label={`${label}: ${help}`} aria-pressed="false" {...handlers(label,bit)}><span>{label}</span><small>{help}</small></button>)}</div>
 </div>;
}
