const { JSDOM } = require("jsdom"); const fs = require("fs");
const html = fs.readFileSync(require("path").join(__dirname,"..","app","pulse4-pdp1.html"),"utf8");
const dom = new JSDOM(html,{runScripts:"outside-only",pretendToBeVisual:true}); const w=dom.window;
class P{constructor(){this.value=0}setValueAtTime(){}linearRampToValueAtTime(){}setTargetAtTime(){}cancelScheduledValues(){}}
class N{constructor(){this.gain=new P();this.frequency=new P();this.Q=new P()}connect(){return this}start(){}stop(){}disconnect(){}setPeriodicWave(){}}
let SP=null;
class SPN extends N{constructor(){super();this.onaudioprocess=null;SP=this;}}
class AC{constructor(){this.currentTime=0;this.sampleRate=44100;this.destination=new N()}
 createGain(){return new N()}createOscillator(){return new N()}createDynamicsCompressor(){return new N()}
 createPeriodicWave(){return{}}createBufferSource(){return new N()}createBiquadFilter(){return new N()}
 createScriptProcessor(){return new SPN()}resume(){}}
w.AudioContext=AC; w.OfflineAudioContext=AC;
let rq=[]; w.requestAnimationFrame=fn=>{rq.push(fn);return rq.length;};
w.flush=()=>{const q=rq;rq=[];q.forEach(f=>f(0));};
w.confirm=()=>true; w.alert=m=>{w.__alert=m;};
w.atob=s=>Buffer.from(s,"base64").toString("binary");
const script=html.slice(html.indexOf("<script>")+8, html.indexOf("</script>"));
w.eval(script+';window.__T={get S(){return S},get M(){return M},get LIVE(){return LIVE},get ROWS(){return ROWS},'+
 'play,stop,liveRestream,compileStream,segAddr,streamAddrs,paramChanged,repunch,liveTick,render:renderMachine,'+
 'setMod:(o)=>{Object.assign(S.mod,o);},edit:(r,n)=>{shownPat(0)[r].n=n;afterEdit();},click:(id,sel)=>{document.getElementById(id).querySelector(sel).click();}};');
const T=w.__T,$=id=>w.document.getElementById(id);
let bad=0; const log=(n,ok,x="")=>{console.log((ok?"PASS":"FAIL"),n,x); if(!ok)bad++;};

// pump the ScriptProcessor by hand
function pump(blocks){
  const L=new Float32Array(4096), R=new Float32Array(4096);
  const buf={length:4096,getChannelData:i=>i?R:L};
  let peak=0, edges=0, prev=0;
  const trace=[];
  for(let b=0;b<blocks;b++){
    L.fill(0);R.fill(0);
    SP.onaudioprocess({outputBuffer:buf});
    for(let i=0;i<4096;i++){
      const a=Math.abs(L[i]); if(a>peak)peak=a;
      const v=L[i]>0.1?1:0; if(v!==prev){edges++;prev=v;}
      trace.push(L[i]);
    }
  }
  return {peak,edges,trace};
}
const secs = b => b*4096/44100;

// ---- start live ----
T.play("song"); 
log("live node created", SP!==null && T.LIVE.on===true);
log("no pre-render buffer", T.M.buf===undefined);
const r1=pump(12);
log("audio is coming out", r1.peak>0.25, "peak "+r1.peak.toFixed(3));
log("song clock advanced", Math.abs(T.LIVE.songUs/1e6 - secs(12))<0.02,
    (T.LIVE.songUs/1e6).toFixed(4)+"s vs "+secs(12).toFixed(4));
log("playhead tick sane", T.liveTick()>0 && T.liveTick()<T.M.info.ticks, T.liveTick());
log("lamps driven by real flags", T.LIVE.duty.some(d=>d>0.05&&d<0.95), T.LIVE.duty.map(d=>d.toFixed(2)).join(" "));

// ---- layout invariance ----
T.stop(); T.setMod({on:true,shape:"wow",rates:[.6,.6,.6,.6],depths:[20,20,20,20],grid:16}); T.play("song");
const base=T.M.info.words.slice();
const counts=ws=>{const c=[];for(let i=1;i<ws.length;i+=2)c.push((ws[i]>>6)&0o7777);return c.join(",");};
const c0=counts(base), n0=base.length;
for (const chg of [{rates:[3.5,3.5,3.5,3.5]},{depths:[45,45,45,45]},{shape:"drift"},{seed:12345},
                   {depths:[0,45,0,20]},{rates:[0.2,4,1,0.05]}]){
  T.setMod(chg);
  const c=T.compileStream({bpm:T.S.bpm,res:16,voices:T.S.voices.map(v=>({order:v.order,patterns:v.patterns}))},64,16,T.S.mod);
  const same = c.words.length===n0 && counts(c.words)===c0;
  log("layout invariant across "+Object.keys(chg)[0].padEnd(7)+JSON.stringify(Object.values(chg)[0]).slice(0,18), same,
      same?"":`${c.words.length} vs ${n0} words`);
}
T.setMod({shape:"wow",rates:[.6,.6,.6,.6],depths:[20,20,20,20]});

// ---- in-place patch keeps loop counts byte-identical ----
const before=[]; for(const a of T.streamAddrs(n0)) before.push(T.M.pdp1.examine(a));
T.setMod({depths:[50,50,50,50],rates:[2.2,2.2,2.2,2.2]}); log("liveRestream applied", T.liveRestream()===true);
const after=[]; for(const a of T.streamAddrs(n0)) after.push(T.M.pdp1.examine(a));
let cntSame=true, pitchChanged=0;
for(let i=1;i<n0;i+=2) if(((before[i]>>6)&0o7777)!==((after[i]>>6)&0o7777)) cntSame=false;
for(let i=0;i<n0;i+=2) if(before[i]!==after[i]) pitchChanged++;
log("loop counts untouched by live patch", cntSame);
log("pitch words did change", pitchChanged>50, pitchChanged+" of "+(n0/2)+" word-1s rewritten");

// ---- a live slider actually changes the sound ----
T.stop(); T.setMod({on:true,shape:"wow",rates:[.5,.5,.5,.5],depths:[0,0,0,0]}); T.play("song");
pump(4);
function pitchOf(tr,from,len){ let best=0,bf=0;
  for(let f=380;f<=460;f+=0.1){let re=0,im=0;const wv=2*Math.PI*f/44100;
    for(let i=0;i<len;i++){re+=tr[from+i]*Math.cos(wv*i);im+=tr[from+i]*Math.sin(wv*i);}
    const m=re*re+im*im;if(m>best){best=m;bf=f;}} return bf; }
const dry=pump(6); const f0=pitchOf(dry.trace,4096,20000);
T.S.mod.depths=[90,90,90,90]; T.paramChanged("table"); w.flush();
const wet=pump(6); const f1=pitchOf(wet.trace,4096,20000);
log("depth slider changed the pitch mid-flight", Math.abs(1200*Math.log2(f1/f0))>20,
    `${f0.toFixed(1)} -> ${f1.toFixed(1)} Hz (${(1200*Math.log2(f1/f0)).toFixed(1)} cents)`);

// ---- structural change keeps position ----
T.stop(); T.setMod({on:true,shape:"wow",rates:[.6,.6,.6,.6],depths:[20,20,20,20],grid:16}); T.play("song");
pump(40); const t0=T.liveTick();
T.S.mod.grid=32; T.repunch();
const t1=T.liveTick();
log("re-punch resumed near the playhead", Math.abs(t1-t0)<=4, `tick ${t0} -> ${t1}`);
log("grid 32 doubled the events", T.M.info.segs>1800, T.M.info.segs+" segs");
pump(4); log("still audible after re-punch", pump(4).peak>0.25);

// ---- address walk crosses the bank boundary correctly ----
const many=[...T.streamAddrs(4000)];
log("stream wraps bank1 -> bank2", many[3645]===0o17775 && many[3646]===0o20700,
    many[3645].toString(8)+" -> "+many[3646].toString(8));
log("segAddr matches the walk", T.segAddr(1823)===many[3646], T.segAddr(1823).toString(8));
T.stop();
console.log(bad?"FAILURES "+bad:"ALL GOOD"); process.exitCode=bad?1:0;

// --- editing while the machine runs must not stop it ---
T.play("song"); pump(20);
const tA=T.liveTick(), segA=T.M.info.segs;
T.edit(8,79); w.flush();
log("edit kept playback alive", T.LIVE.on===true);
log("edit resumed at the playhead", Math.abs(T.liveTick()-tA)<=4, `tick ${tA} -> ${T.liveTick()}`);
log("edit is audible", pump(6).peak>0.25);
T.edit(8,null); w.flush();

// --- CPU headroom for the ScriptProcessor ---
const NB=60, tp0=Date.now(); pump(NB); const ms=Date.now()-tp0;
const budget=NB*4096/44100*1000;
log("real-time headroom", ms < budget*0.25,
    `${ms}ms of work for ${budget.toFixed(0)}ms of audio = ${(ms/budget*100).toFixed(1)}% duty`);
T.stop();
console.log(bad?"FAILURES "+bad:"ALL GOOD"); process.exitCode=bad?1:0;

// ================= per-voice independence =================
T.stop();
T.setMod({on:true, shape:"wow", grid:24, rates:[0.9,0.25,0.25,0.25], depths:[45,0,0,0]});
T.play("song"); pump(2);
function track(blocks, lo, hi, chan){
  const out=[];
  for(let b=0;b<blocks;b++){
    const r=pump(1); const tr=r.trace;
    let best=0,bf=0;
    for(let f=lo;f<=hi;f+=0.1){let re=0,im=0;const wv=2*Math.PI*f/44100;
      for(let i=0;i<tr.length;i++){re+=tr[i]*Math.cos(wv*i);im+=tr[i]*Math.sin(wv*i);}
      const m=re*re+im*im;if(m>best){best=m;bf=f;}}
    out.push(bf);
  }
  return out;
}
// bar 1: MEL is resting, ALT B-3 (~254Hz detuned) is the only left-channel voice
const altA=track(10,235,275);
const excA=x=>1200*Math.log2(Math.max(...x)/Math.min(...x));
log("depth 0 leaves ALT steady", excA(altA)<6, `${excA(altA).toFixed(1)} cents excursion`);
T.S.mod.depths=[45,45,0,0]; T.paramChanged("table"); w.flush(); pump(2);
const altB=track(10,235,275);
log("raising only ALT's depth moves only ALT", excA(altB)>25, `${excA(altB).toFixed(1)} cents excursion`);

// rates really are independent: give ALT a fast rate, TEN a slow one, compare cycle counts
T.stop();
T.setMod({on:true, shape:"wow", grid:32, rates:[0.5,3.0,0.3,0.5], depths:[30,50,50,30]});
T.play("song"); pump(2);
const a=track(26,240,270);                      // ALT at 3.0 Hz
const turns=arr=>{let n=0;for(let i=1;i<arr.length-1;i++)
  if((arr[i]-arr[i-1])*(arr[i+1]-arr[i])<0)n++;return n;};
log("ALT at 3.0Hz turns often", turns(a)>=4, `${turns(a)} direction changes in ${(26*4096/44100).toFixed(2)}s`);
T.stop();
T.setMod({rates:[0.5,0.3,0.3,0.5]}); T.play("song"); pump(2);
const b2=track(26,240,270);
log("ALT at 0.3Hz turns rarely", turns(b2)<turns(a), `${turns(b2)} vs ${turns(a)} direction changes`);

// the selector aims the sliders rather than gating the effect
T.stop();
T.setMod({sel:[false,true,false,false], rates:[1,1,1,1], depths:[10,10,10,10]});
w.eval('document.getElementById("mDepth").value=55;'+
       'document.getElementById("mDepth").dispatchEvent(new window.Event("input"));'); w.flush();
log("slider hit only the selected voice", T.S.mod.depths.join(",")==="10,55,10,10", T.S.mod.depths.join(","));
T.click("modVoices",'[data-v="3"]');
w.eval('document.getElementById("mRate").value=250;'+
       'document.getElementById("mRate").dispatchEvent(new window.Event("input"));'); w.flush();
log("multi-select drives both", T.S.mod.rates.join(",")==="1,2.5,1,2.5", T.S.mod.rates.join(","));
log("spread readout shows a range", $("mDepthVal").textContent.includes("\u2013"), $("mDepthVal").textContent);
T.click("modVoices",'[data-v="1"]'); T.click("modVoices",'[data-v="3"]');
log("never leaves the sliders aimed at nothing", T.S.mod.sel.every(Boolean), T.S.mod.sel.join(","));
const btn0=$("modVoices").querySelector('[data-v="0"]');
log("active voice reads bright", !btn0.className.includes("z"));
T.S.mod.depths=[0,55,10,10]; T.render();
log("zero-depth voice reads dim", btn0.className.includes("z"));
log("button carries its own rate/depth", btn0.querySelector("i").textContent==="1.00 \u00b10",
    btn0.querySelector("i").textContent);
console.log(bad?"FAILURES "+bad:"ALL GOOD"); process.exitCode=bad?1:0;
