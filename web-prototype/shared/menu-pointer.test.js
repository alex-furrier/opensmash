import test from 'node:test';
import assert from 'node:assert/strict';
import {pointerStep,menuScrollTarget,startMenuPointer} from '../visual/menu-pointer.js';

const pad=(index=0)=>({index,id:`pad ${index}`,connected:true,axes:[0,0,0,0],buttons:[{pressed:false},{pressed:false}]});
test('right-stick deadzone and release leave cursor and clicks unchanged',()=>{
 const previous={x:50,y:50,down:false,back:false};
 for(const value of [0,.21,-.22]){
  const p=pad();p.axes[3]=value;assert.equal(pointerStep(previous,p,1/60,100,100).scroll,0);
 }
 const p=pad();p.axes[3]=.8;const step=pointerStep(previous,p,1/60,100,100);
 assert.equal(step.scroll,12);assert.equal(step.x,50);assert.equal(step.y,50);assert.equal(step.click,false);
 p.axes[3]=0;assert.equal(pointerStep(step,p,1/60,100,100).scroll,0);
 p.axes[3]=1;assert.equal(pointerStep(step,p,1/60,100,100,false).scroll,0);
});

test('scroll picks the nearest scrollable container and never escapes a dialog',t=>{
 const root={},dialog={contains:node=>node===dialog||node===child},child={parentElement:dialog,scrollHeight:500,clientHeight:100,overflowY:'auto'};
 const style=globalThis.getComputedStyle;globalThis.getComputedStyle=node=>node;t.after(()=>{if(style)globalThis.getComputedStyle=style;else delete globalThis.getComputedStyle;});
 // Node has no DOM globals; restore the temporary document after the assertion.
 const old=globalThis.document;globalThis.document={scrollingElement:root};t.after(()=>{globalThis.document=old;});
 assert.equal(menuScrollTarget(child,dialog),child);
 child.overflowY='visible';assert.equal(menuScrollTarget(child,dialog),dialog);
 assert.equal(menuScrollTarget(null,dialog),dialog);
 assert.equal(menuScrollTarget(child,null),root);
});

test('two menu controllers arbitrate scrolling, preserve cursor edges, and stop when input transfers',t=>{
 const globals=['document','navigator','requestAnimationFrame','innerWidth','innerHeight','getComputedStyle'];
 const saved=globals.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]);
 t.after(()=>{for(const [key,value] of saved)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];});
 let next,active=true,scroll=0,clicks=0;const cursors=[],pads=[pad(0),pad(1)];
 const hit={closest:()=>({disabled:false})},body={append:cursor=>{cursor.parentNode=body;}};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{getGamepads:()=>pads}});
 globalThis.document={hidden:false,body,scrollingElement:{scrollBy:value=>{assert.equal(value.behavior,'instant');scroll+=value.top;}},querySelectorAll:()=>[],elementFromPoint:()=>hit,addEventListener:()=>{},createElement:()=>{
  const cursor={dataset:{},style:{},setAttribute:()=>{},remove:()=>cursor.removed=true};cursors.push(cursor);return cursor;
 }};
 globalThis.getComputedStyle=node=>node;globalThis.innerWidth=1000;globalThis.innerHeight=800;
 globalThis.requestAnimationFrame=callback=>{next=callback;};
 const owners=[0,1].map(port=>({key:`key${port}`,generation:1,index:port,port}));
 startMenuPointer({enabled:()=>active,controllers:()=>owners,click:()=>clicks++,back:()=>{}});
 let now=performance.now();const frame=()=>next(now+=1000/60);
 frame();pads[1].axes[3]=1;frame();assert.ok(scroll>14,'P2 scrolls shared menu when P1 is neutral');
 const before=scroll;pads[0].axes[3]=1;frame();assert.ok(scroll-before<16,'simultaneous pads do not double speed');
 pads[0].buttons[0].pressed=true;frame();frame();assert.equal(clicks,1,'held A still clicks only once');
 active=false;const stopped=scroll;frame();assert.equal(scroll,stopped);assert.ok(cursors.every(c=>c.removed));
 active=true;frame();assert.equal(clicks,1,'held A cannot leak on return');
 globalThis.document.hidden=true;const hidden=scroll;frame();assert.equal(scroll,hidden);
});
