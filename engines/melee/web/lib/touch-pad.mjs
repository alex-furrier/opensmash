// Shared by the ordinary Melee controller and the standalone lobby.
export const touchActions=Object.freeze([['L','Shield',0x40],['Start','Pause',0x1000],['Z','Grab',0x10],['X','Jump',0x400],['B','Special',0x200],['A','Attack',0x100]]);
export const neutralTouchPad=()=>({buttons:0,x:0,y:0,cx:0,cy:0,main:false,c:false,active:false});
export function stickVector(dx,dy,radius){
 if(!Number.isFinite(dx+dy+radius)||radius<=0)return{x:0,y:0};
 const distance=Math.hypot(dx,dy),strength=Math.min(1,Math.max(0,(distance/radius-.16)/.84));
 return distance?{x:Math.round(dx/distance*strength*100)||0,y:Math.round(-dy/distance*strength*100)||0}:{x:0,y:0};
}
/** Caller owns DOM listeners. Pointer state and GameCube mapping are shared. */
export function createTouchController(pad){
 const pointers=new Map();
 const refresh=()=>{pad.current.buttons=[...pointers.values()].reduce((bits,p)=>bits|(p.button||0),0);pad.current.active=pointers.size>0;};
 const move=e=>{const p=pointers.get(e.pointerId);if(!p||p.button)return;
  const radius=p.rect.width*.36,dx=e.clientX-p.rect.left-p.rect.width/2,dy=e.clientY-p.rect.top-p.rect.height/2;
  const {x,y}=stickVector(dx,dy,radius),scale=Math.min(1,radius/(Math.hypot(dx,dy)||1));
  if(p.kind==='main'){pad.current.x=x;pad.current.y=y;pad.current.main=true;}else{pad.current.cx=x;pad.current.cy=y;pad.current.c=true;}
  p.element.style.setProperty('--dx',`${dx*scale}px`);p.element.style.setProperty('--dy',`${dy*scale}px`);
 };
 const release=id=>{const p=pointers.get(id);if(!p)return;pointers.delete(id);
  if(p.kind==='main'){pad.current.x=pad.current.y=0;pad.current.main=false;}if(p.kind==='c'){pad.current.cx=pad.current.cy=0;pad.current.c=false;}
  if(![...pointers.values()].some(other=>other.element===p.element)){p.element.setAttribute('aria-pressed','false');p.element.style.setProperty('--dx','0px');p.element.style.setProperty('--dy','0px');}refresh();
 };
 return{move,release,reset(){for(const id of [...pointers.keys()])release(id);pad.current=neutralTouchPad();},
  begin(e,kind,button){e.preventDefault();if(!button&&[...pointers.values()].some(p=>p.kind===kind))return;
   const element=e.currentTarget,rect=element.getBoundingClientRect();element.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{kind,button,element,rect});element.setAttribute('aria-pressed','true');move(e);refresh();}
 };
}
