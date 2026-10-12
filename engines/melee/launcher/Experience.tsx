import FriendMatch from './FriendMatch';
import {useEffect,useState} from 'react';
import Game from '../web/app/Game';
import NativeGame from '../web/app/NativeGame';
import {applyLauncherSelection} from './launch-plan.mjs';
import {loadSettings} from '../web/lib/launch';
import {desktop} from '../web/lib/desktop';
import {restoreLocalDisc,retainMelee,selectLocalDisc,subscribeLocalDisc} from '../web/lib/melee-session';
import {pollService} from '../web/lib/service-poll';
import {resolveFighters} from './resolve';
import catalog from '../web/public/catalog.json';
import type {Fighter} from '../web/lib/fighter';
import './launcher.css';
export const roster=catalog as Fighter[];
export default function MeleeExperience({action,onClose,soundOn=true,trailerReveal=false,onTrailerReady,onTrailerStatus}:{action:any;onClose:()=>void;soundOn?:boolean;trailerReveal?:boolean;onTrailerReady?:()=>void;onTrailerStatus?:(status:string)=>void}){
 const [friendAvailable,setFriendAvailable]=useState<boolean|undefined>();
 useEffect(()=>{const abort=new AbortController();fetch('/melee/api/netplay/config',{signal:abort.signal}).then(r=>r.ok?r.json():null).then(value=>{if(!abort.signal.aborted)setFriendAvailable(value?.enabled===true);}).catch(()=>{if(!abort.signal.aborted)setFriendAvailable(false);});return()=>abort.abort();},[]);
 const [launchMode,setLaunchMode]=useState<'solo'|'friend'|undefined>(()=>action.meleeTrailer?'solo':location.hash.startsWith('#room=')?'friend':undefined);
 const [ready,setReady]=useState(false),[status,setStatus]=useState('Choose your unmodified Melee USA 1.02 ISO or GCM.'),[error,setError]=useState('');
 const [setupError,setSetupError]=useState(''),[preparationStatus,setPreparationStatus]=useState('Preparing fighters…');
 const [resolved,setResolved]=useState<{action:any;roster:Fighter[]}|null>(null);
 const [settings,setSettings]=useState(()=>applyLauncherSelection(loadSettings(),action));
 useEffect(()=>{if(!ready||!resolved)onTrailerStatus?.(error||setupError||(!ready?status:preparationStatus));},[ready,resolved,error,setupError,status,preparationStatus,onTrailerStatus]);
 const fighters=resolved?.roster||roster;
 const fighter=resolved?.action.character?fighters.find(f=>f.slug===resolved.action.character.slug):fighters[0];
 useEffect(()=>{
  if(!ready)return;
  const abort=new AbortController();
  setResolved(null);setError('');
  const saved=loadSettings();
  resolveFighters(action,roster,abort.signal,setPreparationStatus).then(result=>{
   if(!abort.signal.aborted){setSettings(applyLauncherSelection(saved,result.action));setResolved(result);}
  }).catch(e=>{if(!abort.signal.aborted)setError(e.message);});
  return()=>abort.abort();
 },[ready,action]);
 useEffect(()=>{
  if(desktop()){
   return pollService<{ready:boolean;message:string}>('/melee/api/setup',s=>{
    setReady(s.ready);setStatus(s.message||'Choose your Melee disc.');setSetupError('');
   },e=>setSetupError(e.message));
  }
  void restoreLocalDisc();
  return subscribeLocalDisc(s=>{setReady(s.ready);setStatus([s.message,s.storageMessage].filter(Boolean).join(' '));});
 },[]);
 useEffect(()=>retainMelee(),[]);
 async function choose(file?:File){
  setError('');
  try{
   if(desktop()){
    const result=await desktop()!.chooseDisc();
    if(result.accepted)setStatus('Preparing disc…');
   }else if(file)await selectLocalDisc(file);
  }catch(e){setError((e as Error).message);}
 }
 if(ready&&!resolved)return <section className="melee-setup"><h2>Preparing fighters</h2><p role={error?'alert':'status'}>{error||preparationStatus}</p></section>;
 if(!fighter)return <section className="melee-setup" role="alert"><p>This character has not been prepared for Melee yet.</p><button onClick={onClose}>Return to roster</button></section>;
 if(!ready)return <section className="melee-setup"><h2>Play Melee</h2><p role="status">{status}</p><small>Your disc is never uploaded. A local copy is saved in this browser for future visits.</small>{(error||setupError)&&<p role="alert">{error||setupError}</p>}{desktop()?<button onClick={()=>void choose()}>Choose disc</button>:<label>Choose disc<input type="file" accept=".iso,.gcm" onChange={e=>void choose(e.target.files?.[0])}/></label>}<button onClick={onClose}>Return to roster</button></section>;
 if(!desktop()&&friendAvailable===undefined)return <section className="melee-setup"><p>Checking friend rooms…</p></section>;
 if(!desktop()&&friendAvailable&&!launchMode)return <section className="melee-setup"><h2>Play Melee</h2><p>Use your selected fighters and match settings.</p><button onClick={()=>setLaunchMode('solo')}>Play solo</button><button onClick={()=>setLaunchMode('friend')}>Play with a friend</button><button onClick={onClose}>Return to roster</button></section>;
 if(!desktop()&&friendAvailable&&launchMode==='friend')return <FriendMatch fighter={fighter} settings={settings} roster={fighters} onClose={onClose} soundOn={soundOn}/>;
 return desktop()?<NativeGame fighter={fighter} settings={settings} roster={fighters} onClose={onClose}/>:<Game fighter={fighter} settings={settings} roster={fighters} onClose={onClose} soundOn={soundOn} chrome={false} holdForTrailer={!!action.meleeTrailer} trailerReveal={trailerReveal} onTrailerReady={onTrailerReady} onTrailerStatus={onTrailerStatus}/>;
}
