// A diagnostic belongs to one launch attempt. It never advances the engine.
export function createLaunchDiagnostics({now=()=>performance.now(),timeoutMs=180000}={}) {
 const started=now(),events=[];
 let trailerHeld=false,deadline,phase='Preparing fighters',lastFrame,stalls=0,longestStallMs=0,frames=0;
 const add=(type,detail={})=>{events.push({atMs:now()-started,type,...detail});if(events.length>120)events.shift();};
 return {
  arm(label){phase=label;deadline=now()+timeoutMs;add('phase',{phase});},
  resumeTrailer(){if(!trailerHeld)return;trailerHeld=false;phase='Starting Melee';deadline=now()+timeoutMs;add('trailer-released');},
  pause(){deadline=undefined;add('waiting-for-ready');},
  observe(data){
   if(data.type==='status'){phase=String(data.message).slice(0,160);add('status',{phase});}
   if(data.type==='trailer-ready'){trailerHeld=true;deadline=undefined;add('trailer-ready');}
   if(data.type==='playable'){trailerHeld=false;deadline=undefined;add('playable');}
   if(data.type==='error'){deadline=undefined;add('error',{message:String(data.message).slice(0,300)});}
   if(data.type==='progress')lastFrame=data.frame;
   if(data.type==='metrics')for(const ms of data.frameTimes||[]){if(!Number.isFinite(ms)||ms<0)continue;frames++;if(ms>33.34)stalls++;longestStallMs=Math.max(longestStallMs,ms);}
   if(data.type==='frame-stall')add('frame-stall',{frame:data.frame,durationMs:data.durationMs,phases:data.phases});
   if(data.type==='confirmed-tick'&&data.timing?.totalMs>33.34)add('input-wait',{tick:data.tick,...data.timing});
  },
  expired(){if(deadline===undefined||now()<deadline)return;deadline=undefined;const message=`Melee preparation timed out (${phase}). Return to the roster or try again.`;add('timeout',{phase,lastFrame});return message;},
  snapshot(){return {elapsedMs:now()-started,phase,lastFrame,frames,over33ms:stalls,longestStallMs,events:events.slice()};},
 };
}
