/** Native fitting API for a worker. Inputs are decoded source/rig assets.
 * Character fitting is entirely WASM; no pre-solved profile is accepted.
 * Module must be built from round_fit.cpp + humanoid_fit.cpp.
 */
export function fitCharacter(module, input) {
  const integer=(value,lo,hi,name)=>{
    if(!Number.isInteger(value)||value<lo||value>hi)throw Error(`Invalid ${name}`);
    return value;
  };
  const n=integer(input.n,input.mode==='round'?20:1,65535,'vertex count');
  const sourceCount=integer(input.sourceJoints,1,256,'source joint count');
  const round=input.mode==='round',pivot=input.mode==='source-pivot';
  if(pivot&&(input.sourceJoints!==39||!['donkey-kong','bowser','pikachu','pichu'].includes(input.target)||input.sourcePivot?.target!==input.target))throw Error('Source-pivot mode supports the reviewed 39-joint four-donor source only');
  if(!round&&!pivot&&input.mode!=='humanoid')throw Error('Unsupported fitting mode');
  const allocations=[];
  function allocate(Type,length,values,name,maxInteger=4294967295){
    if(values){
      if(values.length!==length)throw Error(`Invalid ${name} length`);
      for(const value of values){
        if(!Number.isFinite(value)||(Type===Uint32Array&&(!Number.isInteger(value)||value<0||value>maxInteger)))throw Error(`Invalid ${name} value`);
      }
    }
    const ptr=module._malloc(length*Type.BYTES_PER_ELEMENT);
    if(!ptr)throw Error('Native fitting allocation failed');
    allocations.push(ptr);
    if(values)new Type(module.HEAPU8.buffer,ptr,length).set(values);
    return ptr;
  }
  const data=(Type,name,count,max)=>allocate(Type,count,input[name],name,max);
  // Missing arrays must fail, rather than allocating uninitialized native input.
  const required=['positions','normals','weights','joints',...(round?['triangles','parts','origins','targetJoints','inverseBinds','worlds']:pivot?['origins','targetAnchors']:['semantics','origins','anatomy','targetAnchors'])];
  for(const name of required)if(!input[name])throw Error(`Missing ${name}`);
  try{
    const p=data(Float64Array,'positions',n*3),normal=data(Float64Array,'normals',n*3);
    const weights=data(Float64Array,'weights',n*4),joints=data(Uint32Array,'joints',n*4,sourceCount-1);
    const slots=round?5:4;
    const outputPositions=allocate(Float64Array,n*3),outputNormals=allocate(Float64Array,n*3);
    const outputJoints=allocate(Uint32Array,n*slots),outputWeights=allocate(Float32Array,n*slots);
    let status,statsPointer,pivotOrigins;
    if(pivot){
      const config=input.sourcePivot;
      if(config.version!==1||config.parents?.length!==39||config.driverParts?.length!==39||config.rootJoint!==3||config.bodyBone!==1||config.stabilizeBody!==true||config.translationBone!==9||!Number.isFinite(config.visibleHeight)||config.visibleHeight<=0||config.visibleHeight>50)throw Error('Invalid source-pivot strategy');
      for(let i=0;i<39;i++)if(!Number.isInteger(config.parents[i])||(i===0?config.parents[i]!==-1:config.parents[i]<0||config.parents[i]>=i)||!Number.isInteger(config.driverParts[i])||config.driverParts[i]<0||config.driverParts[i]>58)throw Error('Invalid source-pivot hierarchy or driver');
      pivotOrigins=allocate(Float64Array,117);
    }
    const started=performance.now();
    if(pivot){
      const origins=data(Float64Array,'origins',117),anchors=data(Float64Array,'targetAnchors',177);
      status=module._fit_source_pivot(n,sourceCount,p,normal,weights,joints,origins,anchors,input.sourcePivot.visibleHeight,outputPositions,outputNormals,outputJoints,outputWeights,pivotOrigins);
    }else if(round){
      const triangles=integer(input.triangleCount,1,100000,'triangle count');
      const targetCount=integer(input.targetCount,1,512,'target joint count');
      const poses=integer(input.poses,1,256,'pose count');
      if(!Number.isFinite(input.radius)||input.radius<=0||input.radius>10)throw Error('Invalid radius');
      const indices=data(Uint32Array,'triangles',triangles*3,n-1),parts=data(Uint32Array,'parts',sourceCount,511);
      const origins=data(Float64Array,'origins',15),targetJoints=data(Uint32Array,'targetJoints',5,targetCount-1);
      const inverseBinds=data(Float64Array,'inverseBinds',targetCount*16),worlds=data(Float64Array,'worlds',poses*targetCount*16);
      statsPointer=allocate(Float64Array,21);
      status=module._fit_round(n,triangles,sourceCount,targetCount,poses,p,normal,weights,joints,indices,parts,origins,targetJoints,inverseBinds,worlds,input.radius,outputPositions,outputNormals,outputJoints,outputWeights,statsPointer);
    }else{
      const semantics=data(Uint32Array,'semantics',sourceCount,38),origins=data(Float64Array,'origins',39*3);
      const anatomy=data(Uint32Array,'anatomy',59,511),anchors=data(Float64Array,'targetAnchors',59*3);
      status=module._fit_humanoid(n,sourceCount,integer(input.fitFlags??0,0,7,'fit flags'),p,normal,weights,joints,semantics,origins,anatomy,anchors,outputPositions,outputNormals,outputJoints,outputWeights);
    }
    const computeAndTargetCopyMs=performance.now()-started;
    if(status!==0)throw Error(`Native fitting rejected the input (status ${status})`);
    const positions=new Float64Array(module.HEAPU8.buffer,outputPositions,n*3).slice();
    const normals=new Float64Array(module.HEAPU8.buffer,outputNormals,n*3).slice();
    if(!positions.every(Number.isFinite)||!normals.every(Number.isFinite))throw Error('Non-finite fitted geometry');
    return {positions,normals,...(pivot?{sourcePivot:{...input.sourcePivot,origins:new Float64Array(module.HEAPU8.buffer,pivotOrigins,117).slice()}}:{}),joints:new Uint32Array(module.HEAPU8.buffer,outputJoints,n*slots).slice(),
      weights:new Float32Array(module.HEAPU8.buffer,outputWeights,n*slots).slice(),
      stats:statsPointer?Array.from(new Float64Array(module.HEAPU8.buffer,statsPointer,21)):[],computeAndTargetCopyMs};
  }finally{for(const ptr of allocations)module._free(ptr);}
}
