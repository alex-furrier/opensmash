// Choices belong to physical port labels, including duplicate fighter picks.
export function reconcileSelection(previous, slots, context) {
 if (previous?.context !== context) return {context, slots, active:slots[0], picks:{}};
 const picks=Object.fromEntries(slots.filter(slot=>previous.picks[slot]).map(slot=>[slot,previous.picks[slot]]));
 return {...previous,slots,picks,active:slots.includes(previous.active)?previous.active:slots[0]};
}
export function selectFighter(state, fighter) {
 if(!state.slots.includes(state.active))return state;
 const picks={...state.picks,[state.active]:{...fighter,slot:state.active}};
 return {...state,picks,active:state.slots.find(slot=>!picks[slot])||state.active};
}
export function readyFighters(state) {
 return state.slots.length&&state.slots.every(slot=>state.picks[slot])?state.slots.map(slot=>state.picks[slot]):null;
}

export function p1MenuController(plan) {return plan[0]?.kind==='gamepad'?plan[0].index:undefined;}
