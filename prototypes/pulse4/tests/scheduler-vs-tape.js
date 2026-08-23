const { JSDOM } = require("jsdom");
const fs = require("fs");
const html = fs.readFileSync(require("path").join(__dirname,"..","app","pulse4-olson.html"), "utf8");
const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
const w = dom.window;
class P { constructor(){this.value=0} setValueAtTime(){} linearRampToValueAtTime(){} setTargetAtTime(){} cancelScheduledValues(){} }
class N { constructor(){this.gain=new P();this.frequency=new P()} connect(){return this} start(){} setPeriodicWave(){} }
class AC { constructor(){this.currentTime=0;this.destination=new N()} createGain(){return new N()} createOscillator(){return new N()} createDynamicsCompressor(){return new N()} createPeriodicWave(){return{}} resume(){} }
w.AudioContext = AC; w.requestAnimationFrame = () => 0;
const script = html.slice(html.indexOf("<script>")+8, html.indexOf("</script>"));
w.eval(script + ';window.__T={locate};');
const T = w.__T;
// walk the same path the scheduler walks, recording what would sound
const out = [[],[],[],[]];
const cur = [null,null,null,null];
for (let step = 0; step < 40*64; step++){
  for (let v = 0; v < 4; v++){
    const { pat, row } = T.locate(v, step);
    const c = pat[row];
    if (c.n === "off") cur[v] = null;
    else if (c.n !== null) cur[v] = c.n;
    out[v].push(cur[v]);
  }
}
fs.writeFileSync("/tmp/actual.json", JSON.stringify(out));
console.log("simulated 2560 steps x 4 voices");
