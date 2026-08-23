const fs = require("fs");
const { PDP1 } = require("../engine/pdp1.js");
const {RIM_B64,TEMPERAMENTS}=require("../engine/assets.js");
const E = require("../engine/engine.js");

const rim = Buffer.from(RIM_B64, "base64");
const pdp1 = new PDP1(3);
pdp1.address = 0o4;
pdp1.readIn(new Uint8Array(rim));
console.log("after readIn: running =", pdp1.running, " pc =", pdp1.pc.toString(8));

// sanity: is the player image actually in core?
const chk = a => pdp1.examine(a).toString(8).padStart(6,"0");
console.log("pla(1671) =", chk(0o1671), "expect 201 0000-ish 'lac (10000'");
console.log("pt[2] (C1) =", pdp1.examine(0o2137+2), "expect 1500");
console.log("pt[63](C#6)=", pdp1.examine(0o2137+63), "expect 50863");
console.log("tuw =", chk(0o11), "expect 642017");
console.log("detune tab[300+2] before tun =", pdp1.examine(0o300+2), "(expect 0, tun not run yet)");

// --- build a trivial 4-voice test: a C major triad + a melody note, 1 second ---
const ROWS = 16, RES = 4;
const pat = (rows) => { const p = Array.from({length:ROWS},()=>({n:null,v:null}));
  rows.forEach(([r,n])=>p[r]={n,v:null}); return p; };
const song = { bpm: 120, res: RES, voices: [
  { order:[0], patterns:{0: pat([[0,72],[4,74],[8,76],[12,77]]) } },  // C5 D5 E5 F5
  { order:[0], patterns:{0: pat([[0,64]]) } },                        // E4 drone
  { order:[0], patterns:{0: pat([[0,60]]) } },                        // C4 drone
  { order:[0], patterns:{0: pat([[0,48]]) } },                        // C3 drone
]};
const c = E.compileStream(song, ROWS, RES);
console.log("\ncompiled:", c.segs, "segments,", c.words.length, "words, clipped", c.clipped, "over", c.over);
console.log("words (octal):", c.words.map(w=>w.toString(8).padStart(6,"0")).join(" "));

E.retune(pdp1);            // build the detuned tables + plant the launcher
E.loadStream(pdp1, c.words);
console.log("cb =", chk(0o253), " stream[0] =", chk(0o10700));

const t0 = Date.now();
const r = E.render(pdp1, 44100, false, 10);
console.log("\nrendered", r.seconds.toFixed(4), "s in", Date.now()-t0, "ms; nxt fetches =", r.nxtCount, "(expect", c.segs+1, ")");
console.log("tab[300+2] after tun =", pdp1.examine(0o300+2), "(should be ~1500, detuned)");

// expected duration: sum over segments of (m+1)*350us
let exp = 0;
for (let i=0;i<c.words.length-2;i+=2) exp += (((c.words[i+1] >> 6) & 0o7777)+1)*350;
console.log("predicted", (exp/1e6).toFixed(4), "s   actual", r.seconds.toFixed(4), "s");

// NOTE: this mixed-channel edge count is unreliable (v1 and v2 sum with opposite
// polarity). legacy-04 supersedes it with a proper per-flag measurement.
function measure(buf, from, to, sign){
  let edges = 0, prev = 0;
  for (let i=from;i<to;i++){ const v = sign*buf[i] > 0.1 ? 1 : 0; if (v !== prev) edges++; prev = v; }
  return edges / 2 / ((to-from)/44100);
}
// left = v1(+) and v2(-) summed, so isolate by rendering... instead check right (v3 +, v4 -)
console.log("\n--- pitch check (edge counting on the mixed channels) ---");
const f = (m)=> 440*Math.pow(2,(m-69)/12);
console.log("expected C5", f(72).toFixed(1), "E4", f(64).toFixed(1), "C4", f(60).toFixed(1), "C3", f(48).toFixed(1));
console.log("left +0.5 crossings 0-0.4s :", measure(r.left, 0, 17640, 1).toFixed(1), "Hz (v1 C5 expected", f(72).toFixed(1)+")");
console.log("right rate 0-0.4s:", measure(r.right, 0, 17640, 1).toFixed(1), "Hz (v3 C4 expected", f(60).toFixed(1)+")");
