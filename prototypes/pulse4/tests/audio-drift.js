const fs=require("fs"); const E=require("../tools/extract-engine.js");
const RIM=new Uint8Array(Buffer.from(E.RIM_B64,"base64"));
const olson=JSON.parse(fs.readFileSync(require("path").join(__dirname,"..","songs","olson.json"),"utf8"));
const song={bpm:olson.bpm,res:olson.res,voices:olson.voices.map(v=>({order:v.order,patterns:v.patterns}))};
const ROWS=olson.res*4;
const pdp1=new E.PDP1(3); E.boot(pdp1,RIM);

function goertzelPeak(buf,from,len,lo,hi,step){
  let best=0,bf=0;
  for(let f=lo;f<=hi;f+=step){let re=0,im=0;const w=2*Math.PI*f/44100;
    for(let i=0;i<len;i++){re+=buf[from+i]*Math.cos(w*i);im+=buf[from+i]*Math.sin(w*i);}
    const m=re*re+im*im; if(m>best){best=m;bf=f;}}
  return bf;
}
function run(label, mod){
  const c=E.compileStream(song,ROWS,olson.res,mod);
  E.retune(pdp1); E.writeVariants(pdp1,c.plan,mod); E.loadStream(pdp1,c.words);
  const t0=Date.now(); const r=E.render(pdp1,44100,true,900); const ms=Date.now()-t0;
  let u=0; for(let i=0;i<c.words.length-2;i+=2) u+=(((c.words[i+1]>>6)&0o7777)+1);
  console.log(`${label.padEnd(26)} segs ${String(c.segs).padStart(5)}  ${r.seconds.toFixed(3)}s (predicted ${(u*350/1e6/E.CHM_FACTOR).toFixed(3)})  render ${ms}ms`);
  return r;
}
// bars 3-4 of the bass drone are a single held C#3 - perfect for measuring wobble
const rowSec=60/olson.bpm/olson.res/E.CHM_FACTOR;
const at=t=>Math.round(t*rowSec*44100);
const R=(r)=>[r,r,r,r], D=(d)=>[d,d,d,d];
const dry=run("drift off", {on:false,rates:R(0),depths:D(0),grid:16,seed:7});
const perv=run("per-voice mix", {on:true,shape:"wow",rates:[0.9,0.31,0.47,0.22],depths:[35,18,26,9],grid:16,seed:7});
const wet=run("wow 0.6Hz +-25c", {on:true,shape:"wow",rates:R(0.6),depths:D(25),grid:16,seed:7});
const drf=run("drift 0.35Hz +-40c", {on:true,shape:"drift",rates:R(0.35),depths:D(40),grid:16,seed:7});

// voice 4 (BAS) is C#3 through bars 3-4 -> right channel negative lobe
console.log("\ntracking BAS C#3 across bars 3-4 (held note), window 0.35s, 0.1Hz resolution:");
for (const [name,r] of [["dry",dry],["wow",wet],["drift",drf],["mixed",perv]]){
  const out=[];
  for(let k=0;k<8;k++){
    const from=at(2*ROWS+k*8), len=Math.round(0.35*44100);
    out.push(goertzelPeak(r.right,from,len,125,165,0.05).toFixed(2));
  }
  const nums=out.map(Number); const spread=1200*Math.log2(Math.max(...nums)/Math.min(...nums));
  console.log(` ${name.padEnd(6)} ${out.join(" ")}  Hz   -> excursion ${spread.toFixed(1)} cents`);
}
