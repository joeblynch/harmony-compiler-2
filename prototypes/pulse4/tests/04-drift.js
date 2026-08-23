const { JSDOM } = require("jsdom"); const fs = require("fs");
const html = fs.readFileSync(require("path").join(__dirname,"..","app","pulse4-pdp1.html"),"utf8");
const dom = new JSDOM(html,{runScripts:"outside-only",pretendToBeVisual:true}); const w=dom.window;
class P{constructor(){this.value=0}setValueAtTime(){}linearRampToValueAtTime(){}setTargetAtTime(){}cancelScheduledValues(){}}
class N{constructor(){this.gain=new P();this.frequency=new P();this.Q=new P()}connect(){return this}start(){}stop(){}disconnect(){}setPeriodicWave(){}}
class AC{constructor(){this.currentTime=0;this.destination=new N()}createGain(){return new N()}createOscillator(){return new N()}
 createDynamicsCompressor(){return new N()}createPeriodicWave(){return{}}createBufferSource(){return new N()}createBiquadFilter(){return new N()}resume(){}}
w.AudioContext=AC; w.OfflineAudioContext=AC; w.requestAnimationFrame=()=>0; w.confirm=()=>true;
w.atob=s=>Buffer.from(s,"base64").toString("binary");
const script=html.slice(html.indexOf("<script>")+8, html.indexOf("</script>"));
w.eval(script+';window.__T={get S(){return S},get M(){return M},get ROWS(){return ROWS},get RES(){return RES},'+
 'compileNow,compileStream,rimTape,noteName,modLfo,writeVariants,retune,renderMachine,TAB,liveTables,'+
 'setMod:(o)=>{Object.assign(S.mod,o);M.dirty=true;compileNow(false);renderMachine();}};');
const T=w.__T,$=id=>w.document.getElementById(id);
let bad=0; const log=(n,ok,x="")=>{console.log((ok?"PASS":"FAIL"),n,x); if(!ok)bad++;};

log("drift defaults off", T.S.mod.on===false && T.M.info.segs===116, T.M.info.segs);
log("no slots patched when off", T.M.info.plan.slots===0);

// --- turn on WOW ---
T.setMod({on:true, shape:"wow", rates:[.6,.6,.6,.6], depths:[14,14,14,14]});
const c=T.M.info;
log("wow raises segment count", c.segs>116, `116 -> ${c.segs}`);
log("under capacity", c.over===false);
log("levels per voice", c.plan.m.join("/")==="4/7/7/4", c.plan.m.join("/"));
log("used pitches 6/4/4/6", c.used.map(u=>u.length).join("/")==="6/4/4/6", c.used.map(u=>u.length).join("/"));
log("slots patched = 2*sum(m*used)", c.plan.slots === 2*(4*6+7*4+7*4+4*6), c.plan.slots);
log("slots readout", $("mSlots").textContent.includes("/ 252"), $("mSlots").textContent);
log("levels readout", $("mLevels").textContent==="\u00b14 / \u00b17 / \u00b17 / \u00b14", $("mLevels").textContent);

// duration must be untouched by modulation
const dur=ws=>{let u=0;for(let i=0;i<ws.length-2;i+=2)u+=(((ws[i+1]>>6)&0o7777)+1);return u*350/1e6;};
T.setMod({on:false}); const d0=dur(T.M.info.words);
T.setMod({on:true, shape:"wow", rates:[.6,.6,.6,.6], depths:[14,14,14,14]}); const d1=dur(T.M.info.words);
log("duration unchanged by drift", Math.abs(d0-d1)<1e-9, `${d0.toFixed(6)}s vs ${d1.toFixed(6)}s`);

// every segment still >= the 700us floor
let minM=1e9; const ws=T.M.info.words;
for(let i=0;i<ws.length-2;i+=2) minM=Math.min(minM,(ws[i+1]>>6)&0o7777);
log("no segment under the 700us floor", minM>=1, "min loopct/2 = "+minM);

// pitch slots actually vary over time on a held note
const seg=i=>[(ws[i*2]>>12)&63,(ws[i*2]>>6)&63,ws[i*2]&63,ws[i*2+1]&63];
const v2=[]; for(let i=0;i<40;i++) v2.push(seg(i)[1]);
log("alto walks through slots", new Set(v2).size>3, `${new Set(v2).size} distinct slots in first 40 segs`);

// variant increments are the right distance apart
T.retune(T.M.pdp1); T.writeVariants(T.M.pdp1,T.M.info.plan,T.S.mod);
const pl=T.M.info.plan, p0=pl.used[1][0], mapv=pl.slot[1][p0];
const base=T.M.pdp1.examine(T.TAB+0o100+p0);
const top=T.M.pdp1.examine(T.TAB+0o100+mapv[pl.m[1]]);
const cents=1200*Math.log2(top/base);
log("top variant = +depth cents", Math.abs(cents-14)<0.3, cents.toFixed(2)+"c (expect 14)");
const bot=T.M.pdp1.examine(T.TAB+0o100+mapv[-pl.m[1]]);
log("bottom variant = -depth cents", Math.abs(1200*Math.log2(bot/base)+14)<0.3, (1200*Math.log2(bot/base)).toFixed(2));
log("variant slots don't collide with used pitches",
  Object.values(pl.slot[1]).every(mm=>Object.entries(mm).every(([l,s])=>+l===0||!pl.used[1].includes(s))));

// LFO shapes
const R1={shape:"wow",rates:[1,1,1,1]};
log("wow is a sine", Math.abs(T.modLfo(0,0,R1))<1e-9 && Math.abs(T.modLfo(0,0.25,R1)-1)<1e-9);
const DR={shape:"drift",rates:[.4,.4,.4,.4],seed:7};
const dr=[...Array(50)].map((_,i)=>T.modLfo(0,i*0.05,DR));
log("drift is bounded & smooth", dr.every(x=>x>=-1&&x<=1) && Math.max(...dr.map((x,i)=>i?Math.abs(x-dr[i-1]):0))<0.35);
log("drift is deterministic", T.modLfo(0,3,DR)===T.modLfo(0,3,DR));
log("voices are out of phase", T.modLfo(0,0,R1)!==T.modLfo(1,0,R1));

// per-voice enable
T.setMod({depths:[0,20,0,0]});
log("zero-depth voices keep their slots", T.M.info.plan.m.join("/")==="4/7/7/4", T.M.info.plan.m.join("/"));
T.setMod({depths:[14,14,14,14]});

// cost scales with rate; capacity guard fires
T.setMod({rates:[.2,.2,.2,.2]}); const lo=T.M.info.segs;
T.setMod({rates:[4,4,4,4]}); const hi=T.M.info.segs;
log("rate is FREE - cost is fixed by the grid", hi===lo, `${lo} @0.2Hz, ${hi} @4Hz`);
T.setMod({rates:[.6,.6,.6,.6], grid:8}); const g8=T.M.info.segs;
T.setMod({grid:32}); const g32=T.M.info.segs;
log("grid drives the cost", g32 > g8*3, `grid 8 -> ${g8} segs, grid 32 -> ${g32}`);
T.setMod({grid:16});
const huge=T.compileStream({bpm:108,res:16,voices:T.S.voices.map(v=>({order:v.order,patterns:v.patterns}))},
  64,16,{on:true,shape:"wow",rates:[1,1,1,1],depths:[14,14,14,14],grid:400,seed:7,voices:[true,true,true,true]});
log("capacity guard trips on an impossible stream", huge.over===true, `${huge.segs} segs @400/s grid`);
T.setMod({rate:0.6, on:true, shape:"wow"});

// tape carries the tables now
const tape=T.rimTape(T.M.info.words, T.liveTables());
log("tape includes 256 table words", tape.length > 1904+256*6-50, tape.length+" bytes");
console.log(bad?"FAILURES "+bad:"ALL GOOD"); process.exitCode=bad?1:0;
