import fs from 'fs';
const ROOT='C:/Users/Administrator/Desktop/剪辑/数字艺术/20261006';
let tpl=fs.readFileSync(ROOT+'/tools/template.html','utf8');
const feat=fs.readFileSync(ROOT+'/tools/features.json','utf8');
const featd=JSON.parse(feat);
let src=tpl.match(/<script>([\s\S]*?)<\/script>/)[1];
src=src.replace('__FEATURES_JSON__',feat).replace('__AUDIO_B64__','AAAA').replace('__DURATION__',featd.duration.toFixed(3));

// ---- DOM stubs ----
function makeCtx(){ return { fillStyle:'',font:'',textBaseline:'',
  measureText:()=>({width:92.8}), fillText:()=>{}, fillRect:()=>{},
  getImageData:(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4)}) }; }
function makeEl(){ const el={ style:{}, innerHTML:'', width:0,height:0,
  classList:{add(){},remove(){}}, addEventListener(){}, getContext:makeCtx };
  return el; }
const els={};
const document={ getElementById:id=>(els[id]||(els[id]=makeEl())), addEventListener(){} };
const window={ devicePixelRatio:2, innerWidth:800, innerHeight:900, addEventListener(){}, performance };
class Audio{ constructor(){ throw new Error('no audio'); } }
const requestAnimationFrame=()=>{};

const fn=new Function('window','document','atob','requestAnimationFrame','performance','Audio', src);
const t0=Date.now();
fn(window, document, globalThis.atob, requestAnimationFrame, performance, Audio);
console.log('LOAD ok in', Date.now()-t0,'ms');
const W=window;

const dims=W.__dims(); console.log('dims',JSON.stringify(dims));

// per-phase stats
const TS=[6,12,20,40,60,90,115,125,132,140,150,156];
function stats(t){ const g=W.__grid(t); let nz=0,s=0; for(let i=0;i<g.val.length;i++){ if(g.val[i]>0.02){nz++;s+=g.val[i];} }
  return {ph:W.__phase(t),nz,mean:+(s/(g.val.length)).toFixed(4)}; }
for(const t of TS) console.log('t='+t, JSON.stringify(stats(t)));

// timing
console.log('bench t=60 ms/frame', W.__bench(60,40).toFixed(2), ' t=140', W.__bench(140,40).toFixed(2));

// ---- MOTION probe: is the orbital rotation actually visible? ----
function gridAt(t){ const g=W.__grid(t); return g; }
function discProfile(t,rowFrac){ const g=gridAt(t); const r=Math.floor(g.rows*rowFrac); const a=new Float32Array(g.cols);
  for(let c=0;c<g.cols;c++){ const i=c+r*g.cols; a[c]= g.kind[i]===1? g.val[i]:0; } return a; }
function bestShift(a,b,maxS){ let best=0,bd=1e18; for(let s=-maxS;s<=maxS;s++){ let e=0,n=0; for(let c=0;c<a.length;c++){ const j=c+s; if(j<0||j>=b.length)continue; const d=a[c]-b[j]; e+=d*d; n++; } e/= (n||1); if(e<bd){bd=e;best=s;} } return best; }
for(const rf of [0.8,0.9]){ const s=bestShift(discProfile(60,rf), discProfile(61,rf), 24);
  console.log('disc surface-feature horizontal shift over 1s @row'+rf+' :', s, 'cells'); }
// planet screen-x over time (must move -> orbiting)
function planetX(t){ const g=gridAt(t); /* find cool-ish isolated bright clusters is hard; use beat-driven analytic */ 
  const bp=W.__beatPos(t); const D=W.__dims(); const out=[]; for(const p of [[1.6,64,0.10],[2.4,96,0.55],[3.4,128,0.30]]){ /* approximate projected x via cam */ } return out; }
// starfield centroid shift (rotation -> sky sweeps)
function starCentroid(t){ const g=gridAt(t); let sx=0,sw=0; for(let r=0;r<g.rows;r++)for(let c=0;c<g.cols;c++){ const i=c+r*g.cols; if(g.kind[i]===0){ sx+=c*g.val[i]; sw+=g.val[i]; } } return sw? sx/sw : 0; }
const sc0=starCentroid(60), sc1=starCentroid(61);
console.log('starfield centroid shift over 1s:', (sc1-sc0).toFixed(2), 'cells (sky sweep)');
// ---- camera speed never ~0 (physics): angular + linear speed over timeline ----
let minLin=1e9, minLinAt=0, minAng=1e9, minAngAt=0;
for(let t=0.5;t<158;t+=0.5){ const a=W.__camAt(t), b=W.__camAt(t+0.5);
  const dth=Math.abs(b.th-a.th)/0.5, drc=Math.abs(b.rc-a.rc)/0.5;
  const lin=Math.hypot(dth*a.rc, drc);           // tangential + radial speed (solar radii / s)
  if(dth<minAng){minAng=dth;minAngAt=t;} if(lin<minLin){minLin=lin;minLinAt=t;} }
console.log('camera ANG speed min=', minAng.toFixed(3),'rad/s @t='+minAngAt.toFixed(1), '| LINEAR speed min=', minLin.toFixed(3),'R☉/s @t='+minLinAt.toFixed(1));

// ---- continuity scan at PLAYBACK framerate (1/60s): a hard cut shows as a big per-frame delta ----
function gmean(t){ const g=W.__grid(t); let s=0; for(let i=0;i<g.val.length;i++)s+=g.val[i]; return s/g.val.length; }
const DT=1/24; let prev=gmean(0), maxJump=0, jumpAt=0, pops=0;
for(let t=DT;t<158.6;t+=DT){ const m=gmean(t); const d=Math.abs(m-prev); if(d>maxJump){maxJump=d;jumpAt=t;} if(d>0.03)pops++; prev=m; }
console.log('CONTINUITY(24fps) maxPerFrameJump=', maxJump.toFixed(4), 'at t=', jumpAt.toFixed(2), ' frames>0.03:', pops, '/', Math.round(158.6/DT));
// phase-boundary specific check (10/16/25/108/135) with fine steps
for(const b of [10,16,25,108,135]){ const j=Math.abs(gmean(b+0.02)-gmean(b-0.02)); console.log('  boundary t='+b+' per-frame jump~', j.toFixed(4)); }

// ---- falsify: shuffle timeline -> grid MSE ----
function grid(t){ return W.__grid(t).val; }
W.__resetPerm();
const base=TS.map(grid);
// random permutation of frames
const NF=featd.nframes; const perm=new Uint16Array(NF); for(let i=0;i<NF;i++)perm[i]=i;
for(let i=NF-1;i>0;i--){ const j=(Math.random()*(i+1))|0; const tmp=perm[i];perm[i]=perm[j];perm[j]=tmp; }
W.__permute(perm);
const shuf=TS.map(grid);
let mse=[];
for(let k=0;k<TS.length;k++){ const a=base[k],b=shuf[k]; let s=0; for(let i=0;i<a.length;i++){const d=a[i]-b[i];s+=d*d;} mse.push(+(s/a.length).toFixed(4)); }
console.log('SHUFFLE MSE per t', JSON.stringify(mse));
W.__resetPerm();

// ---- falsify: reverse-extreme (all frames -> quiet vs all -> climax) ----
const qf=(2*30)|0, cf=(136*30)|0;
const permQ=new Uint16Array(NF).fill(qf), permC=new Uint16Array(NF).fill(cf);
W.__permute(permQ); const mq=stats(60).mean, mqs=stats(140).mean;
W.__permute(permC); const mc=stats(60).mean, mcs=stats(140).mean;
W.__resetPerm();
console.log('reverse-extreme @60 quiet='+mq+' climax='+mc+' | @140 quiet='+mqs+' climax='+mcs);

// dumps
function dump(t){ return W.__dump(t); }
fs.writeFileSync(ROOT+'/tools/_dump_60.txt', dump(60));
fs.writeFileSync(ROOT+'/tools/_dump_140.txt', dump(140));
fs.writeFileSync(ROOT+'/tools/_dump_20.txt', dump(20));
console.log('dumps written');
