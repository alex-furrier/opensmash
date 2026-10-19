export function createPreparationStore(options?:{concurrency?:number;maxBytes?:number;fetchFile?:typeof fetch}):{
 run<T>(signal:AbortSignal,prepare:()=>Promise<T>):Promise<T>;
 asset(url:string,signal:AbortSignal):Promise<Blob>;
 get<T extends {blob:Blob}>(key:string):T|undefined;
 put<T extends {blob:Blob}>(key:string,value:T):void;
};
