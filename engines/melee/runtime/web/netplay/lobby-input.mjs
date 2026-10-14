// SPDX-License-Identifier: MIT
import {touchActions,createTouchController} from '/engine/touch-pad.mjs';
export const typingTarget=target=>!!target?.closest?.('input,select,textarea,[contenteditable]:not([contenteditable="false"])');
/** Rendering adapter only; all GameCube bits and pointer state are shared with solo. */
export function mountTouchDeck(root,pad){
 const controller=createTouchController(pad),deck=document.createElement('div');deck.className='melee-touch-deck';deck.setAttribute('aria-label','Melee touch controller');
 const button=(kind,label,help,bit,className,parent=deck)=>{
  const element=document.createElement('button');element.type='button';element.className=className;element.setAttribute('aria-label',`${label}: ${help}`);element.setAttribute('aria-pressed','false');
  const span=document.createElement('span');span.textContent=label;element.append(span);
  if(bit){const small=document.createElement('small');small.textContent=help;element.append(small);}else{const knob=document.createElement('i');element.prepend(knob);}
  element.addEventListener('pointerdown',event=>controller.begin(event,kind,bit));element.addEventListener('pointermove',controller.move);
  for(const name of ['pointerup','pointercancel','lostpointercapture'])element.addEventListener(name,event=>controller.release(event.pointerId));parent.append(element);
 };
 const shoulders=document.createElement('div');shoulders.className='melee-touch-shoulders';deck.append(shoulders);
 for(const [label,help,bit] of touchActions.slice(0,3))button(label,label,help,bit,'melee-touch-button touch-'+label.toLowerCase(),shoulders);
 button('taunt','D↑','Taunt',8,'melee-touch-button touch-taunt');button('main','Move','Control stick',undefined,'melee-touch-stick touch-main');button('c','C-stick','Smash attacks',undefined,'melee-touch-stick touch-c');
 const actions=document.createElement('div');actions.className='melee-touch-actions';deck.append(actions);
 for(const [label,help,bit] of touchActions.slice(3))button(label,label,help,bit,'melee-touch-button touch-'+label.toLowerCase(),actions);
 deck.addEventListener('contextmenu',event=>event.preventDefault());root.append(deck);return controller;
}
