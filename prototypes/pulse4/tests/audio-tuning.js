const E=require("../tools/extract-engine.js"); const fs=require("fs");
const RIM=new Uint8Array(Buffer.from(E.RIM_B64,"base64"));
const pdp1=new E.PDP1(3); const basePt=E.boot(pdp1,RIM);
const setTuw=(f,b)=>((f[0]<<15)|(f[1]<<12)|(f[2]<<9)|(f[3]<<6)|(b&0o77));
const hz=inc=>inc*5714.285714/262144*E.CHM_FACTOR;   // CHM clock
function show(label,tuw){
  pdp1.deposit(0o11,tuw); E.retune(pdp1);
  const a4=[0,1,2,3].map(v=>pdp1.examine(0o300+v*0o100+(69-22)));
  const ten=pdp1.examine(0o500+(56-22));             // TEN G#3, the number we logged before
  const mean=a4.reduce((x,y)=>x+y)/4;
  console.log(`${label.padEnd(28)} tuw=${tuw.toString(8).padStart(6,"0")}  A4=${hz(mean).toFixed(2)}Hz  ` +
    `TEN G#3=${hz(ten).toFixed(2)}Hz  vs stock ${(1200*Math.log2(hz(ten)/202.69)).toFixed(1)}c`);
}
console.log("reference from earlier in development: TEN G#3 = 202.69 Hz, BAS E3 = 160.25 Hz\n");
show("CHM stock (default)",        0o642017);
show("DETUNE=NONE  (as shipped)",  setTuw([4,4,4,4],0));
show("spread zeroed, bias kept",   setTuw([4,4,4,4],15));
// what bias lands A4 on 440?
let best=null;
for(let f=0;f<8;f++) for(let b=-32;b<32;b++){
  const m=1+((f-4)+2*b)/512, a=basePt[47]*5714.285714/262144*m*E.CHM_FACTOR;
  if(!best||Math.abs(a-440)<Math.abs(best.a-440)) best={f,b,a};
}
console.log(`\nclosest A=440 at CHM clock: field ${best.f}, bias ${best.b} -> ${best.a.toFixed(2)} Hz`);
show("A=440 preset", setTuw([best.f,best.f,best.f,best.f],best.b));
