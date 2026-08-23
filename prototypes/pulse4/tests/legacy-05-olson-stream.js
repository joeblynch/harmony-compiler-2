const fs=require("fs");
const { PDP1 } = require("../engine/pdp1.js");
const { RIM_B64 } = require("../engine/assets.js");
const E = require("../engine/engine.js");
const RIM = new Uint8Array(Buffer.from(RIM_B64,"base64"));
const olson = JSON.parse(fs.readFileSync(require("path").join(__dirname,"..","songs","olson.json"),"utf8"));
const RES = olson.res, ROWS = RES*4;
const song = { bpm: olson.bpm, res: RES, voices: olson.voices.map(v=>({
  order: v.order, patterns: Object.fromEntries(Object.entries(v.patterns)) })) };

const c = E.compileStream(song, ROWS, RES);
console.log(`Olson: ${c.bars} bars x ${ROWS} rows = ${c.ticks} ticks`);
console.log(`-> ${c.segs} segments (${c.words.length} words) of ${E.CAP_SEG} capacity = ${(c.segs/E.CAP_SEG*100).toFixed(1)}%`);
console.log(`   clipped notes: ${c.clipped}, over capacity: ${c.over}`);
let exp=0; for(let i=0;i<c.words.length-2;i+=2) exp+=(((c.words[i+1]>>6)&0o7777)+1)*350;
console.log(`   predicted wall time (spec): ${(exp/1e6).toFixed(3)} s;  at CHM: ${(exp/1e6/E.CHM_FACTOR).toFixed(3)} s`);
console.log(`   tracker's own length: ${(c.ticks*c.rowUs/1e6).toFixed(3)} s`);

const pdp1 = new PDP1(3);
E.boot(pdp1, RIM);
E.loadStream(pdp1, c.words);
const t0=Date.now();
const r = E.render(pdp1, 44100, true, 200);
const ms=Date.now()-t0;
console.log(`\nrendered ${r.seconds.toFixed(3)} s of audio in ${ms} ms (${(r.seconds*1000/ms).toFixed(1)}x realtime)`);
console.log(`nxt fetches: ${r.nxtCount} (expect ${c.segs+1})`);
console.log(`segment time drift: first=${r.segTimes[1].toFixed(4)}s last=${r.segTimes[r.segTimes.length-1].toFixed(4)}s`);

// check segTimes match the compiled timeline (tick -> time), i.e. the playhead map is exact
const rowSec = c.rowUs/1e6/E.CHM_FACTOR;
let maxErr=0;
for(let i=0;i<c.timeline.length;i++){
  const predicted = c.timeline[i]*rowSec;
  maxErr = Math.max(maxErr, Math.abs(predicted - r.segTimes[i]));
}
console.log(`playhead map max error: ${(maxErr*1000).toFixed(2)} ms over ${c.timeline.length} segments`);

// RMS / peak sanity
let peak=0,sum=0; for(let i=0;i<r.left.length;i++){const a=Math.abs(r.left[i]);if(a>peak)peak=a;sum+=r.left[i]*r.left[i];}
console.log(`left peak ${peak.toFixed(3)}  rms ${Math.sqrt(sum/r.left.length).toFixed(4)}`);
const tape = E.rimTape(c.words);
console.log(`\nRIM tape: ${tape.length} bytes (${(tape.length/1024).toFixed(1)} KB of paper)`);
console.log(`  at 10 frames/inch that's ${(tape.length/10/12).toFixed(1)} feet of tape`);
