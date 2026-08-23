const { JSDOM } = require("jsdom");
const fs = require("fs");
const html = fs.readFileSync(require("path").join(__dirname,"..","app","pulse4-synth.html"), "utf8");

// stub AudioContext before scripts run
const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
const w = dom.window;
class FakeParam { constructor(){this.value=0} setValueAtTime(){} linearRampToValueAtTime(){} setTargetAtTime(){} cancelScheduledValues(){} }
class FakeNode { constructor(){this.gain=new FakeParam();this.frequency=new FakeParam()} connect(){return this} start(){} setPeriodicWave(){} }
class FakeAC {
  constructor(){ this.currentTime = 0; this.destination = new FakeNode(); }
  createGain(){ return new FakeNode() }
  createOscillator(){ return new FakeNode() }
  createDynamicsCompressor(){ return new FakeNode() }
  createPeriodicWave(){ return {} }
  resume(){}
}
w.AudioContext = FakeAC;
w.requestAnimationFrame = () => 0;

// now run the inline script manually
const script = html.split("<script>")[1].split("</script>")[0];
s = script + ";window.__T={get S(){return S}, locate, play, stop, selectFrame, frameAdd, patClone};";
w.eval(s);

const $ = id => w.document.getElementById(id);
const log = (name, ok, extra="") => { console.log((ok?"PASS":"FAIL"), name, extra); if(!ok) process.exitCode = 1; };

// 1. grid rendered: 16 rows, 4 cells + rownum each
log("16 pattern rows", $("prows").children.length === 16);
log("5 cols per row", $("prows").children[0].children.length === 5);

// 2. seed content: SQ1 row0 = C-5, vol C
let cell = w.document.querySelector('.cell[data-v="0"][data-row="0"]');
log("seed note C-5", cell.children[0].textContent === "C-5", cell.children[0].textContent);
log("seed vol C", cell.children[1].textContent === "C", cell.children[1].textContent);
// off row
let cOff = w.document.querySelector('.cell[data-v="0"][data-row="3"]');
log("seed OFF", cOff.children[0].textContent === "OFF");

// 3. song view: SQ1 has 2 frames + add btn, SQ2 has 1 frame
const cols = $("scols").children;
log("SQ1 frames=2", cols[0].querySelectorAll(".frame").length === 2);
log("SQ2 frames=1", cols[1].querySelectorAll(".frame").length === 1);

// 4. keyboard note entry: press q -> C of octave+1 at cursor row 0, advances to row1
const kd = k => w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: k, bubbles: true }));
kd("q"); // C5 at default octave 4 -> midi (4+1)*12+12 = 72 = C-5
cell = w.document.querySelector('.cell[data-v="0"][data-row="0"]');
log("entered C-5 via q", cell.children[0].textContent === "C-5");
let curEl = w.document.querySelector(".cur");
log("cursor advanced to row1", curEl && curEl.closest(".cell").dataset.row === "1", curEl && curEl.closest(".cell").dataset.row);

// 5. vol entry: move right to vol col, press a -> A
kd("ArrowRight");
kd("a");
cell = w.document.querySelector('.cell[data-v="0"][data-row="1"]');
log("vol A entered", cell.children[1].textContent === "A", cell.children[1].textContent);

// 6. note-off & clear
kd("ArrowLeft"); // back to note col (row2 now after vol advance)
kd("1");
cell = w.document.querySelector('.cell[data-v="0"][data-row="2"]');
log("OFF via 1", cell.children[0].textContent === "OFF");
kd("ArrowUp"); kd("Delete");
cell = w.document.querySelector('.cell[data-v="0"][data-row="2"]');
log("cleared", cell.children[0].textContent === "\u00b7\u00b7\u00b7");

// 7. frame wrap: ArrowUp from row 0 goes to prev frame (wraps to F2) 
// cursor currently row 2; go up 3 times -> row -1 -> frame wrap to F2, row 15
kd("ArrowUp"); kd("ArrowUp"); kd("ArrowUp");
log("frame wrapped to F2", w.__T.S.voices[0].editFrame === 1 && w.__T.S.cursor.row === 15,
    "ef=" + w.__T.S.voices[0].editFrame + " row=" + w.__T.S.cursor.row);
log("header shows P01 after wrap", $("cheads").children[1].querySelector(".pnum").textContent === "01");

// 8. playback scheduling: play song, advance fake clock, check locate/polymeter
w.__T.play('song');
log("playing flag", w.__T.S.playing === true);
// simulate 17th step lookup: voice1 (order len 1) should wrap to frame 0, voice0 to frame 1
const loc0 = JSON.stringify({f: w.__T.locate(0,16).f, f2: w.__T.locate(1,16).f});
log("polymeter frames at step16", loc0 === '{"f":1,"f2":0}', loc0);
w.__T.stop();
log("stopped", w.__T.S.playing === false);

// 9. song ops: select SQ2 frame0, add frame, clone
w.__T.selectFrame(1,0);
w.__T.frameAdd(1);
log("frame added SQ2", w.__T.S.voices[1].order.length === 2);
w.__T.patClone(1,1);
log("clone assigned new id", w.__T.S.voices[1].order[1] !== w.__T.S.voices[1].order[0],
    JSON.stringify(w.__T.S.voices[1].order));
const V1=w.__T.S.voices[1]; const cloned = JSON.stringify(V1.patterns[V1.order[1]][0]);
const orig = JSON.stringify(V1.patterns[V1.order[0]][0]);
log("clone copied content", cloned === orig);

// 10. mute toggle via header
$("cheads").children[2].querySelector('[data-act="mute"]').click();
log("mute toggled SQ2", w.__T.S.voices[1].mute === true);

// 11. save payload shape
let saved = JSON.stringify({bpm:w.__T.S.bpm, nv:w.__T.S.voices.length});
log("save-able state", saved.includes('"nv":4'));
console.log("smoke done");
