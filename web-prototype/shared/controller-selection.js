// First slice is deliberately limited to the two human ports proven in Chrome.
export const CONTROLLER_SELECTION_LIMIT = 2;
const keyOf=pad=>`${pad.index}:${pad.id}`;
export function reconcileControllers(state={devices:[],nextGeneration:1},pads=[]) {
 const connected=pads.filter(p=>p&&p.connected!==false&&Number.isInteger(p.index)&&typeof p.id==='string');
 const available=new Map(connected.map(p=>[keyOf(p),p]));
 let nextGeneration=state.nextGeneration;
 const devices=state.devices.filter(d=>available.has(d.key)).map(d=>({...d}));
 for(const pad of connected) {
  const key=keyOf(pad);
  if(!devices.some(d=>d.key===key)&&devices.length<CONTROLLER_SELECTION_LIMIT)devices.push({key,index:pad.index,id:pad.id,generation:nextGeneration++,choice:null,locked:false});
 }
 return {devices:devices.map((d,port)=>({...d,port})),nextGeneration,connectedCount:available.size};
}
function owns(device,owner){return device.key===owner?.key&&device.generation===owner.generation;}
export function lockControllerChoice(state,owner,choice) {
 if(!choice?.slug)return state;
 return {...state,devices:state.devices.map(d=>owns(d,owner)&&!d.locked?{...d,choice:{...choice},locked:true}:d)};
}
export function unlockControllerChoice(state,owner) {
 return {...state,devices:state.devices.map(d=>owns(d,owner)?{...d,locked:false}:d)};
}
export function controllerLaunchChoices(state) {
 return state.devices.length>0&&state.connectedCount<=CONTROLLER_SELECTION_LIMIT&&state.devices.every(d=>d.locked&&d.choice)?state.devices.map(d=>({...d.choice,port:d.port,index:d.index,id:d.id})):null;
}
export function isPrimaryController(state,owner){return !!state.devices[0]&&owns(state.devices[0],owner);}
