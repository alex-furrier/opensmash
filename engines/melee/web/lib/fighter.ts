import schema from '../../runtime/launch-options.json';
export type Fighter = {slug:string;name:string;displayName?:string;randomReady?:boolean;short:string;target:string;review?:boolean;portrait?:string;imported?:boolean};
export const fighterLabel=(fighter:Fighter)=>fighter.displayName||fighter.name;
export const names:Record<string,string> = Object.fromEntries(schema.targets.map(t=>[t.slug,t.label]));
