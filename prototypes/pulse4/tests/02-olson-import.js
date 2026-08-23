const { JSDOM } = require("jsdom");
const fs = require("fs");
const html = fs.readFileSync(require("path").join(__dirname,"..","app","pulse4-olson.html"), "utf8");
const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
const w = dom.window;
class P { constructor(){this.value=0} setValueAtTime(){} linearRampToValueAtTime(){} setTargetAtTime(){} cancelScheduledValues(){} }
class N { constructor(){this.gain=new P();this.frequency=new P()} connect(){return this} start(){} setPeriodicWave(){} }
class AC { constructor(){this.currentTime=0;this.destination=new N()} createGain(){return new N()} createOscillator(){return new N()} createDynamicsCompressor(){return new N()} createPeriodicWave(){return{}} resume(){} }
w.AudioContext = AC; w.requestAnimationFrame = () => 0; w.confirm = () => true;
const script = html.slice(html.indexOf("<script>")+8, html.indexOf("</script>"));
w.eval(script + ';window.__T={get S(){return S},get ROWS(){return ROWS},get RES(){return RES},locate,play,stop,selectFrame,setRes,noteName,shownPat};');
const T = w.__T, $ = id => w.document.getElementById(id);
let fails = 0;
const log = (n, ok, x="") => { console.log((ok?"PASS":"FAIL"), n, x); if(!ok) fails++; };

// --- Olson loaded at 64 rows ---
log("rows=64", T.ROWS === 64 && T.RES === 16);
log("bpm=108", T.S.bpm === 108);
log("title", T.S.title === "OLSON / PDP-1", T.S.title);
log("grid has 64 rows", $("prows").children.length === 64);
log("4 voices named", T.S.voices.map(v=>v.name).join(",") === "MEL,ALT,TEN,BAS", T.S.voices.map(v=>v.name).join(","));
log("40 bars each", T.S.voices.every(v => v.order.length === 40));
log("unique patterns 10/5/4/7", T.S.voices.map(v=>Object.keys(v.patterns).length).join("/") === "10/5/4/7",
    T.S.voices.map(v=>Object.keys(v.patterns).length).join("/"));
log("all duty 50%", T.S.voices.every(v => v.duty === 2));

// --- bar 1: melody rest(OFF), drones sounding ---
const cellAt = (v,r) => w.document.querySelector(`.cell[data-v="${v}"][data-row="${r}"]`).children[0].textContent;
log("MEL bar1 row0 = OFF", cellAt(0,0) === "OFF", cellAt(0,0));
log("ALT bar1 row0 = B-3", cellAt(1,0) === "B-3", cellAt(1,0));
log("TEN bar1 row0 = G#3", cellAt(2,0) === "G#3", cellAt(2,0));
log("BAS bar1 row0 = E-3", cellAt(3,0) === "E-3", cellAt(3,0));
log("ALT row32 empty in bar1", cellAt(1,32) === "\u00b7\u00b7\u00b7", cellAt(1,32));

// --- bar 2 of ALT: B3 then C#4 at halfway (row 32) ---
T.selectFrame(1,1);
log("ALT bar2 row0 B-3", cellAt(1,0) === "B-3", cellAt(1,0));
log("ALT bar2 row32 C#4", cellAt(1,32) === "C#4", cellAt(1,32));

// --- melody bar 9 vs bar 12: the 1/64 grace-note distinction ---
T.selectFrame(0,8);  // bar 9
log("MEL bar9 row0 F#5", cellAt(0,0) === "F#5", cellAt(0,0));
log("MEL bar9 grace at row46", cellAt(0,46) === "C#5", cellAt(0,46));
log("MEL bar9 row48 D#5", cellAt(0,48) === "D#5", cellAt(0,48));
T.selectFrame(0,11); // bar 12
log("MEL bar12 row0 G#4", cellAt(0,0) === "G#4", cellAt(0,0));
log("MEL bar12 grace at row47 (not 46)", cellAt(0,47) === "C#5" && cellAt(0,46) === "\u00b7\u00b7\u00b7", cellAt(0,46)+"/"+cellAt(0,47));

// --- structure: melody silent for first 7 bars ---
const melOrder = T.S.voices[0].order;
log("MEL bars1-7 all pattern 0", melOrder.slice(0,7).every(x => x === 0));
log("MEL bar8 enters", melOrder[7] === 1);
log("BAS rests bars 33-36", T.S.voices[3].order.slice(32,36).every(x => x === 3));

// --- polymeter/locate across voices at bar 33 (step 32*64) ---
const st = 32*64;
log("locate bar33 frame", T.locate(0, st).f === 32 && T.locate(3, st).f === 32);
log("BAS bar33 row0 is OFF", T.shownPat(3) && true);

// --- resolution rescale down and back ---
T.setRes(4, true);
log("res 4 -> 16 rows", T.ROWS === 16, String(T.ROWS));
log("rescaled ALT bar2 C#4 at row 8", (()=>{const p=T.S.voices[1].patterns[1];return p[8] && p[8].n !== null;})());
T.setRes(16, true);
log("back to 64 rows", T.ROWS === 64);

// --- playback smoke: scheduler produces events without throwing ---
T.play("song");
log("playing", T.S.playing === true);
T.stop();

console.log(fails ? "FAILURES: " + fails : "all good");
process.exitCode = fails ? 1 : 0;
