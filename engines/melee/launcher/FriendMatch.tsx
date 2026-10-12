import {useEffect,useState,useMemo} from 'react';
import Game from '../web/app/Game';
import {plan,type Settings} from '../web/lib/launch';
import type {Fighter} from '../web/lib/fighter';
import {connectFriendRoom,localFriendDevice} from '../web/lib/friend-room.mjs';
export default function FriendMatch({fighter,settings,roster,onClose,soundOn}:{fighter:Fighter;settings:Settings;roster:Fighter[];onClose:()=>void;soundOn:boolean}){
 const [connection,setConnection]=useState<any>(),[assignment,setAssignment]=useState<any>(),[message,setMessage]=useState('Choose two fighters in Match settings, then create a room.'),[code,setCode]=useState(()=>location.hash.replace(/^#room=/,''));
 useEffect(()=>()=>connection?.stop(),[connection]);
 function connect(request:any){
  if(connection)return;
  if(!localFriendDevice(settings.ports)){setMessage('Choose a keyboard or gamepad in Players & Controllers first.');return;}
  const room=connectFriendRoom(request,(event:any)=>{
   if(event.type==='room')setMessage(event.players.map((p:any,i:number)=>`Player ${i+1}: ${p?(p.ready?'Ready':'Preparing'):'Waiting'}`).join(' · '));
   if(event.type==='stopped'){setMessage(event.reason);setAssignment(undefined);setConnection(undefined);}
  });
  setConnection(room);void room.assignment.then((joined:any)=>{setAssignment(joined);setCode(location.origin+'/melee#room='+joined.room);}).catch((error:Error)=>setMessage(error.message));
 }
 function create(){try{
  const ports=settings.ports.map((p,i)=>({...p,device:i<2?(i===0?'keyboard':'gamepad0'):'off'}));
  const proposal=plan({...settings,mode:0,ports},fighter,roster);connect({type:'create',match:proposal});
 }catch(error){setMessage((error as Error).message);}}
 const launch=assignment?.match;
 const gameRoom=useMemo(()=>assignment?{connection,assignment,launch:assignment.match,localDevice:localFriendDevice(settings.ports)}:undefined,[connection,assignment,settings]);
 if(launch)return <Game fighter={fighter} settings={settings} roster={roster} onClose={()=>connection.stop()} soundOn={soundOn} room={gameRoom}/>;
 return <section className="melee-setup"><h2>Play with a friend</h2><p role="status">{message}</p>{!connection&&<><button onClick={create}>Create room</button><label>Room link or code<input value={code} onChange={e=>setCode(e.target.value)}/></label><button onClick={()=>{let value=code.trim();try{if(value.includes('://'))value=new URL(value).hash.replace(/^#room=/,'');}catch{}if(!/^[a-f0-9]{32}$/.test(value)){setMessage('Paste a valid room link.');return;}connect({type:'join',room:value});}}>Join room</button></>}{assignment&&<><label>Share with your friend<input readOnly value={code} onFocus={e=>e.target.select()}/></label><button onClick={()=>void navigator.clipboard.writeText(code)}>Copy room link</button></>}
 {connection&&<button onClick={()=>connection.stop('Match stopped. Create a fresh room.')}>Stop</button>}<button onClick={onClose}>Return to roster</button>
</section>;
}
