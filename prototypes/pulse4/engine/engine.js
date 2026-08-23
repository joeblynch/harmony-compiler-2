/* GENERATED from app/pulse4-pdp1.html by tools/build-engine.js — do not edit. */
/* ============================================================================
   PULSE//4 → PDP-1 Music 13 engine.

   The tracker does NOT emit a Harmony Compiler intermediate tape. It emits the
   *compiled event stream* directly — the two-word segments that Music 13's own
   second pass would have produced — and drops them into core banks 1-2. The
   1962 player then plays them, unmodified, and its four program flags are the
   audio.

   Segment (2 words, per pdp1m13 `cc4`/`nxt`):
     word 1 : [pitch v1 : 6][pitch v2 : 6][pitch v3 : 6]
     word 2 : [loopct/2  : 12][pitch v4 : 6]      <- note the order: cc4's
              `rcr 6s` chain builds word 2 by rotating pitch4 in FIRST, so the
              loop count ends up in the HIGH 12 bits. nxt's `rcr 6s` then
              leaves the count alone in AC and parks pitch4 at the top of IO.
   Terminator: a segment whose loopct/2 field is 0.

   Pitch index: 0 = rest (increment 0 → phase frozen → silence).
                1 = B0, 2 = C1, ... 63 = C#6.   midi = index + 22
   Wall time of one segment = (loopct/2 + 1) × 350 µs nominal.
     — loopct passes of `lup` at 175 µs each, plus the 350 µs `nxt` fetch,
       which pays 2× the increment into every phase accumulator, so splitting
       a long note across several segments is exactly phase-neutral.
   ========================================================================= */

const PT_BASE   = 0o2137;   // base equal-tempered frequency table
const PT_LEN    = 64;
const TAB       = 0o300;    // four detuned tables: 300/400/500/600
const CB        = 0o253;    // compiler write pointer (pla's empty-song guard)
const TUW       = 0o11;     // packed per-voice detune increments
const NOG       = 0o700;    // bottom of compiled area in each bank
const NOF       = 0o7776;   // top of usable memory per bank
const STREAM0   = 0o10000 + NOG;      // first compiled word: bank 1, 10700
const BANK_SPAN = NOF - NOG;          // 7076 = 3646 words usable per bank
const STUB      = 0o2400;   // launcher stub in the (unused) tape buffer
const PLA       = 0o1671;
const NXT       = 0o1740;
const US_UNIT   = 350;      // µs per duration unit
const MAX_M     = 0o7777;   // 12-bit loopct/2 field
const CAP_SEG   = BANK_SPAN;          // 3646 segments across banks 1-2
const CHM_FACTOR = 0.92559; // CHM PDP-1 runs at 92.559% of spec

const MIDI_MIN = 23, MIDI_MAX = 85;   // B0 .. C#6
const midiToPitch = m => m - 22;

/* ---------------------------------------------------------------- compile */
/**
 * song: { voices:[{order:[patId], patterns:{id:[{n,v}]}}], bpm, res }
 * Returns { words, segs, ticks, rowUs, timeline, clipped, over }
 *   timeline[i] = tick index at which segment i starts (for playhead mapping)
 */
/* Tier 1/2 drift: the pitch table has 64 slots per voice and a song only uses a
   handful. Spare slots get filled with detuned copies of the pitches actually in
   play, and the event stream walks a long note through them. Because `nxt` only
   rewrites the frequency increment — it never touches the phase accumulator or
   any envelope — stepping between slots is a glide, not a retrigger. */
function modLfo(v, t, mod){
  const rate = mod.rates[v];
  const ph = v * 0.25;                       // voices a quarter cycle apart at t=0
  if (mod.shape === "wow") return Math.sin(2 * Math.PI * (rate * t + ph));
  const x = rate * t + ph * 4;               // drift: cosine-interpolated value noise
  const i = Math.floor(x), f = x - i;
  const rnd = n => {
    let hs = Math.imul((n ^ (mod.seed | 0) ^ (v * 0x9E37)) | 0, 0x85EBCA6B);
    hs ^= hs >>> 13; hs = Math.imul(hs, 0xC2B2AE35); hs ^= hs >>> 16;
    return ((hs >>> 0) / 4294967295) * 2 - 1;
  };
  const a = rnd(i), b = rnd(i + 1);
  return a + (b - a) * ((1 - Math.cos(f * Math.PI)) / 2);
}
function planVariants(used, mod){
  const plan = { m: [0,0,0,0], slot: [{},{},{},{}], back: [{},{},{},{}], used, slots: 0 };
  if (!mod || !mod.on) return plan;
  // every voice gets its slots whether or not its depth is up, so raising a
  // depth from zero never moves a slot index — it only rewrites the table
  for (let v = 0; v < 4; v++){
    if (!used[v].length) continue;
    const free = 63 - used[v].length;
    const m = Math.max(0, Math.min(8, Math.floor(free / (2 * used[v].length))));
    plan.m[v] = m;
    if (!m) continue;
    const taken = new Set(used[v]); taken.add(0);
    let next = 1;
    const grab = () => { while (taken.has(next) && next < 64) next++; taken.add(next); return next; };
    for (const p of used[v]){
      const map = { 0: p };
      for (let l = -m; l <= m; l++) if (l) { map[l] = grab(); plan.slots++; }
      plan.slot[v][p] = map;
      for (const l in map) plan.back[v][map[l]] = [p, +l];
    }
  }
  return plan;
}
function writeVariants(pdp1, plan, mod){
  let n = 0;
  for (let v = 0; v < 4; v++){
    const m = plan.m[v]; if (!m) continue;
    const base = TAB + v * 0o100;
    for (const p of plan.used[v]){
      const map = plan.slot[v][p]; if (!map) continue;
      const inc0 = pdp1.examine(base + p);
      const depth = mod.depths[v];
      for (let l = -m; l <= m; l++){
        if (!l) continue;
        const inc = Math.round(inc0 * Math.pow(2, (l * depth / m) / 1200));
        pdp1.deposit(base + map[l], Math.max(1, Math.min(0o377777, inc)));
        n++;
      }
    }
  }
  return n;
}

function compileStream(song, ROWS, RES, mod){
  const V = song.voices;
  // the stream must cover one full cycle of ALL voices, not just the longest:
  // independent order lists mean the song repeats at the LCM of their lengths.
  const gcd = (a, b) => b ? gcd(b, a % b) : a;
  let bars = 1;
  for (const v of V) bars = bars * v.order.length / gcd(bars, v.order.length);
  const maxBars = Math.max(...V.map(v => v.order.length));
  let lcmCapped = false;
  if (bars > 512){ bars = maxBars; lcmCapped = true; }
  const totalTicks = bars * ROWS;

  // 1. flatten every voice to a per-tick sounding pitch index
  let clipped = 0;
  const sound = [];
  for (let v = 0; v < 4; v++){
    const vo = V[v], arr = new Int16Array(totalTicks);
    let cur = 0;
    for (let t = 0; t < totalTicks; t++){
      const bar = Math.floor(t / ROWS) % vo.order.length;
      const pat = vo.patterns[vo.order[bar]];
      const c = pat ? pat[t % ROWS] : null;
      if (c){
        if (c.n === "off") cur = 0;
        else if (c.n !== null){
          let p = midiToPitch(c.n);
          if (p < 1){ p = 1; clipped++; }
          else if (p > 63){ p = 63; clipped++; }
          cur = p;
        }
      }
      arr[t] = cur;
    }
    sound.push(arr);
  }

  // 2. which pitches does each voice actually touch? the rest of its table is free
  const used = sound.map(a => { const s = new Set();
    for (const x of a) if (x) s.add(x); return [...s].sort((x, y) => x - y); });
  const plan = planVariants(used, mod);
  // "armed" depends only on the switch, never on rate/depth/voices — so the stream
  // layout is fixed while those are being dragged and can be patched in place.
  const armed = !!(mod && mod.on);

  // 3. boundaries, in exact 350 µs units so nothing drifts:
  //    every four-voice "instant" change, plus the modulation grid
  const rowUs = 60 / song.bpm / RES * 1e6;
  const unitAt = tick => Math.round(tick * rowUs / US_UNIT);
  const totalUnits = unitAt(totalTicks);

  const same = (a, b) => sound[0][a] === sound[0][b] && sound[1][a] === sound[1][b] &&
                         sound[2][a] === sound[2][b] && sound[3][a] === sound[3][b];
  const bounds = [{ u: 0, t: 0 }];
  for (let t = 1; t < totalTicks; t++) if (!same(t, t - 1)) bounds.push({ u: unitAt(t), t });
  let over = false;
  if (armed){
    const du = Math.max(2, Math.round(1e6 / (mod.grid || 16) / US_UNIT));
    if (totalUnits / du > 24000){ over = true; bounds.length = 0; bounds.push({ u: 0, t: 0 }); }
    else for (let u = du; u < totalUnits; u += du) bounds.push({ u, t: -1 });
    bounds.sort((a, b) => a.u - b.u || b.t - a.t);
  }
  // no interval may be shorter than the 700 µs floor; a musical boundary outranks
  // a modulation one when they collide
  const keep = [];
  for (const b of bounds){
    const prev = keep[keep.length - 1];
    if (!prev) { keep.push(b); continue; }
    if (b.u - prev.u >= 2) keep.push(b);
    else if (b.t >= 0 && prev.t < 0) keep[keep.length - 1] = b;
  }
  for (let i = 1; i < keep.length; i++) if (keep[i].t < 0) keep[i].t = keep[i - 1].t;

  // 4. resolve each interval to four slot indices, coalescing repeats
  const segsRaw = [];
  for (let i = 0; i < keep.length; i++){
    const u0 = keep[i].u, u1 = (i + 1 < keep.length ? keep[i + 1].u : totalUnits);
    if (u1 <= u0) continue;
    const sec = u0 * US_UNIT / 1e6;
    const p = [0, 1, 2, 3].map(v => {
      const base = sound[v][keep[i].t];
      if (!base || !plan.m[v]) return base;
      const mv = plan.m[v];
      const l = Math.max(-mv, Math.min(mv, Math.round(modLfo(v, sec, mod) * mv)));
      return plan.slot[v][base][l];
    });
    const last = segsRaw[segsRaw.length - 1];
    if (!armed && last && last.p[0] === p[0] && last.p[1] === p[1] &&
        last.p[2] === p[2] && last.p[3] === p[3]) last.u1 = u1;
    else segsRaw.push({ u0, u1, p, t: keep[i].t });
  }

  // 5. emit, splitting anything past the 12-bit loop-count field
  const words = [], timeline = [];
  for (const s of segsRaw){
    const units = s.u1 - s.u0;
    const n = Math.ceil(units / (MAX_M + 1));
    for (let i = 0; i < n; i++){
      const share = Math.floor(units / n) + (i < units % n ? 1 : 0);
      const m = Math.max(1, share - 1);
      words.push((s.p[0] << 12) | (s.p[1] << 6) | s.p[2]);
      words.push(((m & MAX_M) << 6) | s.p[3]);
      timeline.push(s.t);
    }
  }
  words.push(0, 0);                                  // terminator
  if (words.length / 2 > CAP_SEG) over = true;

  return { words, segs: words.length / 2 - 1, ticks: totalTicks, rowUs, timeline,
           clipped, over, bars, lcmCapped, rows: ROWS, sound, plan, used };
}

/* ------------------------------------------------------- core load / launch */
/* Boot: load the 1962 ROM, build the detuned tables, enter extend mode, halt.
   Kept out of the render clock — `tun` costs ~49 ms of emulated time. */
function boot(pdp1, rimBytes){
  pdp1.address = 0o4;
  pdp1.readIn(rimBytes);
  retune(pdp1);
  return [...Array(PT_LEN)].map((_, i) => pdp1.examine(PT_BASE + i));
}
function retune(pdp1){
  pdp1.deposit(STUB + 0, 0o620212);                  // jsp tun
  pdp1.deposit(STUB + 1, 0o724074);                  // eem
  pdp1.deposit(STUB + 2, 0o760400);                  // hlt
  pdp1.singleInstruction = false; pdp1.breakpoint = null;
  pdp1.start(STUB);
  pdp1.deposit(STUB + 3, 0o600000 | PLA);            // jmp pla  (render entry)
}

/* Walk the compiled area the way `put` does, wrapping at the bank boundary. */
function* streamAddrs(n){
  let addr = STREAM0, end = STREAM0 + BANK_SPAN;
  for (let i = 0; i < n; i++){
    yield addr;
    addr++;
    if (addr === end){ addr += 0o10000 - NOF + NOG; end = addr + BANK_SPAN; }
  }
}
function segAddr(seg){
  const it = streamAddrs(seg * 2 + 1);
  let a = STREAM0; for (const x of it) a = x;
  return a;
}
/* Live patch: rewrite only the pitch fields. Word 2's high 12 bits are the loop
   count, so leaving them alone guarantees the timing and layout cannot move. */
function writeStreamPitches(pdp1, words){
  let i = 0;
  for (const addr of streamAddrs(words.length)){
    if (i & 1) pdp1.deposit(addr, (pdp1.examine(addr) & 0o777700) | (words[i] & 0o77));
    else pdp1.deposit(addr, words[i]);
    i++;
  }
}

function loadStream(pdp1, words){
  // banks 1-2, wrapping at the bank boundary exactly as `put` does
  let addr = STREAM0, end = STREAM0 + BANK_SPAN;
  for (const w of words){
    pdp1.deposit(addr, w);
    addr++;
    if (addr === end){ addr += 0o10000 - NOF + NOG; end = addr + BANK_SPAN; }
  }
  pdp1.deposit(CB, addr & 0o177777);                 // != STREAM0 → pla proceeds
  return addr;
}

function patchPitchTable(pdp1, basePt, cents){
  for (let i = 0; i < PT_LEN; i++){
    const base = basePt[i];
    if (!base){ pdp1.deposit(PT_BASE + i, base); continue; }
    // pt[1] = B0, pt[2] = C1 ... so pitch class of index i is (i + 10) % 12
    const pc = (i + 10) % 12;
    const v = Math.round(base * Math.pow(2, cents[pc] / 1200));
    pdp1.deposit(PT_BASE + i, Math.max(1, Math.min(0o377777, v)));
  }
}

/* ------------------------------------------------------------------ render */
/**
 * Renders one pass of the stream to interleaved stereo Float32 at sampleRate.
 * Returns { left, right, seconds, segTimes, nxtCount }
 */
function render(pdp1, sampleRate, chm, maxSeconds = 600, onProgress){
  const sampleUs = 1e6 / sampleRate;
  const factor = chm ? CHM_FACTOR : 1;
  const cap = Math.ceil(maxSeconds * sampleRate);
  const left = new Float32Array(cap), right = new Float32Array(cap);

  pdp1.singleInstruction = true;
  pdp1.breakpoint = null;
  pdp1.cpu.pc = STUB + 3;            // jmp pla
  pdp1.cpu.running = true;

  let t = 0, prevT = 0, next = 0, i = 0, prevPF = 0, nxtCount = 0;
  const segTimes = [];

  while (pdp1.cpu.running && i < cap){
    if (pdp1.cpu.pc === NXT) segTimes.push(t / 1e6);
    const d = pdp1.cpu.step() / factor;
    prevT = t; t += d;
    const pf = pdp1.cpu.pf;
    while (next <= t && i < cap){
      // pick whichever flag state sits closest to the ideal sample instant
      const use = (prevT <= next && Math.abs(t - next) <= Math.abs(prevT - next)) ? pf
                : (prevT <= next ? prevPF : pf);
      left[i]  = (((use & 0o40) ? 0.5 : 0) + ((use & 0o20) ? -0.5 : 0)) * 0.6;
      right[i] = (((use & 0o10) ? 0.5 : 0) + ((use & 0o04) ? -0.5 : 0)) * 0.6;
      next += sampleUs; i++;
      if (onProgress && (i & 0xFFFF) === 0) onProgress(i / cap);
    }
    prevPF = pf;
  }
  nxtCount = segTimes.length;
  return { left: left.subarray(0, i), right: right.subarray(0, i),
           seconds: i / sampleRate, segTimes, nxtCount };
}

/* -------------------------------------------------------------- RIM export */
/* A punchable patch tape: dio/data pairs writing the stream, then `jmp`.
   Bank 1-2 payload and the bank-0 launcher are separate READ IN sections,
   because the RIM loader's address field is 12 bits within one bank.        */
function rimTape(words, tables){
  const out = [];
  const push18 = w => { out.push(0o200 | ((w >> 12) & 0o77), 0o200 | ((w >> 6) & 0o77), 0o200 | (w & 0o77)); };
  const blank = n => { for (let i = 0; i < n; i++) out.push(0); };
  const section = (base, pairs, endJmp) => {
    for (const [a, v] of pairs){ push18(0o320000 | (a & 0o7777)); push18(v); }
    push18(0o600000 | (endJmp & 0o7777));
  };
  // section 1+2: the stream, split per bank; each ends by jumping to a hlt we planted
  let addr = STREAM0, end = STREAM0 + BANK_SPAN;
  const perBank = [[], []];
  for (const w of words){
    const b = (addr >> 12) - 1;
    if (b < 0 || b > 1) break;                        // banks 1-2 only
    perBank[b].push([addr & 0o7777, w]);
    addr++;
    if (addr === end){ addr += 0o10000 - NOF + NOG; end = addr + BANK_SPAN; }
  }
  blank(256);
  for (let b = 0; b < 2; b++){
    if (!perBank[b].length) continue;
    const halt = 0o7777;                              // scratch cell at bank top
    section(b + 1, perBank[b].concat([[halt, 0o760400]]), halt);
    blank(16);
  }
  // section 3: bank 0 — the four pitch tables verbatim (so the tape carries its own
  // temperament, detune and drift slots and never needs `tun`), then cb and launch
  section(0, (tables || []).concat([
    [CB, addr & 0o177777],
    [STUB + 0, 0o724074],                             // eem
    [STUB + 1, 0o600000 | PLA],                       // jmp pla
  ]), STUB);
  blank(192);
  return new Uint8Array(out);
}

module.exports = { compileStream, loadStream, writeStreamPitches, streamAddrs, segAddr, render, rimTape, patchPitchTable, planVariants, writeVariants, modLfo, boot, retune, PT_BASE, PT_LEN, TUW, TAB, STREAM0, STUB, PLA, NXT, CAP_SEG, BANK_SPAN, NOF, NOG, MIDI_MIN, MIDI_MAX, CHM_FACTOR, US_UNIT, MAX_M };
