import fs from 'fs'; import path from 'path'; import {spawn} from 'child_process'; import os from 'os';
const ROOT='C:/Users/Administrator/Desktop/剪辑/数字艺术/20261006';
const HTML=path.join(ROOT,'太阳站-ASCII舷窗.html').replace(/\\/g,'/');
const AUDIO=path.join(ROOT,'The Sun Station - Andrew Prahlow.mp3');
const OUT_420=path.join(ROOT,'太阳站-ASCII.mp4');
const OUT_444=path.join(ROOT,'太阳站-ASCII_444.mp4');
const FRAMES=path.join(ROOT,'tools','frames');
const FPS=30, W=2240, H=1260, PORT=9223, FONTPX=7.3;
const FF='D:/Enviornment/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe';

function edgePath(){ const c=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; return null; }
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

class CDP{ constructor(ws){ this.ws=ws; this.id=0; this.p=new Map();
    ws.addEventListener('message',ev=>{ let m; try{m=JSON.parse(ev.data);}catch(e){return;}
      if(m.id&&this.p.has(m.id)){ const {res,rej}=this.p.get(m.id); this.p.delete(m.id); m.error?rej(new Error(JSON.stringify(m.error))):res(m.result); } }); }
  send(method,params){ const id=++this.id; return new Promise((res,rej)=>{ this.p.set(id,{res,rej}); this.ws.send(JSON.stringify({id,method,params})); }); } }

async function main(){
  const ep=edgePath(); if(!ep){ console.log('NO EDGE'); process.exit(1); }
  fs.mkdirSync(FRAMES,{recursive:true}); for(const f of fs.readdirSync(FRAMES)) fs.unlinkSync(path.join(FRAMES,f));
  const ud=path.join(os.tmpdir(),'edge-export-'+Date.now());
  const args=['--headless=new','--disable-gpu','--no-sandbox','--hide-scrollbars','--no-first-run','--no-default-browser-check',
    '--force-device-scale-factor=1','--allow-file-access-from-files','--remote-debugging-port='+PORT,
    '--user-data-dir='+ud,'--window-size='+W+','+H, HTML];
  console.log('launch edge...');
  const proc=spawn(ep,args,{stdio:'ignore'});
  // wait for CDP
  let target=null;
  for(let i=0;i<60 && !target;i++){ await sleep(500);
    try{ const r=await fetch('http://127.0.0.1:'+PORT+'/json'); const list=await r.json();
      if(i===0) console.log('targets:', list.map(t=>t.type+' '+t.url.slice(0,60)));
      target=list.find(t=>t.type==='page'&&t.url.includes('export')) || list.find(t=>t.type==='page'&&t.url.startsWith('file:')) || list.find(t=>t.type==='page'); }catch(e){} }
  if(!target){ console.log('no cdp target'); proc.kill(); process.exit(1); }
  console.log('target url:', target.url.slice(0,80));
  const ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ ws.addEventListener('open',res); ws.addEventListener('error',rej); });
  const cdp=new CDP(ws);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  // wait ready
  let ready=false;
  for(let i=0;i<50 && !ready;i++){ await sleep(300);
    try{ const r=await cdp.send('Runtime.evaluate',{expression:'[typeof window.__exportFrame, (document.getElementById("gate")||{}).id, location.search, document.title]',returnByValue:true});
      if(i===0||i===5) console.log('probe#'+i, JSON.stringify(r).slice(0,200));
      ready = r.result && r.result.value && r.result.value[0]==='function'; }catch(e){ if(i===0) console.log('eval err', e.message); } }
  if(!ready){ console.log('page not ready'); proc.kill(); process.exit(1); }
  await cdp.send('Runtime.evaluate',{expression:'window.__setFont('+FONTPX+');void 0',returnByValue:true});
  { const d=await cdp.send('Runtime.evaluate',{expression:'JSON.stringify(window.__dims())',returnByValue:true}); console.log('dims after setFont:', d.result.value); }
  await cdp.send('Runtime.evaluate',{expression:'document.getElementById("gate").style.display="none";document.getElementById("rec").style.display="none";document.getElementById("title").classList.add("show");void 0',returnByValue:true});
  const dr=await cdp.send('Runtime.evaluate',{expression:'window.__DUR',returnByValue:true});
  const DUR=dr.result.value; const N=Math.floor(DUR*FPS);
  console.log('duration',DUR.toFixed(2),'frames',N,'res',W+'x'+H,'fps',FPS);
  const t0=Date.now();
  for(let k=0;k<N;k++){
    const t=k/FPS;
    await cdp.send('Runtime.evaluate',{expression:'window.__exportFrame('+t.toFixed(5)+')',returnByValue:true});
    const shot=await cdp.send('Page.captureScreenshot',{format:'png'});
    fs.writeFileSync(path.join(FRAMES,'f'+String(k).padStart(5,'0')+'.png'), Buffer.from(shot.data,'base64'));
    if(k%120===0) console.log('frame',k,'/',N,'elapsed',((Date.now()-t0)/1000).toFixed(0)+'s');
  }
  try{ ws.close(); }catch(e){} proc.kill();
  console.log('frames done', N, 'in', ((Date.now()-t0)/1000).toFixed(0)+'s');

  // encode + mux with original audio (lossless frames -> no colour shift); 420 universal + 444 max-fidelity
  const outs=[[OUT_420,['-pix_fmt','yuv420p']],[OUT_444,['-pix_fmt','yuv444p']]];
  for(const [out,extra] of outs){
    console.log('ffmpeg encode ->', out);
    await new Promise((res,rej)=>{ const p=spawn(FF,['-y','-framerate',String(FPS),'-i',path.join(FRAMES,'f%05d.png'),'-i',AUDIO,
      '-map','0:v:0','-map','1:a:0','-c:v','libx264','-crf','15','-preset','medium',
      '-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709',
      ...extra,'-c:a','aac','-b:a','192k','-shortest','-movflags','+faststart',out],{stdio:'inherit'});
      p.on('exit',c=>c===0?res():rej(new Error('ffmpeg '+c))); p.on('error',rej); });
    console.log('WROTE', out, fs.existsSync(out)?(fs.statSync(out).size/1048576).toFixed(1)+' MB':'FAIL');
  }
}
main().catch(e=>{ console.log('ERR', e.message); process.exit(1); });
