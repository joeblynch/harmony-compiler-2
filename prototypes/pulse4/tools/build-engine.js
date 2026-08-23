/* Regenerates engine/{assets,pdp1,engine}.js from app/pulse4-pdp1.html.
   The HTML is the single source of truth; these are node-requirable slices of
   it so the test suite exercises exactly the code that ships. */
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "app", "pulse4-pdp1.html"), "utf8");
const src = html.slice(html.indexOf("<script>") + 8, html.indexOf("</script>"));

const cut = (from, to) => {
  const a = src.indexOf(from), b = src.indexOf(to);
  if (a < 0 || b < 0 || b <= a) throw new Error("marker not found: " + from.slice(0, 40));
  return src.slice(a, b).trimEnd() + "\n";
};
const banner = "/* GENERATED from app/pulse4-pdp1.html by tools/build-engine.js — do not edit. */\n";
const write = (f, body, exports) =>
  fs.writeFileSync(path.join(root, "engine", f), banner + body + "\nmodule.exports = { " + exports + " };\n");

write("assets.js", cut('const RIM_B64="', "const W_LEN = 18;"), "RIM_B64, TEMPERAMENTS");
write("pdp1.js",   cut("const W_LEN = 18;", "/* ============================================================================\n   PULSE//4"),
      "PDP1, W_MASK");
write("engine.js", cut("/* ============================================================================\n   PULSE//4",
                       "/* ================= state ================= */"),
      ["compileStream","loadStream","writeStreamPitches","streamAddrs","segAddr","render","rimTape",
       "patchPitchTable","planVariants","writeVariants","modLfo","boot","retune",
       "PT_BASE","PT_LEN","TUW","TAB","STREAM0","STUB","PLA","NXT","CAP_SEG","BANK_SPAN","NOF","NOG",
       "MIDI_MIN","MIDI_MAX","CHM_FACTOR","US_UNIT","MAX_M"].join(", "));
console.log("engine/ regenerated from app/pulse4-pdp1.html");
