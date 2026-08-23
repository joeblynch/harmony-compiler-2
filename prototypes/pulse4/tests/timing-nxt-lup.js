const E=require("../tools/extract-engine.js");
const RIM=new Uint8Array(Buffer.from(E.RIM_B64,"base64"));
const pdp1=new E.PDP1(3); E.boot(pdp1,RIM);
// three short segments so we cross nxt several times
const words=[];
for (let i=0;i<6;i++){ words.push((50<<12)|(45<<6)|40); words.push(((20&0o7777)<<6)|35); }
words.push(0,0);
E.loadStream(pdp1,words);
pdp1.singleInstruction=true; pdp1.breakpoint=null;
pdp1.cpu.pc=0o2400+3; pdp1.cpu.running=true;
let t=0, marks=[];
while(pdp1.cpu.running && t<5e5){
  const pc=pdp1.cpu.pc;
  if(pc===0o1740) marks.push({k:"nxt",t});
  if(pc===0o2014) marks.push({k:"lup",t});
  if(pc===0o1716) marks.push({k:"xbk",t});
  t+=pdp1.cpu.step();
}
// cost of nxt = time from entering nxt to the first lup after it
let costs=[];
for(let i=0;i<marks.length-1;i++)
  if(marks[i].k==="nxt" && marks[i+1].k==="lup") costs.push(marks[i+1].t-marks[i].t);
console.log("nxt -> first lup (us):", costs.join(" "));
console.log("declared design cost: 350 us   measured:", costs[0], "us   delta:", costs[0]-350);
// and the loop itself
const lups=marks.filter(m=>m.k==="lup").map(m=>m.t);
const d=[]; for(let i=1;i<12;i++) d.push(lups[i]-lups[i-1]);
console.log("lup passes (us):", d.join(" "));
