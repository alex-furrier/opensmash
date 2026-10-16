export function restoreCachedDisc(expectedSize?:number):Promise<File|undefined>;
export function cacheDisc(file:File,signal:AbortSignal,progress:(fraction:number)=>void):Promise<string>;
export function removeCachedDisc():Promise<void>;
export function inspectDiscStorage():Promise<Record<string,unknown>>;
