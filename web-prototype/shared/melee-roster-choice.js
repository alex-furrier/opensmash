export const rosterChoiceKey='melee-roster-ui-v1';
export const rosterTabs=[{id:'family',label:'Friends and Family'},{id:'high-school',label:'High School'},{id:'all',label:'All'}];
export const rosterScopes=rosterTabs.map(tab=>tab.id);
const rosterDefaultVersion=2;

// Adopt the new default once, preserving per-player base choices and stable IDs.
export function restoreRosterUi(serialized){
 let saved;try{saved=JSON.parse(serialized);}catch{}
 return {defaultVersion:rosterDefaultVersion,
  roster:saved?.defaultVersion===rosterDefaultVersion&&rosterScopes.includes(saved.roster)?saved.roster:'family',
  choices:saved?.choices&&typeof saved.choices==='object'&&!Array.isArray(saved.choices)?saved.choices:{}};
}
export const selectionPort=slot=>Math.max(0,Math.min(3,Number(String(slot).match(/\d/)?.[0]||1)-1));

// Demo clicks reveal the existing prepared trailer; ordinary picks start a game.
export const meleeSelectionAvailable=(rows,{demo=false}={})=>demo||rows.every(row=>row?.meleeAvailable===true);

export function supportedBases(row){
 const fallback=row.defaultTarget||row.target;
 return [...new Set(row.supportedTargets||[fallback])].filter(Boolean);
}

export function chosenBase(row,choices,slot,fallback='auto'){
 const target=choices?.[selectionPort(slot)]?.[row.slug]??fallback;
 if(!row.supportedTargets)return target;
 return target==='auto'||supportedBases(row).includes(target)?target:'auto';
}

export function rememberBase(choices,row,slot,target){
 if(target!=='auto'&&!supportedBases(row).includes(target))throw Error('Choose a validated base for this fighter.');
 const port=selectionPort(slot);
 return {...choices,[port]:{...choices?.[port],[row.slug]:target}};
}

// Public catalog membership does not imply that a Melee source is installed.
export function meleeGridRoster(catalog,active,available,scope,loading=false){
 const installed=new Map(available.map(row=>[row.slug,row]));
 const rank=row=>Number.isInteger(row.rosterOrder)&&row.rosterOrder>=0?row.rosterOrder:Infinity;
 const ordered=[...active].sort((a,b)=>rank(a)-rank(b));
 const rows=scope==='all'?[...ordered,...catalog.filter(row=>!active.some(local=>local.slug===row.slug))]:ordered.filter(row=>(row.rosterCategory||'high-school')===scope);
 return rows.map(row=>({...row,...(row.imported||!installed.has(row.slug)||row.portraitTile||row.portrait?{}:{portraitTile:'/melee/api/source-portraits/'+encodeURIComponent(row.slug)+'.webp'}),...(installed.has(row.slug)?{target:installed.get(row.slug).target,defaultTarget:installed.get(row.slug).defaultTarget,supportedTargets:installed.get(row.slug).supportedTargets}:{}),
  meleeAvailable:installed.has(row.slug),meleeAvailability:loading?'Checking source…':installed.has(row.slug)?'':'Source unavailable'}));
}
