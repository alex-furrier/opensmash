export type TouchPad={buttons:number;x:number;y:number;cx:number;cy:number;main:boolean;c:boolean;active:boolean};
export const touchActions:readonly (readonly [string,string,number])[];
export function neutralTouchPad():TouchPad;
export function stickVector(dx:number,dy:number,radius:number):{x:number;y:number};
export function createTouchController(pad:{current:TouchPad}):{move(event:any):void;release(id:number):void;reset():void;begin(event:any,kind:string,button?:number):void};
