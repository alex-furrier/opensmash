import {useEffect,useRef} from 'react';
import {MELEE_TARGETS} from '../shared/melee-targets.js';
import {rosterTabs,supportedBases} from '../shared/melee-roster-choice.js';
import './melee-roster-picker.css';

export function MeleeRosterSelector({value,onChange,loading}){
 return <div className="melee-roster-selector" role="group" aria-label="Choose roster">
  {rosterTabs.map(({id,label})=><button type="button" key={id} aria-pressed={value===id} onClick={()=>onChange(id)}>{label}</button>)}
  {loading&&<span role="status">Checking sources…</span>}
 </div>;
}

export default function MeleeRosterPicker({pick,value,onChange,onClose}){
 const dialog=useRef(null),close=useRef(onClose);close.current=onClose;
 useEffect(()=>{
  const element=dialog.current,previous=document.activeElement;
  element.showModal();element.querySelector('[aria-pressed="true"]')?.focus();
  return()=>{element.close();if(previous?.isConnected)previous.focus();};
 },[]);
 const labels=new Map(MELEE_TARGETS.map(row=>[row.value,row.label]));
 const defaultTarget=pick.character.defaultTarget||pick.character.target;
 const options=supportedBases(pick.character).filter(target=>labels.has(target));
 return <dialog ref={dialog} data-controller-owner={pick.owner?`${pick.owner.key}:${pick.owner.generation}`:undefined} className="melee-base-picker" aria-labelledby="melee-base-title" onCancel={event=>{event.preventDefault();close.current();}} onClick={event=>{if(event.target===event.currentTarget)close.current();}}>
  <header><div><p>{pick.slot} · {pick.character.name}</p><h2 id="melee-base-title">Choose a base fighter</h2></div><button type="button" aria-label="Close base picker" onClick={onClose}>×</button></header>
  <div className="melee-base-options" role="group" aria-label="Validated base fighters">{options.map(target=><button type="button" key={target} aria-pressed={(value==='auto'?defaultTarget:value)===target} onClick={()=>onChange(target===defaultTarget?'auto':target)}>
   {labels.get(target)}{target===defaultTarget?' · Default':''}
  </button>)}</div>
  <p className="melee-base-note">Saved for this player and character. Only tested bases are shown.</p>
 </dialog>;
}
