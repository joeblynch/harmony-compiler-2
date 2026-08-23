/* GENERATED from app/pulse4-pdp1.html by tools/build-engine.js — do not edit. */
const W_LEN = 18;
const W_MASK = 0o777777;
const SIGN = 0o400000;
const UNS = 0o377777;
const NEG0 = 0o777777;
const ADDR = 0o7777;
const EXT = 0o170000;
const BANK = 4096;
const MEMT = 5;               // microseconds per memory access

class TapeReader {
  constructor(){ this.tape = null; this.pos = 0; }
  mount(t){ this.tape = t; this.pos = 0; }
  rpb(){
    if (!this.tape) throw new Error("no tape mounted");
    let w = 0;
    for (let i = 0; i < 3;){
      if (this.pos >= this.tape.length) throw new Error("read past end of tape");
      const b = this.tape[this.pos];
      if (b & 0o200){ w = (w << 6) | (b & 0o77); i++; }
      this.pos++;
    }
    return w;
  }
}

class Memory {
  constructor(n){ this.banks = []; for (let i = 0; i < n; i++) this.banks.push(new Uint32Array(BANK)); }
  get bankCount(){ return this.banks.length; }
  read(a){ return this.banks[(a >> 12) & 0o17][a & ADDR]; }
  write(a, v){ this.banks[(a >> 12) & 0o17][a & ADDR] = v; }
}

function popcnt(v){ let c = 0; while (v){ v &= v - 1; c++; } return c; }
function toTwos(v){
  if (v & SIGN){ if (v === NEG0) return 0; return ((v + 1) & W_MASK) | ~W_MASK; }
  return v;
}

class CPU {
  constructor(mem, tape){
    this.mem = mem; this.tapeReader = tape;
    this.pc = 0; this.io = 0; this.ac = 0;
    this.running = false; this.overflow = 0;
    this.pf = 0; this.ss = 0; this.tw = 0; this.extend = 0;
  }
  incPC(){ this.pc = (this.pc & EXT) | ((this.pc + 1) & ADDR); }
  step(){
    const w = this.mem.read(this.pc);
    let d = MEMT;
    this.incPC();
    d += this.exec(w);
    return d;
  }
  exec(word){
    let d = 0, bad = false;
    const op = (word >> 12) & 0o76;
    let ind = (word >> 12) & 1;
    const y = word & ADDR;
    let ma = (this.pc & EXT) | y;

    if (op < 0o64 && !(op === 0o16 && ind)){
      if (!this.extend){
        while (ind){
          const iw = this.mem.read(ma); d += MEMT;
          ind = (iw >> 12) & 1;
          ma = (this.pc & EXT) | (iw & ADDR);
        }
      } else if (ind){
        ma = this.mem.read(ma) & 0o177777; d += MEMT;
      }
    }

    switch (op){
      case 0o64: {                                   // skip group
        let skip = 0;
        if ((y & 0o0400) && (this.ac & SIGN)) skip = 1;        // sma
        if ((y & 0o0200) && !(this.ac & SIGN)) skip = 1;       // spa
        if ((y & 0o2000) && !(this.io & SIGN)) skip = 1;       // spi
        if ((y & 0o0100) && !this.ac) skip = 1;                // sza
        if ((y & 0o7770) === 0){                               // szf
          const f = y & 0o7;
          if (f === 7){ if (!this.pf) skip = 1; }
          else if (f > 0 && !(this.pf & (1 << (6 - f)))) skip = 1;
        }
        if ((y & 0o7707) === 0){                               // szs
          const s = (y & 0o70) >> 3;
          if (s === 7){ if (!this.ss) skip = 1; }
          else if (s > 0 && !(this.ss & (1 << (6 - s)))) skip = 1;
        }
        if (skip ^ ind) this.incPC();
        break;
      }
      case 0o66: {                                   // shift / rotate
        const n = popcnt(y & 0o777);
        if (!ind){
          switch (y & 0o7000){
            case 0o3000:                                        // rcl
              this.ac = (this.ac << n) | (this.io >>> (W_LEN - n));
              this.io = (this.io << n) | (this.ac >>> W_LEN);
              this.ac &= W_MASK; this.io &= W_MASK; break;
            case 0o2000:                                        // ril
              this.io = ((this.io << n) | (this.io >>> (W_LEN - n))) & ((1 << W_LEN) - 1); break;
            case 0o5000:                                        // sal
              this.ac = (this.ac & SIGN) | ((this.ac << n) & UNS);
              if (this.ac & SIGN) this.ac |= (1 << n) - 1; break;
            case 0o7000:                                        // scl
              this.ac = (this.ac & SIGN) | ((this.ac << n) & UNS) | (this.io >>> (W_LEN - n));
              this.io = (this.io << n) & W_MASK;
              if (this.ac & SIGN) this.io |= (1 << n) - 1; break;
            default: bad = true;
          }
        } else {
          switch (y & 0o7000){
            case 0o1000:                                        // rar
              this.ac = (this.ac >>> n) | ((this.ac & ((1 << n) - 1)) << (W_LEN - n)); break;
            case 0o3000:                                        // rcr
              this.ac |= (this.io & ((1 << n) - 1)) << (W_LEN + n);
              this.io = (this.io >>> n) | ((this.ac & ((1 << n) - 1)) << (W_LEN - n));
              this.ac >>>= n; break;
            case 0o5000:                                        // sar
              this.ac = (this.ac & SIGN) | ((this.ac & UNS) >>> n);
              if (this.ac & SIGN) this.ac |= ((1 << n) - 1) << (W_LEN - 1 - n); break;
            default: bad = true;
          }
        }
        break;
      }
      case 0o72:                                     // iot
        if (y === 0o4074) this.extend = 1;                       // eem
        else if (y === 0o0002 && ind) this.io = this.tapeReader.rpb();  // rpb
        else bad = true;
        break;
      case 0o76:                                     // operate
        if (y & 0o0200) this.ac = 0;                             // cla
        if (y & 0o4000) this.io = 0;                             // cli
        if ((y & 0o7770) === 0o0000 || (y & 0o7770) === 0o0010){  // clf / stf
          const v = y >> 3, f = y & 0o7;
          if (f === 7) this.pf = v ? 0o77 : 0;
          else if (f > 0){ if (v) this.pf |= (1 << (6 - f)); else this.pf &= ~(1 << (6 - f)); }
        }
        if (y & 0o2000) this.ac |= this.tw;                      // lat
        if (y & 0o1000) this.ac = (~this.ac) & W_MASK;           // cma
        if (y & 0o0400) this.running = false;                    // hlt
        break;
      case 0o40: case 0o42: {                        // add / sub
        let cy = this.mem.read(ma); d += MEMT;
        const isSub = +(op === 0o42);
        if (isSub) cy = (~cy) & W_MASK;
        const sum = this.ac + cy;
        let r = ((sum & W_MASK) + (sum >>> W_LEN)) & W_MASK;
        this.overflow = ((+!((this.ac & SIGN) ^ (cy & SIGN))) ^ isSub) &
                        (+((r & SIGN) !== (this.ac & SIGN)));
        if (r === NEG0 && !(isSub && this.ac === NEG0 && cy === NEG0)) r = 0;
        this.ac = r; break;
      }
      case 0o02: this.ac &= this.mem.read(ma); d += MEMT; break;               // and
      case 0o24: this.mem.write(ma, this.ac); d += MEMT; break;                // dac
      case 0o26:                                                               // dap
        this.mem.write(ma, (this.mem.read(ma) & 0o770000) | (this.ac & ADDR));
        // NOTE: divergence from harmony-compiler-2's cpu.ts, which charges dap
        // 2 memory cycles on top of the fetch (15 us). On the PDP-1 dap is an
        // ordinary memory-reference instruction at 10 us, like dac. The four
        // `dap .+1` in `nxt` are what make the fetch cost 350 us exactly, as the
        // block diagram states, and what make a segment split phase-neutral.
        d += MEMT; break;
      case 0o32: this.mem.write(ma, this.io); d += MEMT; break;                // dio
      case 0o56: {                                                             // div
        const dn = this.ac & SIGN;
        let acm = this.ac, iom = this.io;
        if (dn){ acm ^= W_MASK; iom ^= W_MASK; }
        const dividend = (BigInt(acm) << BigInt(W_LEN - 1)) | BigInt(iom >>> 1);
        const dw = this.mem.read(ma);
        const vn = dw & SIGN;
        const dvm = BigInt(vn ? (dw ^ W_MASK) : dw);
        if (BigInt(acm) >= dvm){ d = 12 - MEMT; break; }
        this.ac = Number(dividend / dvm);
        this.io = Number(dividend % dvm);
        if (dn && this.io !== W_MASK) this.io ^= W_MASK;
        if ((!!dn !== !!vn) && this.ac !== 0) this.ac ^= W_MASK;
        this.incPC(); d = 40 - MEMT; break;
      }
      case 0o34: this.mem.write(ma, 0); d += MEMT; break;                      // dzm
      case 0o44: case 0o46:                                                    // idx / isp
        this.ac = (this.mem.read(ma) + 1) & W_MASK;
        if (this.ac === NEG0) this.ac = 0;
        this.mem.write(ma, this.ac); d += MEMT;
        if (op === 0o46 && (this.ac & SIGN) === 0) this.incPC();
        break;
      case 0o16:                                                               // jda
        if (ind){
          this.mem.write(ma, this.ac); d += MEMT;
          this.ac = (this.overflow << 17) | (this.extend << 16) | this.pc;
          this.pc = (this.pc & EXT) | ((y + 1) & ADDR);
        } else bad = true;
        break;
      case 0o60: this.pc = ma; break;                                          // jmp
      case 0o62:                                                               // jsp
        this.ac = (this.overflow << 17) | (this.extend << 16) | this.pc;
        this.pc = ma; break;
      case 0o20: this.ac = this.mem.read(ma); d += MEMT; break;                // lac
      case 0o70: this.ac = ind ? (~y) & W_MASK : y; break;                     // law
      case 0o22: this.io = this.mem.read(ma); d += MEMT; break;                // lio
      case 0o54: {                                                             // mul
        const p = BigInt(toTwos(this.ac)) * BigInt(toTwos(this.mem.read(ma)));
        const neg = p < 0n; const mag = neg ? -p : p;
        this.ac = Number((mag >> BigInt(W_LEN - 1)) & BigInt(UNS));
        this.io = Number(mag & BigInt(UNS)) << 1;
        if (neg && (this.ac !== 0 || this.io !== 0)){ this.ac ^= W_MASK; this.io ^= W_MASK; }
        d += 25 - MEMT; break;
      }
      case 0o50: if (this.ac !== this.mem.read(ma)) this.incPC(); d += MEMT; break;  // sad
      case 0o52: if (this.ac === this.mem.read(ma)) this.incPC(); d += MEMT; break;  // sas
      case 0o10: d += MEMT; d += this.exec(this.mem.read(ma)); break;                // xct
      case 0o06: this.ac ^= this.mem.read(ma); d += MEMT; break;                     // xor
      default: bad = true;
    }
    if (bad) throw new Error("unsupported instruction: " + word.toString(8).padStart(6, "0"));
    return d;
  }
}

class PDP1 {
  constructor(banks = 3){
    this.tapeReader = new TapeReader();
    this.memory = new Memory(banks);
    this.cpu = new CPU(this.memory, this.tapeReader);
    this.breakpoint = -1;
    this.singleInstruction = false;
    this.address = 0;
  }
  get pc(){ return this.cpu.pc; }
  get programFlags(){ return this.cpu.pf; }
  get running(){ return this.cpu.running; }
  setSenseSwitch(n, v){
    const m = 1 << (6 - n);
    if (v) this.cpu.ss |= m; else this.cpu.ss &= ~m;
  }
  start(addr = this.address){ this.cpu.pc = addr; return this.continue(); }
  stop(){ this.cpu.running = false; }
  continue(){
    let d = 0;
    this.cpu.running = true;
    do { d += this.cpu.step(); }
    while (this.cpu.running && this.cpu.pc !== this.breakpoint && !this.singleInstruction);
    return d;
  }
  examine(a){ return this.memory.read(a); }
  deposit(a, v){ this.memory.write(a, v); }
  mountTape(t){ this.tapeReader.mount(t); }
  readIn(tape, extension = 0){
    if (tape) this.mountTape(tape);
    const base = extension << 12;
    let d = 0;
    this.cpu.running = true;
    this.cpu.pc = base;
    for (;;){
      const instr = this.tapeReader.rpb();
      const op = (instr >> 12) & 0o76;
      if (op === 0o32){                       // dio
        this.cpu.io = this.tapeReader.rpb();
        d += this.cpu.exec(instr);
      } else if (op === 0o60){                // jmp — ends the load and launches
        d += MEMT;
        d += this.start(base | (instr & ADDR));
        return d;
      } else {
        throw new Error("invalid RIM instruction " + instr.toString(8));
      }
    }
  }
}

module.exports = { PDP1, W_MASK };
