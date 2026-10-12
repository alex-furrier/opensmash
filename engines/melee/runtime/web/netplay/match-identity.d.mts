export type MatchIdentity={engine:string;disc:string;rules:string;costumes:string;seed:string};
export function resolvedRules(value:unknown):{mode:number;stage:number;level:number;stocks:number;minutes:number;packedPorts:number[]};
export function installedMatchIdentity(engine:string,launch:unknown,options:{verifiedDisc:string;installedSeed:string;freshSaves:boolean;costumes?:{filename:string;blob:Blob}[];cssAssets?:{filename:string;blob:Blob}[]}):Promise<MatchIdentity>;
