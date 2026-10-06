import fs from 'fs'; import path from 'path'; import {spawn} from 'child_process'; import os from 'os';
const ROOT='C:/Users/Administrator/Desktop/剪辑/数字艺术/20261006';
const HTML=path.join(ROOT,'太阳站-ASCII舷窗.html').replace(/\\/g,'/');
const W=2240,H=1260,PORT=9225,FONTPX=7.3;
const edgePath=()=>{ for(const p of ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe']) if(fs.existsSync(p)) return p; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
class CDP{ constructor(ws){ this.ws=ws; this.id=0; this.p=new Map();
  ws.addEventListener('message',ev=>{ let m; try{m=JSON.parse(ev.data);}catch(e){return;} if(m.id&&this.p.has(m.id)){const{res,rej}=this.p.get(m.id);this.p.delete(m.id);m.error?rej(new Error(JSON.stringify(m.error))):res(m.result);} }); }
  send(method,params){ const id=++this.id; return new Promise((res,rej)=>{ this.p.set(id,{res,rej}); this.ws.send(JSON.stringify({id,method,params})); }); } }
(async()=>{
  const ep=edgePath(); const ud=path.join(os.tmpdir(),'edge-cover-'+Date.now());
  const proc=spawn(ep,['--headless=new','--disable-gpu','--no-sandbox','--hide-scrollbars','--no-first-run','--force-device-scale-factor=1',
    '--allow-file-access-from-files','--remote-debugging-port='+PORT,'--user-data-dir='+ud,'--window-size='+W+','+H, HTML],{stdio:'ignore'});
  let target=null;
  for(let i=0;i<60&&!target;i++){ await sleep(500); try{ const l=await (await fetch('http://127.0.0.1:'+PORT+'/json')).json(); target=l.find(t=>t.type==='page'&&t.url.startsWith('file:')); }catch(e){} }
  const ws=new WebSocket(target.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r));
  const cdp=new CDP(ws); await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  let ok=false; for(let i=0;i<50&&!ok;i++){ await sleep(300); try{ const r=await cdp.send('Runtime.evaluate',{expression:'typeof window.__planetInfo',returnByValue:true}); ok=r.result&&r.result.value==='function'; }catch(e){} }
  if(!ok){ console.log('not ready'); proc.kill(); process.exit(1); }
  await cdp.send('Runtime.evaluate',{expression:'window.__setFont('+FONTPX+');void 0',returnByValue:true});
  { const d=await cdp.send('Runtime.evaluate',{expression:'JSON.stringify(window.__dims())',returnByValue:true}); console.log('dims:', d.result.value); }
  await cdp.send('Runtime.evaluate',{expression:'document.getElementById("gate").style.display="none";document.getElementById("rec").style.display="none";void 0',returnByValue:true});

  async function bestIn(a,b,step){ let best=null;
    for(let t=a;t<=b+1e-6;t+=step){ const r=await cdp.send('Runtime.evaluate',{expression:'JSON.stringify(window.__planetInfo('+t.toFixed(2)+'))',returnByValue:true});
      const ps=JSON.parse(r.result.value); for(const p of ps){ if(p.on&&p.rp>6){ const sc=p.rp; if(!best||sc>best.sc) best={t:+t.toFixed(2),sc,p}; } } }
    return best; }
  const preOrbit=await bestIn(8,23,0.5);
  const titleWin=await bestIn(29,38,0.5);
  console.log('preOrbit best', JSON.stringify(preOrbit));
  console.log('titleWin best', JSON.stringify(titleWin));

  const shots=[];
  if(preOrbit) shots.push([preOrbit.t,'cover_preorbit_planet']);
  if(titleWin) shots.push([titleWin.t,'cover_title_planet']);
  for(const [t,name] of shots){
    await cdp.send('Runtime.evaluate',{expression:'window.__exportFrame('+t+')',returnByValue:true}); await sleep(120);
    const s=await cdp.send('Page.captureScreenshot',{format:'png'});
    const f=path.join(ROOT,name+'.png'); fs.writeFileSync(f,Buffer.from(s.data,'base64'));
    console.log('wrote',f,'@t='+t,(fs.statSync(f).size/1024|0)+'KB');
  }
  try{ws.close();}catch(e){} proc.kill(); console.log('done');
})().catch(e=>{console.log('ERR',e.message);process.exit(1);});
