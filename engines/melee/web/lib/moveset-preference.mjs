// Old global Mario settings predate varied character defaults. A current UI
// save makes subsequent explicit overrides distinguishable from that legacy value.
export const movesetPreferenceVersion=1;
export function resolveMovesetPreference(saved,requested,targets){
 if(requested&&targets.some(row=>row.slug===requested))return requested;
 const target=saved.ports?.[0]?.target||'auto';
 const explicit=Number.isInteger(saved.movesetPreferenceVersion)&&saved.movesetPreferenceVersion>=movesetPreferenceVersion;
 if(target==='mario'&&!explicit)return 'auto';
 return target==='auto'||targets.some(row=>row.slug===target)?target:'auto';
}
