const { PDP1 } = require("../engine/pdp1.js");
const { RIM_B64 } = require("../engine/assets.js");
const pdp1 = new PDP1(3);
pdp1.address=0o4; pdp1.readIn(new Uint8Array(Buffer.from(RIM_B64,"base64")));
// run tun alone
pdp1.deposit(0o2400, 0o620212); pdp1.deposit(0o2401, 0o760400); // jsp tun ; hlt
pdp1.singleInstruction=false; pdp1.breakpoint=null;
pdp1.start(0o2400);
const pt=i=>pdp1.examine(0o2137+i);
const cents=(a,b)=>1200*Math.log2(a/b);
console.log("idx  pt      v1      v2      v3      v4      cents v1/v2/v3/v4");
for (const i of [2,26,38,50,63]){
  const b=pt(i), v=[0,1,2,3].map(v=>pdp1.examine(0o300+v*0o100+i));
  console.log(String(i).padStart(3), String(b).padStart(7), v.map(x=>String(x).padStart(7)).join(" "),
    " ", v.map(x=>cents(x,b).toFixed(1)).join(" / "));
}
console.log("\ntuw =", pdp1.examine(0o11).toString(8), " tix =", pdp1.examine(0o27).toString(8));
console.log("tw0/tw1/tw2 after =", pdp1.examine(0o207), pdp1.examine(0o210), pdp1.examine(0o211));
const f=i=>(i*5714.285714/262144);
console.log("\npt[50]=c5 ->", f(pt(50)).toFixed(2),"Hz (523.25 expected)");
console.log("v1 c5 ->", f(pdp1.examine(0o300+50)).toFixed(2), "Hz");
