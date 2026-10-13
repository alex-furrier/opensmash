// Old global Mario settings predate varied character defaults. A current UI
// save makes subsequent explicit overrides distinguishable from that legacy value.
export const movesetPreferenceVersion=1;
export function resolveMovesetPreference(saved,requested,targets){
 return resolvePortMovesets(saved,requested,targets,[saved.ports?.[0]||{}])[0].target;
}

export function resolvePortMovesets(saved,requested,targets,ports){
 if(requested&&targets.some(row=>row.slug===requested))return ports.map(port=>({...port,target:requested}));
 const explicit=Number.isInteger(saved.movesetPreferenceVersion)&&saved.movesetPreferenceVersion>=movesetPreferenceVersion;
 return ports.map(port=>({...port,target:port.target==='mario'&&!explicit?'auto':
  port.target==='auto'||targets.some(row=>row.slug===port.target)?port.target:'auto'}));
}
