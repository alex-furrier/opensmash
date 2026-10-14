import {useEffect,useRef,useState} from 'react';
import {hostDiscConfigured,selectHostDisc} from './melee-session';
export default function HostDiscButton(){
 const operation=useRef<AbortController|null>(null),[busy,setBusy]=useState(false),[status,setStatus]=useState('');
 useEffect(()=>()=>operation.current?.abort(),[]);
 if(!hostDiscConfigured())return null;
 async function load(){
  if(operation.current)return;
  const controller=new AbortController();operation.current=controller;setBusy(true);setStatus('Checking your saved game…');
  try{await selectHostDisc(controller.signal,setStatus);if(!controller.signal.aborted)setStatus('Ready to play.');}
  catch(e){setStatus(controller.signal.aborted?'Download cancelled. Try again or choose a local disc.':(e as Error).message);}
  finally{if(operation.current===controller){operation.current=null;setBusy(false);}}
 }
 return <div><button disabled={busy} onClick={()=>void load()}>Load from host</button>{busy&&<button onClick={()=>operation.current?.abort()}>Cancel download</button>}{status&&<small role="status">{status}</small>}</div>;
}
