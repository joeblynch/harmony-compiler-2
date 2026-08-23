const { PDP1 } = require("../engine/pdp1.js");
const { RIM_B64 } = require("../engine/assets.js");
const E = require("../engine/engine.js");
const RIM = new Uint8Array(Buffer.from(RIM_B64,"base64"));
const pdp1 = new PDP1(3);
const basePt = E.boot(pdp1, RIM);

const ROWS=16, RES=4;
const mk=(n)=>{const p=Array.from({length:ROWS},()=>({n:null,v:null}));p[0]={n,v:null};return {order:[0],patterns:{0:p}};};
// C5 / G4 / C4 / C3 held for a whole bar
const notes=[72,67,60,48];
const song={bpm:120,res:RES,voices:notes.map(mk)};
const c=E.compileStream(song,ROWS,RES);
E.loadStream(pdp1,c.words);

// step and count per-flag edges
pdp1.singleInstruction=true; pdp1.breakpoint=null;
pdp1.cpu.pc=0o2400+3; pdp1.cpu.running=true;
let t=0, edges=[0,0,0,0], prev=[0,0,0,0];
const masks=[0o40,0o20,0o10,0o04];
while(pdp1.cpu.running && t<5e6){
  t+=pdp1.cpu.step();
  for(let v=0;v<4;v++){const b=(pdp1.cpu.pf&masks[v])?1:0; if(b!==prev[v]){edges[v]++;prev[v]=b;}}
}
const secs=t/1e6;
console.log("play time",secs.toFixed(5),"s (expect 2.00000)");
console.log("\nvoice  written   tab inc   predicted Hz   measured Hz   err(cents)");
for(let v=0;v<4;v++){
  const idx=notes[v]-22;
  const inc=pdp1.examine(0o300+v*0o100+idx);
  const pred=inc*5714.285714/262144;
  const meas=edges[v]/2/secs;
  const cents=1200*Math.log2(meas/pred);
  const nm=["C-5","G-4","C-4","C-3"][v];
  console.log(` v${v+1}    ${nm}    ${String(inc).padStart(7)}   ${pred.toFixed(3).padStart(10)}   ${meas.toFixed(3).padStart(11)}   ${cents.toFixed(3).padStart(8)}`);
}
// equal-temperament reference and what the machine actually sounds like
console.log("\nnominal equal-temp: C5=523.251  G4=391.995  C4=261.626  C3=130.813");
const a4=pdp1.examine(0o300+ (69-22))*5714.285714/262144;
console.log("v1 table A4 =",a4.toFixed(2),"Hz  ->  at CHM speed:",(a4*E.CHM_FACTOR).toFixed(2),"Hz");
