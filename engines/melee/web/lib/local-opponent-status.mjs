export function localOpponentStatus(state){
 return ({opening:'Starting the local opponent browser…',context:'Preparing the local opponent session…',page:'Opening the local opponent…',loading:'Loading the local opponent launcher…','choosing-disc':'Local opponent is checking its game…',joining:'Local opponent is verifying your fighters…',verified:'Local opponent verified. Starting the match…',ready:'Starting the match…'})[state?.opponentPhase]||'Waiting for the local opponent…';
}
