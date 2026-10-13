export const rosterChoiceKey='melee-roster-ui-v1';
export const rosterScopes=['all','high-school'];
export const selectionPort=slot=>Math.max(0,Math.min(3,Number(String(slot).match(/\d/)?.[0]||1)-1));

export function supportedBases(row){
 const fallback=row.defaultTarget||row.target;
 return [...new Set(row.supportedTargets||[fallback])].filter(Boolean);
}

export function chosenBase(row,choices,slot,fallback='auto'){
 const target=choices?.[selectionPort(slot)]?.[row.slug]??fallback;
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
 const rows=scope==='high-school'?active:[...active,...catalog.filter(row=>!active.some(local=>local.slug===row.slug))];
 return rows.map(row=>({...row,...(installed.has(row.slug)?{target:installed.get(row.slug).target,defaultTarget:installed.get(row.slug).defaultTarget,supportedTargets:installed.get(row.slug).supportedTargets}:{}),
  meleeAvailable:installed.has(row.slug),meleeAvailability:loading?'Checking source…':installed.has(row.slug)?'':'Source unavailable'}));
}
