export function pointerStep(previous, pad, dt, width, height, enabled=true) {
 const down=!!pad?.buttons?.[0]?.pressed,back=!!pad?.buttons?.[1]?.pressed;
 const axis=i=>{const v=Number(pad?.axes?.[i])||0;return Math.abs(v)>.22?v:0;};
 const connected=enabled&&!!pad?.connected;
 return {x:Math.max(2,Math.min(width-2,previous.x+(connected?axis(0)*700*dt:0))),
  y:Math.max(2,Math.min(height-2,previous.y+(connected?axis(1)*700*dt:0))),
  down,back,click:connected&&down&&!previous.down,goBack:connected&&back&&!previous.back,
  scroll:connected?axis(3)*900*dt:0,used:connected&&(!!axis(0)||!!axis(1)||down||back||!!axis(3))};
}
export function startMenuPointer({enabled,controllers,controllerIndex,click,back}) {
 const states=new Map();let last=performance.now();
 function frame(now){
  const active=enabled(),owners=active?(controllers?.()||[{key:'primary',generation:0,index:controllerIndex(),port:0}]):[];
  const keys=new Set(owners.map(o=>`${o.key}:${o.generation}`));
  for(const [key,value] of states)if(!keys.has(key)){value.cursor.remove();states.delete(key);}
  const pads=active?Array.from(navigator.getGamepads?.()||[]):[];
  const dialog=document.querySelector('dialog[open]'),surface=dialog||document.body;
  for(const owner of owners){
   const key=`${owner.key}:${owner.generation}`,pad=pads.find(p=>p?.connected&&p.index===owner.index&&(!owner.id||p.id===owner.id));
   if(!pad)continue;
   let entry=states.get(key);
   if(!entry){const cursor=document.createElement('span');cursor.className='menu-controller-cursor';cursor.dataset.player=String(owner.port+1);cursor.textContent=`${owner.port+1}P`;cursor.setAttribute('aria-hidden','true');surface.append(cursor);entry={cursor,state:{x:innerWidth/2+owner.port*36,y:innerHeight/2,down:!!pad.buttons?.[0]?.pressed,back:!!pad.buttons?.[1]?.pressed}};states.set(key,entry);}
   const {cursor}=entry;
   cursor.dataset.player=String(owner.port+1);cursor.textContent=`${owner.port+1}P`;
   if(cursor.parentNode!==surface){surface.append(cursor);if(dialog){const box=dialog.getBoundingClientRect();entry.state.x=box.x+box.width/2;entry.state.y=box.y+box.height/2;}}
   const state=entry.state=pointerStep(entry.state,pad,Math.min((now-last)/1000,.05),innerWidth,innerHeight,true);
   cursor.hidden=!!dialog&&owner.port!==0;cursor.style.transform=`translate(${state.x}px,${state.y}px)`;
   const hit=document.elementFromPoint(state.x,state.y);
   if(state.scroll&&owner.port===0){let scroll=hit;while(scroll&&!(scroll.scrollHeight>scroll.clientHeight&&/(auto|scroll)/.test(getComputedStyle(scroll).overflowY)))scroll=scroll.parentElement;if(scroll)scroll.scrollBy(0,state.scroll);else window.scrollBy(0,state.scroll);}
   if(state.click&&!cursor.hidden){const target=hit?.closest('button,a,input,select,textarea,[role="button"]');if(target&&!target.disabled)click(target,owner);}
   if(state.goBack)back(owner);
  }
  last=now;requestAnimationFrame(frame);
 }
 requestAnimationFrame(frame);
 document.addEventListener('pointermove',()=>{for(const {cursor} of states.values())cursor.hidden=true;},{passive:true});
}
