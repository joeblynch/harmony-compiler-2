const { PDP1 } = require("../engine/pdp1.js");
const { RIM_B64 } = require("../engine/assets.js");
const E = require("../engine/engine.js");
const pdp1 = new PDP1(3);
pdp1.address = 0o4; pdp1.readIn(new Uint8Array(Buffer.from(RIM_B64,"base64")));

const ROWS=16, RES=4;
const pat=(rows)=>{const p=Array.from({length:ROWS},()=>({n:null,v:null}));rows.forEach(([r,n])=>p[r]={n,v:null});return p;};
const song={bpm:120,res:RES,voices:[
 {order:[0],patterns:{0:pat([[0,72]])}},{order:[0],patterns:{0:pat([[0,0]])}},
 {order:[0],patterns:{0:pat([[0,0]])}},{order:[0],patterns:{0:pat([[0,0]])}}]};
// force voices 2-4 to rest: use "off"
song.voices[1].patterns[0][0]={n:"off",v:null};
song.voices[2].patterns[0][0]={n:"off",v:null};
song.voices[3].patterns[0][0]={n:"off",v:null};
const c=E.compileStream(song,ROWS,RES);
console.log("words:",c.words.map(w=>w.toString(8).padStart(6,"0")).join(" "));
E.retune(pdp1);
E.loadStream(pdp1,c.words);

// step manually, timing lup passes and counting flag-1 edges
pdp1.singleInstruction=true; pdp1.breakpoint=null;
pdp1.cpu.pc=0o2400+3; pdp1.cpu.running=true;   // 2403 = jmp pla
let t=0, lupTimes=[], edges=0, prevF1=0, tunDone=0, firstNxt=null, instr=0;
const seq=[];
while(pdp1.cpu.running && t < 3e6){
  if(pdp1.cpu.pc===0o2014) lupTimes.push(t);
  if(pdp1.cpu.pc===0o1740 && firstNxt===null) firstNxt=t;
  if(lupTimes.length>=1 && lupTimes.length<=2) seq.push(pdp1.cpu.pc.toString(8));
  t += pdp1.cpu.step(); instr++;
  const f1=(pdp1.cpu.pf&0o40)?1:0; if(f1!==prevF1){edges++;prevF1=f1;}
}
console.log("total time",(t/1e6).toFixed(5),"s, instructions",instr);
console.log("tun+launch took",(firstNxt/1000).toFixed(1),"ms before first nxt");
const deltas=[]; for(let i=1;i<Math.min(20,lupTimes.length);i++)deltas.push(lupTimes[i]-lupTimes[i-1]);
console.log("lup pass deltas (us):",deltas.join(" "));
console.log("lup passes:",lupTimes.length);
console.log("one pass instruction trace:",seq.slice(0,45).join(" "));
console.log("flag1 edges:",edges,"-> freq",(edges/2/((t-firstNxt)/1e6)).toFixed(2),"Hz; C5 =",(440*Math.pow(2,(72-69)/12)).toFixed(2));
