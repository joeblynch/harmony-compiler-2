const { JSDOM } = require("jsdom"); const fs = require("fs");
const html = fs.readFileSync(require("path").join(__dirname,"..","app","pulse4-pdp1.html"),"utf8");
const dom = new JSDOM(html, { runScripts:"outside-only", pretendToBeVisual:true });
const w = dom.window;
class P{constructor(){this.value=0}setValueAtTime(){}linearRampToValueAtTime(){}setTargetAtTime(){}cancelScheduledValues(){}}
class N{constructor(){this.gain=new P();this.frequency=new P();this.Q=new P()}connect(){return this}start(){}stop(){}disconnect(){}setPeriodicWave(){}}
class AC{constructor(){this.currentTime=0;this.destination=new N()}createGain(){return new N()}createOscillator(){return new N()}
  createDynamicsCompressor(){return new N()}createPeriodicWave(){return{}}createBufferSource(){return new N()}
  createBiquadFilter(){return new N()}resume(){}}
w.AudioContext=AC; w.OfflineAudioContext=AC; w.requestAnimationFrame=()=>0; w.confirm=()=>true;
w.atob = s => Buffer.from(s,"base64").toString("binary");
const script = html.slice(html.indexOf("<script>")+8, html.indexOf("</script>"));
w.eval(script + ';window.__T={get S(){return S},get M(){return M},get ROWS(){return ROWS},get RES(){return RES},'+
  'compileNow,compileStream,rimTape,noteName,voiceMult,a4Hz,tuwFields,tuwBias,setTuw,selectFrame,setRes,TEMPERAMENTS,applyMachine,buildPattern,shownPat,putVol,setTemp:(t)=>{S.temp=t;applyMachine();},setNote:(v,r,n)=>{shownPat(v)[r].n=n;buildPattern();},setDirty:(d)=>{M.dirty=d;},reload:()=>{loadCompact(OLSON);renderAll();},a440Tuw,renderMachine,setTuw2:(t)=>{S.tuw=t;applyMachine();renderMachine();}};');
const T=w.__T, $=id=>w.document.getElementById(id);
let bad=0; const log=(n,ok,x="")=>{console.log((ok?"PASS":"FAIL"),n,x); if(!ok)bad++;};

log("machine booted", T.M.ready === true);
log("Olson loaded, 64 rows", T.ROWS===64 && $("prows").children.length===64);
log("compiled at boot", T.M.info && T.M.info.segs===116, T.M.info && T.M.info.segs);
log("no clipped notes", T.M.info.clipped===0);
log("under capacity", T.M.info.over===false);
log("channel labels L+/L-/R+/R-", $("cheads").textContent.includes("L+") && $("cheads").textContent.includes("R\u2212"));
log("no duty control", !$("cheads").querySelector('[data-act="duty"]'));
log("13 temperaments listed", $("tempSel").children.length===13, $("tempSel").children.length);
log("A4 readout present", /Hz$/.test($("a4Val").textContent), $("a4Val").textContent);
log("A4 at CHM stock 425-435", T.a4Hz()>425 && T.a4Hz()<435, T.a4Hz().toFixed(2));
log("spread readout", $("spreadVal").textContent.includes("\u00a2"), $("spreadVal").textContent);
log("segments readout", $("stSegs").textContent==="116 / 3646", $("stSegs").textContent);
log("stream dump rendered", $("dump").innerHTML.includes("<b>"));
log("tape length shown", $("stTape").textContent.includes("ft"), $("stTape").textContent);

// tuw round-trip
const f=T.tuwFields(0o642017), b=T.tuwBias(0o642017);
log("tuw fields 6,4,2,0", f.join(",")==="6,4,2,0", f.join(","));
log("tuw bias 15", b===15, b);
log("tuw rebuild", T.setTuw(f,b)===0o642017);
log("voice mults 32/30/28/26 over 512", [0,1,2,3].map(v=>Math.round((T.voiceMult(v)-1)*512)).join(",")==="32,30,28,26",
    [0,1,2,3].map(v=>Math.round((T.voiceMult(v)-1)*512)).join(","));

// temperament changes the tables
const before = T.M.pdp1.examine(0o300 + (61-22));    // C#4 on voice 1
T.setTemp("meantone");
const after = T.M.pdp1.examine(0o300 + (61-22));
log("meantone shifts C#", after < before, `${before} -> ${after} (${(1200*Math.log2(after/before)).toFixed(1)} cents, expect -24)`);
T.setTemp("equal");
log("equal restores", T.M.pdp1.examine(0o300+(61-22))===before);

// out-of-range flagging
T.setNote(0,0,100);
log("out-of-range flagged red", w.document.querySelector(".nt.bad")!==null);
T.setNote(0,0,68);

// rim tape
const t=T.rimTape(T.M.info.words);
log("rim tape bytes", t.length===1898, t.length);
log("tape ft readout (incl. tables)", $("stTape").textContent.startsWith("28.6"), $("stTape").textContent);
log("rim starts with blank leader", t[0]===0 && t[255]===0 && (t[256]&0o200)!==0);

// edits mark the tape dirty
T.setDirty(false); T.putVol(9);
log("edit sets dirty", T.M.dirty===true);
console.log(bad?"FAILURES "+bad:"all good"); process.exitCode=bad?1:0;

// cross-check: the in-page compiler must agree word-for-word with the standalone engine
const E = require("../engine/engine.js");
const olson = JSON.parse(fs.readFileSync(require("path").join(__dirname,"..","songs","olson.json"),"utf8"));
const ref = E.compileStream({bpm:olson.bpm,res:olson.res,voices:olson.voices.map(v=>({order:v.order,patterns:v.patterns}))}, olson.res*4, olson.res);
T.reload();
const mine = T.compileNow(false);
log("in-page compiler == standalone", JSON.stringify(mine.words)===JSON.stringify(ref.words),
    `${mine.words.length} vs ${ref.words.length} words`);
log("lamp table present", mine.sound && mine.sound.length===4);
log("lamp: v1 silent at bar 1, v2 lit", mine.sound[0][0]===0 && mine.sound[1][0]!==0);
log("lamp: v1 lit at bar 9", mine.sound[0][8*64+1]!==0);
console.log(bad?"FAILURES "+bad:"ALL GOOD"); process.exitCode=bad?1:0;

// ================= tuning presets must not move the instrument's pitch =================
const HZ = () => { const t=[0,1,2,3].map(v=>T.M.pdp1.examine(0o300+v*0o100+(69-22)));
  return t.reduce((a,b)=>a+b)/4 * 5714.285714/262144 * 0.92559; };
const A440 = T.a440Tuw();
T.setTuw2(0o642017); const aStock = HZ();
log("stock A4 unchanged from earlier dev", Math.abs(aStock-430.31)<0.05, aStock.toFixed(2)+" Hz");
T.setTuw2(T.setTuw([4,4,4,4], T.tuwBias(T.S.tuw)));
const aFlat = HZ();
log("NO SPREAD keeps the tuning", Math.abs(1200*Math.log2(aFlat/aStock))<8,
    `${aFlat.toFixed(2)} Hz (${(1200*Math.log2(aFlat/aStock)).toFixed(1)}c from stock)`);
log("NO SPREAD really zeroes the spread",
    Math.abs(1200*Math.log2(T.voiceMult(0)/T.voiceMult(3)))<0.01);
T.setTuw2(0o642017);
log("the old NONE preset would have dropped ~95c",
    Math.abs(1200*Math.log2((20185*5714.285714/262144*0.92559)/aStock)+95.3)<0.5,
    (1200*Math.log2((20185*5714.285714/262144*0.92559)/aStock)).toFixed(1)+"c");
T.setTuw2(A440);
log("A=440 preset lands on concert pitch", Math.abs(HZ()-440)<0.6, HZ().toFixed(2)+" Hz");
log("A=440 has no spread", Math.abs(1200*Math.log2(T.voiceMult(0)/T.voiceMult(3)))<0.01);
T.setTuw2(0o642017);
log("back to stock", Math.abs(HZ()-430.31)<0.05, HZ().toFixed(2)+" Hz");
console.log(bad?"FAILURES "+bad:"ALL GOOD"); process.exitCode=bad?1:0;
