import {useEffect,useState,useMemo,useRef} from 'react';
import Game from '../web/app/Game';
import {applyLauncherSelection,friendMatchSettings} from './launch-plan.mjs';
import {plan,type Settings} from '../web/lib/launch';
import type {Fighter} from '../web/lib/fighter';
import {connectFriendRoom,localFriendDevice} from '../web/lib/friend-room.mjs';
export default function FriendMatch({fighter,settings,localPortPlan,roster,onClose,soundOn,simulated=false,automatic=false}:{fighter:Fighter;settings:Settings;localPortPlan?:any;roster:Fighter[];onClose:()=>void;soundOn:boolean;simulated?:boolean;automatic?:boolean}){
 const [connection,setConnection]=useState<any>(),[assignment,setAssignment]=useState<any>(),[message,setMessage]=useState('Choose two fighters in Match settings, then create a room.'),[code,setCode]=useState(()=>location.hash.replace(/^#room=/,''));
 const restart=useRef<any>(undefined),initial=useRef(false),matchAssigned=useRef(false),mounted=useRef(false);
 const closeCallback=useRef(onClose);closeCallback.current=onClose;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{if(automatic&&!initial.current){initial.current=true;create();}},[automatic]);
 useEffect(()=>()=>connection?.client.stop(),[connection]);
 useEffect(()=>{if(!connection&&restart.current){const match=restart.current;restart.current=undefined;connect({type:'create',match,...(simulated?{testBot:true}:{})});}},[connection]);
 function connect(request:any){
  if(connection)return;
  const localDevice=localFriendDevice(applyLauncherSelection(settings,{portPlan:localPortPlan}).ports);
  if(!localDevice){setMessage('Choose a keyboard or gamepad in Players & Controllers first.');return;}
  const room=connectFriendRoom(request,(event:any)=>{
   if(!mounted.current)return;
   if(event.type==='room')setMessage(event.players.map((p:any,i:number)=>`Player ${i+1}: ${p?(p.ready?'Ready':'Preparing'):'Waiting'}`).join(' · '));
   if(event.type==='stopped'){
    const returnToRoster=matchAssigned.current&&!restart.current;matchAssigned.current=false;
    setMessage(event.reason);setAssignment(undefined);setConnection(undefined);
    if(returnToRoster)closeCallback.current();
   }
  });
  setConnection({client:room,settings,localDevice});void room.assignment.then((joined:any)=>{if(room.closed)return;matchAssigned.current=true;setAssignment(joined);setCode(location.origin+'/melee#room='+joined.room);}).catch((error:Error)=>setMessage(error.message));
 }
 function create(){try{
  const proposal=plan(friendMatchSettings(settings),fighter,roster);connect({type:'create',match:proposal,...(simulated?{testBot:true}:{})});
 }catch(error){setMessage((error as Error).message);}}
 const launch=assignment?.match;
 const gameRoom=useMemo(()=>assignment?{connection:connection.client,assignment,launch:assignment.match,localDevice:connection.localDevice}:undefined,[connection,assignment]);
 if(launch)return <Game fighter={roster.find(row=>row.slug===launch.ports[assignment.player].character)||fighter} settings={connection.settings} roster={roster} onClose={()=>connection.client.stop()} soundOn={soundOn} room={gameRoom} onRematch={()=>{restart.current=launch;connection.client.stop('Preparing a fresh rematch…');}}/>;
 return <section className="melee-setup"><h2>{simulated?'Play against computer':'Play with a friend'}</h2>{simulated&&<p>A local scripted browser opponent uses the same multiplayer input path. This tests your match locally.</p>}<p role="status">{message}</p>{!connection&&<><button onClick={create}>Create room</button>{!simulated&&<><label>Room link or code<input value={code} onChange={e=>setCode(e.target.value)}/></label><button onClick={()=>{let value=code.trim();try{if(value.includes('://'))value=new URL(value).hash.replace(/^#room=/,'');}catch{}if(!/^[a-f0-9]{32}$/.test(value)){setMessage('Paste a valid room link.');return;}connect({type:'join',room:value});}}>Join room</button></>}</>}{assignment&&<><label>Share with your friend<input readOnly value={code} onFocus={e=>e.target.select()}/></label><button onClick={()=>void navigator.clipboard.writeText(code)}>Copy room link</button></>}
 {connection&&<button onClick={()=>connection.client.stop('Match stopped. Create a fresh room.')}>Stop</button>}<button onClick={onClose}>Return to roster</button>
</section>;
}
