export function pointerStep(previous, pad, dt, width, height, enabled=true) {
 const down=!!pad?.buttons?.[0]?.pressed,back=!!pad?.buttons?.[1]?.pressed;
 const axis=i=>{const v=Number(pad?.axes?.[i])||0;return Math.abs(v)>.22?v:0;};
 const connected=enabled&&!!pad?.connected;
 return {x:Math.max(2,Math.min(width-2,previous.x+(connected?axis(0)*700*dt:0))),
  y:Math.max(2,Math.min(height-2,previous.y+(connected?axis(1)*700*dt:0))),
  down,back,click:connected&&down&&!previous.down,goBack:connected&&back&&!previous.back,
  scroll:connected?axis(3)*900*dt:0,used:connected&&(!!axis(0)||!!axis(1)||down||back||!!axis(3))};
}
export function startMenuPointer({enabled,controllerIndex,back}) {
 const cursor=document.createElement('span');cursor.className='menu-controller-cursor';cursor.hidden=true;cursor.setAttribute('aria-hidden','true');document.body.append(cursor);
 let state={x:innerWidth/2,y:innerHeight/2,down:true,back:true},last=performance.now(),padIdentity;
 function frame(now){
  if(!enabled()){cursor.hidden=true;state.down=true;state.back=true;padIdentity=null;last=now;requestAnimationFrame(frame);return;}
  const index=controllerIndex();
  const pad=index===undefined?null:navigator.getGamepads?.()[index];
  const identity=pad?.connected?`${pad.index}:${pad.id}`:null;
  // Reconnecting or enabling while holding a button must not produce a click.
  if(identity!==padIdentity){state.down=!!pad?.buttons?.[0]?.pressed;state.back=!!pad?.buttons?.[1]?.pressed;padIdentity=identity;}
  state=pointerStep(state,pad,Math.min((now-last)/1000,.05),innerWidth,innerHeight,enabled());last=now;
  if(!enabled()||!pad?.connected)cursor.hidden=true;
  else if(state.used)cursor.hidden=false;
  cursor.style.transform=`translate(${state.x}px,${state.y}px)`;
  const hit=document.elementFromPoint(state.x,state.y);
  if(state.scroll){let scroll=hit;while(scroll&&!(scroll.scrollHeight>scroll.clientHeight&&/(auto|scroll)/.test(getComputedStyle(scroll).overflowY)))scroll=scroll.parentElement;if(scroll)scroll.scrollBy(0,state.scroll);else window.scrollBy(0,state.scroll);}
  if(state.click){const target=hit?.closest('button,a,input,select,textarea,[role="button"]');if(target&&!target.disabled){target.focus({preventScroll:true});target.click();}}
  if(state.goBack)back();
  requestAnimationFrame(frame);
 }
 requestAnimationFrame(frame);
 // A real pointer takes visual ownership immediately.
 document.addEventListener('pointermove',()=>{cursor.hidden=true;},{passive:true});
}
