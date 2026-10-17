// Fixed technical fields only. Never forward raw errors, names, URLs or logs.
export const SETUP_REPORT_PATH='/melee/api/setup-report';
export const SETUP_REPORT_LIMIT=2048;
const errors=new Set(['Error','UnknownError','QuotaExceededError','NotReadableError','NotAllowedError','SecurityError','InvalidStateError','NotSupportedError','TypeError','AbortError','Timeout']);
const stages=new Set(['cache-restore','cache-copy','cache-close','cache-saved-file','cache-pointer','cache-adoption','download-open','download-open-root','download-open-directory','download-open-lock','download-open-file','download-open-writable','download-read','download-write','download-close','download-saved-file','handoff-saved-file','verification-file','disc-inspection','setup-ready']);
const counts=['expectedBytes','actualBytes','receivedBytes','writtenBytes','readOffset','expectedReadBytes','actualReadBytes'];
const storageCounts=['savedBytes','probeBytes','probeReadBytes'];
const flags=['storageAvailable','writableAvailable','sharedMemory','graphicsAvailable','iframeMoveAvailable'];
const integer=n=>Number.isSafeInteger(n)&&n>=0&&n<=2147483648;
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
function failure(v){
 if(!plain(v)||!errors.has(v.name))return false;
 return Object.entries(v).every(([k,x])=>k==='name'||k==='discStage'&&(stages.has(x)||typeof x==='string'&&/^verification-(?:read|digest)@\d{1,10}$/.test(x)&&integer(Number(x.split('@')[1])))||counts.includes(k)&&integer(x));
}
export function validSetupReport(v){
 if(!plain(v)||v.version!==1||!['missing','checking','ready','error'].includes(v.state)||!failure(v.lastFailure))return false;
 return Object.entries(v).every(([k,x])=>k==='version'||k==='state'||k==='lastFailure'||k==='expectedBytes'&&integer(x)||flags.includes(k)&&typeof x==='boolean'||storageCounts.includes(k)&&(x===null&&k==='savedBytes'||integer(x))||['probeError','restoreError'].includes(k)&&errors.has(x));
}
export function setupReport(raw,lastFailure){
 const report={version:1,state:raw?.state,lastFailure:{}};
 for(const k of ['name','discStage',...counts])if(Object.hasOwn(lastFailure||{},k))report.lastFailure[k]=lastFailure[k];
 for(const k of ['expectedBytes',...flags,...storageCounts,'probeError','restoreError'])if(Object.hasOwn(raw||{},k))report[k]=raw[k];
 if(!validSetupReport(report))throw Error('Unsupported setup report');
 return report;
}
