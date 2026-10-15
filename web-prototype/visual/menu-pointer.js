export function pointerStep(previous, pad, dt, width, height, enabled=true) {
 const down=!!pad?.buttons?.[0]?.pressed,back=!!pad?.buttons?.[1]?.pressed;
 const axis=i=>{const v=Number(pad?.axes?.[i])||0;return Math.abs(v)>.22?v:0;};
 const connected=enabled&&!!pad?.connected;
 return {x:Math.max(2,Math.min(width-2,previous.x+(connected?axis(0)*700*dt:0))),
  y:Math.max(2,Math.min(height-2,previous.y+(connected?axis(1)*700*dt:0))),
  down,back,click:connected&&down&&!previous.down,goBack:connected&&back&&!previous.back,
  scroll:connected?axis(3)*900*dt:0,used:connected&&(!!axis(0)||!!axis(1)||down||back||!!axis(3))};
}
// Match the element under the cursor, but never scroll the page behind a modal.
export function menuScrollTarget(hit, dialog) {
 for(let node=hit;node;node=node.parentElement){
  if(dialog&&!dialog.contains(node))break;
  if(node.scrollHeight>node.clientHeight&&/(auto|scroll)/.test(getComputedStyle(node).overflowY))return node;
  if(node===dialog)break;
 }
 if(dialog)return dialog;
 return document.scrollingElement;
}
export function startMenuPointer({enabled,controllers,controllerIndex,click,back}) {
 const states=new Map();let last=performance.now();
 function frame(now){
  const active=!document.hidden&&enabled(),owners=active?(controllers?.()||[{key:'primary',generation:0,index:controllerIndex(),port:0}]):[];
  const keys=new Set(owners.map(o=>`${o.key}:${o.generation}`));
  for(const [key,value] of states)if(!keys.has(key)){value.cursor.remove();states.delete(key);}
  const pads=active?Array.from(navigator.getGamepads?.()||[]):[];
  const dialog=Array.from(document.querySelectorAll('dialog[open],[role="dialog"][aria-modal="true"]')).find(node=>node.getClientRects().length),surface=dialog||document.body;
  let scrolling;
  for(const owner of owners){
   const key=`${owner.key}:${owner.generation}`,pad=pads.find(p=>p?.connected&&p.index===owner.index&&(!owner.id||p.id===owner.id));
   if(!pad)continue;
   let entry=states.get(key);
   if(!entry){const cursor=document.createElement('span');cursor.className='menu-controller-cursor';cursor.dataset.player=String(owner.port+1);cursor.textContent=`${owner.port+1}P`;cursor.setAttribute('aria-hidden','true');surface.append(cursor);entry={cursor,state:{x:innerWidth/2+owner.port*36,y:innerHeight/2,down:!!pad.buttons?.[0]?.pressed,back:!!pad.buttons?.[1]?.pressed}};states.set(key,entry);}
   const {cursor}=entry;
   cursor.dataset.player=String(owner.port+1);cursor.textContent=`${owner.port+1}P`;
   if(cursor.parentNode!==surface){surface.append(cursor);if(dialog){const box=dialog.getBoundingClientRect();entry.state.x=box.x+box.width/2;entry.state.y=box.y+box.height/2;}}
   const state=entry.state=pointerStep(entry.state,pad,Math.min((now-last)/1000,.05),innerWidth,innerHeight,true);
   cursor.hidden=!!dialog&&(dialog.dataset.controllerOwner?dialog.dataset.controllerOwner!==key:owner.port!==0);cursor.style.transform=`translate(${state.x}px,${state.y}px)`;
   const hit=document.elementFromPoint(state.x,state.y);
   if(state.scroll&&!cursor.hidden&&(!scrolling||owner.port<scrolling.port))scrolling={hit,delta:state.scroll,port:owner.port};
   if(state.click&&!cursor.hidden){const target=hit?.closest('button,a,input,select,textarea,[role="button"]');if(target&&!target.disabled)click(target,owner);}
   if(state.goBack)back(owner);
  }
  // The rAF deltas already make a continuous glide. CSS smooth scrolling would
  // restart an animation every frame and swallow most of the stick movement.
  // One active owner per frame also prevents two pads from doubling the speed.
  if(scrolling)menuScrollTarget(scrolling.hit,dialog)?.scrollBy({top:scrolling.delta,left:0,behavior:'instant'});
  last=now;requestAnimationFrame(frame);
 }
 requestAnimationFrame(frame);
 document.addEventListener('pointermove',()=>{for(const {cursor} of states.values())cursor.hidden=true;},{passive:true});
}
