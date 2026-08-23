// End-to-end audio proof through the exact code path the page uses.
const fs=require("fs"); const { PDP1 }=require("../engine/pdp1.js");
const { RIM_B64 }=require("../engine/assets.js"); const E=require("../engine/engine.js");
const RIM=new Uint8Array(Buffer.from(RIM_B64,"base64"));
const olson=JSON.parse(fs.readFileSync(require("path").join(__dirname,"..","songs","olson.json"),"utf8"));
const song={bpm:olson.bpm,res:olson.res,voices:olson.voices.map(v=>({order:v.order,patterns:v.patterns}))};
const pdp1=new PDP1(3); const basePt=E.boot(pdp1,RIM);

function run(label, temp, tuw, chm){
  E.patchPitchTable(pdp1, basePt, temp);
  pdp1.deposit(0o11, tuw); E.retune(pdp1);
  const c=E.compileStream(song, olson.res*4, olson.res, {on:false});
  E.loadStream(pdp1,c.words);
  const t0=Date.now(); const r=E.render(pdp1,44100,chm,900); const ms=Date.now()-t0;
  // measure voice 3's actual sounding pitch on the first drone note (G#3 = midi 56)
  const idx=56-22, inc=pdp1.examine(0o500+idx), hz=inc*5714.285714/262144*(chm?E.CHM_FACTOR:1);
  console.log(`${label.padEnd(22)} ${r.seconds.toFixed(2)}s  segs ${c.segs}  render ${ms}ms  TEN G#3 = ${hz.toFixed(2)} Hz`);
  return r;
}
const eq=[0,0,0,0,0,0,0,0,0,0,0,0];
const mean=[0,-23.95,-6.84,10.27,-13.69,3.42,-20.53,-3.42,-27.37,-10.27,6.84,-17.11];
const r=run("equal / CHM stock", eq, 0o642017, true);
run("equal / SPEC clock",       eq, 0o642017, false);
run("equal / no detune",        eq, 0o444400, true);
run("meantone / CHM",         mean, 0o642017, true);

// write a WAV of the first 20s so the render is inspectable
const n=Math.min(r.left.length, 44100*20);
const dv=new DataView(new ArrayBuffer(44+n*4));
const str=(o,s)=>{for(let i=0;i<s.length;i++)dv.setUint8(o+i,s.charCodeAt(i));};
str(0,"RIFF");dv.setUint32(4,36+n*4,true);str(8,"WAVEfmt ");dv.setUint32(16,16,true);
dv.setUint16(20,1,true);dv.setUint16(22,2,true);dv.setUint32(24,44100,true);
dv.setUint32(28,44100*4,true);dv.setUint16(32,4,true);dv.setUint16(34,16,true);
str(36,"data");dv.setUint32(40,n*4,true);
for(let i=0;i<n;i++){dv.setInt16(44+i*4,r.left[i]*32767,true);dv.setInt16(46+i*4,r.right[i]*32767,true);}
fs.writeFileSync("/tmp/olson20.wav",Buffer.from(dv.buffer));
console.log("\nwrote /tmp/olson20.wav");
// spectral check: dominant frequency of the right channel over 0-1s (bass+tenor drone)
function domFreq(buf,from,len,lo,hi){
  let best=0,bf=0;
  for(let f=lo;f<=hi;f+=0.25){
    let re=0,im=0; const w=2*Math.PI*f/44100;
    for(let i=0;i<len;i++){re+=buf[from+i]*Math.cos(w*i);im+=buf[from+i]*Math.sin(w*i);}
    const m=re*re+im*im; if(m>best){best=m;bf=f;}
  }
  return bf;
}
console.log("right-channel dominant 0-0.5s:",domFreq(r.right,4410,22050,100,220).toFixed(2),
  "Hz  (TEN G#3 expected 189.9, BAS E3 expected 151.1)");
