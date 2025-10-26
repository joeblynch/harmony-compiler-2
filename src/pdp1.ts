const PDP1_MEMORY_BANK_SIZE = 4096;
const PDP1_WORD_LENGTH = 18;
const PDP1_WORD_MASK = (1 << PDP1_WORD_LENGTH) - 1;
const PDP1_NEG_ZERO = (1 << PDP1_WORD_LENGTH) - 1;
const PDP1_SIGN_BIT_MASK = 1 << PDP1_WORD_LENGTH - 1;
const PDP1_UNSIGNED_MASK = PDP1_SIGN_BIT_MASK - 1;
const PDP1_MEMORY_EXTENSION_MASK = 0o170000;
const PDP1_MEMORY_ADDRESS_MASK = 0o7777;
const PDP1_MEMORY_ACCESS_DURATION = 5;  // microseconds

const DEV = false;

class PDP1MemoryBank {
  public readonly memory: Uint32Array;

  constructor(bankSize = PDP1_MEMORY_BANK_SIZE) {
    this.memory = new Uint32Array(bankSize);
  }

  read(address: number) {
    if (DEV) {
      if (address < 0 || address >= this.memory.length) {
        throw new RangeError(`memory address out of range: ${address}`);
      }
    }

    return this.memory[address] as number;
  }

  write(address: number, value: number) {
    if (DEV) {
      if (address < 0 || address >= this.memory.length) {
        throw new RangeError(`memory address out of range: ${address}`);
      }

      if (value > PDP1_WORD_MASK) {
        throw new RangeError(`memory value over max: ${value}`);
      }
    }

    this.memory[address] = value;
  }
}

class PDP1Memory {
  public readonly banks: PDP1MemoryBank[] = [];
  private _ma = 0;
  private _mb = 0;
  
  constructor(bankCount: number) {
    if (bankCount < 1 || bankCount > 15) {
      throw new Error(`invalid memory bank count: ${bankCount}`);
    }

    for (let i = 0; i < bankCount; i++) {
      this.banks.push(new PDP1MemoryBank());
    }
  }

  get ma() {
    return this._ma;
  }

  get mb() {
    return this._mb;
  }

  get bankCount() {
    return this.banks.length;
  }

  read(address: number) {
    const extension = (address >> 12) & 0o17;

    if (DEV) {
      if (extension >= this.bankCount) {
        throw new RangeError(`extension address out of range`);
      }
    }

    this._ma = address;
    const value = this.banks[extension]!.read(address & PDP1_MEMORY_ADDRESS_MASK);
    this._mb = value;

    return value;
  }

  write(address: number, value: number) {
    const extension = (address >> 12) & 0o17;

    if (DEV) {
      if (extension >= this.bankCount) {
        throw new RangeError(`extension address out of range`);
      }
    }

    this._ma = address;
    this._mb = value;

    this.banks[extension]!.write(address & PDP1_MEMORY_ADDRESS_MASK, value);
  }
}

class PDP1TapeReader {
  private tape: Uint8Array | null = null;
  private position = 0;

  mount(tape: Uint8Array) {
    this.tape = tape;
    this.position = 0;
  }

  unmount() {
    this.tape = null;
    this.position = 0;
  }

  rpb() {
    let word = 0;

    if (!this.tape) {
      throw new Error('no tape is mounted');
    }

    for (let i = 0; i < 3;) {
        if (this.position >= this.tape.length) {
          throw new Error('can not read past end of tape');
        }

        const byte = this.tape[this.position]!;
        
        if (byte & 0o200) {
            // rbp skips lines without the 8th bit set, ignores 7th bit
            word = (word << 6) | (byte & 0o77);
            i++;
        }

        this.position++;
    }

    return word;
  }
}

class PDP1CPU {
  public pc = 0;
  public io = 0;
  public running = false;
  
  private ac = 0;
  private overflow = 0;
  private pf = 0;
  private ss = 0;
  private tw = 0;
  private extend = 0;

  constructor(private readonly memory: PDP1Memory, private readonly tapeReader: PDP1TapeReader) {}

  get testWord() {
    return this.tw;
  }

  set testWord(value: number) {
    this.tw = value & PDP1_WORD_MASK;
  }

  get senseSwitches() {
    return this.ss;
  }

  set senseSwitches(value: number) {
    this.ss = value;
  }

  get programFlags() {
    return this.pf;
  }

  step() {
    // fetch next instruction
    const word = this.memory.read(this.pc);
    let duration = PDP1_MEMORY_ACCESS_DURATION;

    // process.stdout.write(`${this.pc.toString(8).padStart(5, '0')} ${word.toString(8).padStart(6, '0')} `)

    this.incrementPC();
    duration += this.decodeAndExecute(word);

    // const fmt = (n: number, l = 6) => n.toString(8).padStart(l, '0');
    // console.log(`ac: ${fmt(this.ac)} io: ${fmt(this.io)} ma: ${fmt(this.memory.ma)} mb: ${fmt(this.memory.mb)} pf: ${this.pf.toString(2).padStart(6, '0')}`);

    return duration;
  }

  decodeAndExecute(word: number) {
    let duration = 0;
    let unsupported = false;

    const opcode = word >> 12 & 0o76;
    let indirect = word >> 12 & 1;
    const y = (word & PDP1_MEMORY_ADDRESS_MASK);
    let ma = (this.pc & PDP1_MEMORY_EXTENSION_MASK) | y;

    // perform memory indirection for memory address instructions
    if (opcode < 0o64 && !(opcode === 0o16 && indirect)) {
      if (!this.extend) {
        while (indirect) {
          const indirectWord = this.memory.read(ma);
          duration += PDP1_MEMORY_ACCESS_DURATION;

          indirect = indirectWord >> 12 & 1;
          ma = (this.pc & PDP1_MEMORY_EXTENSION_MASK) | (indirectWord & PDP1_MEMORY_ADDRESS_MASK);
        }
      } else if (indirect) {
        ma = this.memory.read(ma) & 0o177777;
        duration += PDP1_MEMORY_ACCESS_DURATION;
      }
    }

    switch (opcode) {
      case 0o64: {  // skip group
        let skip = 0;

        if (y & 0o0400 && this.ac & PDP1_SIGN_BIT_MASK)     skip = 1;  // sma
        if (y & 0o0200 && !(this.ac & PDP1_SIGN_BIT_MASK))  skip = 1;  // spa
        if (y & 0o2000 && !(this.io & PDP1_SIGN_BIT_MASK))  skip = 1;  // spi
        if (y & 0o0100 && !this.ac)                         skip = 1;  // sza

        if ((y & 0o7770) === 0o0000) {  // szf
          const flag = y & 0o7;
          if (flag === 7) {
            if (!this.pf) skip = 1;
          } else if (flag > 0 && !(this.pf & 1 << 6 - flag)) {
            skip = 1;
          }
        }

        if ((y & 0o7707) === 0o0000) {  // szs
          const sense = (y & 0o70) >> 3;
          if (sense === 7) {
            if (!this.ss) skip = 1;
          } else if (sense > 0 && !(this.ss & 1 << 6 - sense)) {
            skip = 1;
          }
        }

        // the indirect bit reverses skip intention (do not skip of skip condition met)
        if (skip ^ indirect) {
          this.incrementPC();
        }

        break;
      }

      case 0o66: {  // shift/rotate left
        const n = this.popcnt(y & 0o777); // shift positions is the number of 1s in the 9 LSB

        if (!indirect) {
          switch (y & 0o7000) {
            case 0o3000:  // rcl
              this.ac = this.ac << n | this.io >> PDP1_WORD_LENGTH - n;
              this.io = this.io << n | this.ac >> PDP1_WORD_LENGTH;
              this.ac &= PDP1_WORD_MASK;
              this.io &= PDP1_WORD_MASK;
              break;

            case 0o2000:  // ril
              this.io = ((this.io << n) | (this.io >> (PDP1_WORD_LENGTH - n))) & ((1 << PDP1_WORD_LENGTH) - 1);
              break;

            case 0o5000:  // sal
              this.ac = this.ac & PDP1_SIGN_BIT_MASK | this.ac << n & PDP1_UNSIGNED_MASK;
              if (this.ac & PDP1_SIGN_BIT_MASK) this.ac |= (1 << n) - 1;
              break;

            case 0o7000:  // scl
              this.ac = this.ac & PDP1_SIGN_BIT_MASK |
                this.ac << n & PDP1_UNSIGNED_MASK |
                this.io >> PDP1_WORD_LENGTH - n;
              this.io = this.io << n & (PDP1_WORD_MASK);
              if (this.ac & PDP1_SIGN_BIT_MASK) this.io |= (1 << n) - 1;

              break;

            default:
              unsupported = true;
          }
        } else {
          switch (y & 0o7000) {
            case 0o1000:  // rar
              this.ac = this.ac >> n | (this.ac & ((1 << n) - 1)) << PDP1_WORD_LENGTH - n;
              break;

            case 0o3000:  // rcr
              this.ac |= (this.io & (1 << n) - 1) << PDP1_WORD_LENGTH + n;
              this.io = this.io >> n | (this.ac & (1 << n) - 1) << PDP1_WORD_LENGTH - n;
              this.ac >>= n;
              break;

            case 0o5000:  // sar
              this.ac = this.ac & PDP1_SIGN_BIT_MASK | (this.ac & PDP1_UNSIGNED_MASK) >> n;
              if (this.ac & PDP1_SIGN_BIT_MASK) this.ac |= (1 << n) - 1 << PDP1_WORD_LENGTH - 1 - n;
              break;

            default:
              unsupported = true;
          }
        }
        break;
      }

      case 0o72:  // iot group
        switch (y) {
          case 0o4074:  // eem
            this.extend = 1;
            break;

          case 0o0002:  // rpb
            if (indirect) {
              this.io = this.tapeReader.rpb();
            } else {
              unsupported = true;
            }

            break;

          default:
            unsupported = true;
        }
        break;

      case 0o76:  // operate group
        // NOTE: the manual doesn't fully document the order of operations, but implies it's: clear, load, modify.

        if (y & 0o0200) this.ac = 0;  // cla
        if (y & 0o4000) this.io = 0;  // cli

        switch (y & 0o7770) {
          case 0o0000:  // clf
          case 0o0010:  // stf
            const value = y >> 3;
            const flag = y & 0o7;

            if (flag === 7) {
              this.pf = value ? 0o77 : 0;
            } else if (flag > 0) {
              if (value) {
                this.pf |= (1 << (6 - flag));
              } else {
                this.pf &= ~(1 << (6 - flag));
              }
            }
            break;
        }

        if (y & 0o2000) this.ac |= this.tw;  // lat
        if (y & 0o1000) this.ac = (~this.ac) & PDP1_WORD_MASK;  // cma
        if (y & 0o0400) this.running = false; // hlt
            
        break;

      case 0o40:    // add
      case 0o42: {  // sub
        let cy = this.memory.read(ma);
        duration += PDP1_MEMORY_ACCESS_DURATION;

        // for sub, complement C(Y)
        const isSub = +(opcode === 0o42);
        if (isSub) cy = ~cy & PDP1_WORD_MASK;

        // addition with end-around carry
        const sum = this.ac + cy;
        let result = ((sum & PDP1_WORD_MASK) + (sum >> PDP1_WORD_LENGTH)) & PDP1_WORD_MASK;

        this.overflow = (+!((this.ac & PDP1_SIGN_BIT_MASK) ^ (cy & PDP1_SIGN_BIT_MASK)) ^ isSub) & 
                        +((result & PDP1_SIGN_BIT_MASK) != (this.ac & PDP1_SIGN_BIT_MASK));

        // normalize -0 to +0, except for (-0) - (+0)
        if (result == PDP1_NEG_ZERO && !(isSub && this.ac == PDP1_NEG_ZERO && cy == PDP1_NEG_ZERO)) {
            result = 0;
        }

        this.ac = result;

        break;
      }

      case 0o02:  // and
        this.ac &= this.memory.read(ma);
        duration += PDP1_MEMORY_ACCESS_DURATION;
        break;

      case 0o24:  // dac
        this.memory.write(ma, this.ac);
        duration += PDP1_MEMORY_ACCESS_DURATION;
        break;

      case 0o26:  // dap
        this.memory.write(ma, (this.memory.read(ma) & 0o770000) | (this.ac & PDP1_MEMORY_ADDRESS_MASK));
        duration += PDP1_MEMORY_ACCESS_DURATION;
        duration += PDP1_MEMORY_ACCESS_DURATION;
        break;

      case 0o32:  // dio
        this.memory.write(ma, this.io);
        duration += PDP1_MEMORY_ACCESS_DURATION;
        break;

      case 0o56: {  // div
        const dividendNegative = this.ac & PDP1_SIGN_BIT_MASK;
        let acMagnitude = this.ac;
        let ioMagnitude = this.io;

        if (dividendNegative) {
            acMagnitude ^= PDP1_WORD_MASK;
            ioMagnitude ^= PDP1_WORD_MASK;
        }

        const dividendMagnitude = (BigInt(acMagnitude) << BigInt(PDP1_WORD_LENGTH - 1)) | (BigInt(ioMagnitude >> 1));

        const divisorWord = this.memory.read(ma);
        const divisorNegative = divisorWord & PDP1_SIGN_BIT_MASK;
        const divisorMagnitude = BigInt(divisorNegative ? (divisorWord ^ PDP1_WORD_MASK) : divisorWord);

        if (acMagnitude >= divisorMagnitude) {
            // overflow, do nothing
            duration = 12 - PDP1_MEMORY_ACCESS_DURATION;
            break;
        }

        this.ac = Number(dividendMagnitude / divisorMagnitude);
        this.io = Number(dividendMagnitude % divisorMagnitude);

        // convert back to 1s compliment
        if (dividendNegative && this.io !== PDP1_WORD_MASK) {
            this.io ^= PDP1_WORD_MASK;
        }
        
        if ((dividendNegative !== divisorNegative) && this.ac !== 0) {
            this.ac ^= PDP1_WORD_MASK;
        }

        // didn't overflow, so skip
        this.incrementPC();

        // TODO: duration is 30-40us, defaulting to max
        duration = 40 - PDP1_MEMORY_ACCESS_DURATION;

        break;
      }

      case 0o34:  // dzm
        this.memory.write(ma, 0);
        duration += PDP1_MEMORY_ACCESS_DURATION;
        break;

      case 0o44:  // idx
      case 0o46:  // isp
        this.ac = this.memory.read(ma) + 1 & PDP1_WORD_MASK;
        if (this.ac === PDP1_NEG_ZERO) this.ac = 0;

        this.memory.write(ma, this.ac);
        duration += PDP1_MEMORY_ACCESS_DURATION;

        if (opcode === 0o46) {  // isp
          if ((this.ac & PDP1_SIGN_BIT_MASK) === 0) this.incrementPC();
        }
        break;

      case 0o16:
        if (indirect) { // jda
          this.memory.write(ma, this.ac);
          duration += PDP1_MEMORY_ACCESS_DURATION;

          this.ac = (this.overflow << 17) | (this.extend << 16) | this.pc;
          this.pc = (this.pc & PDP1_MEMORY_EXTENSION_MASK) | ((y + 1) & PDP1_MEMORY_ADDRESS_MASK);
        } else {
          unsupported = true;  // cal
        }
        break;

      case 0o60:  // jmp
        this.pc = ma;
        break;

      case 0o62:  // jsp
        this.ac = (this.overflow << 17) | (this.extend << 16) | this.pc;
        this.pc = ma;
        break;

      case 0o20:  // lac
        this.ac = this.memory.read(ma);
        duration += PDP1_MEMORY_ACCESS_DURATION;
        break;

      case 0o70:  // law
        this.ac = indirect ? ~y : y;
        break;

      case 0o22:  // lio
        this.io = this.memory.read(ma);
        duration += PDP1_MEMORY_ACCESS_DURATION;
        break;

      case 0o54: {  // mul
        const product = BigInt(this.toTwosComplement(this.ac) * this.toTwosComplement(this.memory.read(ma)));
        const negative = product < BigInt(0);
        const magnitude = negative ? -product : product;

        this.ac = Number((magnitude >> BigInt(PDP1_WORD_LENGTH - 1)) & BigInt(PDP1_UNSIGNED_MASK));
        this.io = Number(magnitude & BigInt(PDP1_UNSIGNED_MASK)) << 1;

        // convert back to 1s complement
        if (negative && (this.ac !== 0 || this.io !== 0)) {
            this.ac ^= PDP1_WORD_MASK;
            this.io ^= PDP1_WORD_MASK;
        }

        duration += 25 - PDP1_MEMORY_ACCESS_DURATION; // TODO: spec says 14-25us, using max, sub existing fetch duration
        break;
      }

      case 0o50:  // sad
        if (this.ac !== this.memory.read(ma)) this.incrementPC();
        duration += PDP1_MEMORY_ACCESS_DURATION;
        break;

      case 0o52:  // sas
        if (this.ac === this.memory.read(ma)) this.incrementPC();
        duration += PDP1_MEMORY_ACCESS_DURATION;
        break;

      case 0o10:  // xct
        duration += PDP1_MEMORY_ACCESS_DURATION; // for the following read to fetch the instruction at `ma`
        duration += this.decodeAndExecute(this.memory.read(ma));
        break;

      case 0o06:  // xor
        this.ac ^= this.memory.read(ma);
        duration += PDP1_MEMORY_ACCESS_DURATION;
        break;

      default:
        unsupported = true;
    }

    if (unsupported) {
      throw new Error(`unsupported instruction: ${word.toString(8).padStart(6, '0')}`);
    }

    return duration;
  }

  private incrementPC() {
    // increment the lower 12 bits, without changing the program counter extension bits
    this.pc = this.pc & PDP1_MEMORY_EXTENSION_MASK | this.pc + 1 & PDP1_MEMORY_ADDRESS_MASK;
  }

  private popcnt(value: number) {
    // Brian Kernighan's Algorithm
    let count = 0;

    value = value >>> 0;  // force uint32;
    while (value) {
      value &= value - 1; // clear lowest bit
      count++;
    }

    return count;
  }

  private toTwosComplement(onesComplementValue: number) {
    if (onesComplementValue & PDP1_SIGN_BIT_MASK) {
      if (onesComplementValue === PDP1_NEG_ZERO) return 0;
      return (onesComplementValue + 1) & PDP1_WORD_MASK | ~PDP1_WORD_MASK;
    }
    return onesComplementValue;
  }
}

class PDP1 {
  public singleStep = false;
  public breakpoint: number | null = -1;
  
  public readonly memory: PDP1Memory;
  private readonly tapeReader: PDP1TapeReader;
  public readonly cpu: PDP1CPU;
  private _address = 0;
  

  constructor(memoryBanks = 1) {
    this.tapeReader = new PDP1TapeReader();
    this.memory = new PDP1Memory(memoryBanks);
    this.cpu = new PDP1CPU(this.memory, this.tapeReader);
  }

  get address() {
    return this._address;
  }

  set address(value: number) {
    this._address = value & PDP1_WORD_MASK;
  }

  get pc() {
    return this.cpu.pc;
  }

  get programFlags() {
    return this.cpu.programFlags;
  }

  get running() {
    return this.cpu.running;
  }

  get testWord() {
    return this.cpu.testWord;
  }

  set testWord(value: number) {
    this.cpu.testWord = value;
  }

  getSenseSwitch(switchNumber: number) {
    return !!(this.cpu.senseSwitches & (1 << (6 - switchNumber)));
  }

  setSenseSwitch(switchNumber: number, value: boolean) {
    if (switchNumber < 1 || switchNumber > 6) {
      throw new Error(`invalid sense switch: ${switchNumber}`);
    }

    const bitMask = 1 << (6 - switchNumber);
    if (value) {
      this.cpu.senseSwitches |= bitMask;
    } else {
      this.cpu.senseSwitches &= ~bitMask;
    }
  }

  start(address: number = this.address) {
    const maxAddress = ((this.memory.bankCount - 1) << 12) | PDP1_MEMORY_ADDRESS_MASK;
    if (address < 0 || address > maxAddress) {
      throw new Error(`invalid start address: ${address.toString(8)}`);
    }

    this.cpu.pc = address;
    return this.continue();
  }

  continue() {
    let duration = 0;

    this.cpu.running = true;

    do {
      duration += this.cpu.step();
    } while (this.cpu.running && !this.singleStep && this.cpu.pc !== this.breakpoint);

    return duration;
  }

  mountTape(tape: Uint8Array) {
    this.tapeReader.mount(tape);
  }

  unmountTape() {
    this.tapeReader.unmount();
  }

  readIn(tape?: Uint8Array, extension = 0) {
    if (tape) {
      this.mountTape(tape);
    }

    const baseAddress = extension << 12;
    let instruction = 0;
    let duration = 0;

    this.cpu.running = true;
    this.cpu.pc = baseAddress;  // select the correct memory bank

    while (1) {
      instruction = this.tapeReader.rpb();
      const opcode = instruction >> 12 & 0o76;

      switch (opcode) {
        case 0o32:  // dio
          this.cpu.io = this.tapeReader.rpb();
          duration += this.cpu.decodeAndExecute(instruction);
          break;
        
        case 0o60:  // jmp
          duration += PDP1_MEMORY_ACCESS_DURATION; // count the jmp we're faking by starting at its address
          duration += this.start(baseAddress | (instruction & PDP1_MEMORY_ADDRESS_MASK));
          return duration;

        default:
          throw new Error(`invalid RIM instruction ${instruction.toString(8).padStart(6)}`);
      }
    }

    throw new Error('RIM tape missing jmp');
  }
}

import * as fs from 'fs';
import * as path from 'path';

const tapes = [
  { name: 'boc-olson.bin', tempo: 0o151, voices: 4 },
  { name: 'buxtehude_fugueInCmin.bin', tempo: 0, voices: 4 },
  { name: 'BWV592-3.bin', tempo: 0, voices: 4 },
  { name: 'eknm_allegro.bin', tempo: 0, voices: 4 },
  { name: 'eknm_andante.bin', tempo: 0, voices: 4 },
  { name: 'gemsOfTheBaroque.bin', tempo: 0, voices: 4 },
  { name: 'gf.bin', tempo: 0, voices: 4 },
  { name: 'jsb_2ptInv_1_13.bin', tempo: 0, voices: 4 },
  { name: 'jsb_littleFugue.bin', tempo: 0, voices: 3 },
  { name: 'jsb_wtc_v1fugue3.bin', tempo: 0, voices: 3 },
  { name: 'menuetto.bin', tempo: 0, voices: 3 },
  { name: 'wtc_if13.bin', tempo: 0, voices: 3 },
  { name: 'wtc_if3.bin', tempo: 0, voices: 3 },
  { name: 'wtc_ip1.bin', tempo: 0, voices: 4 },
];

const pdp1m13 = new Uint8Array(fs.readFileSync(path.join(__dirname, 'tapes', 'pdp1m13.rim')));
// const olson = new Uint8Array(fs.readFileSync(path.join(__dirname, 'tapes', 'boc-olson.bin')));
// const musicTape = new Uint8Array(fs.readFileSync(path.join(__dirname, 'tapes', 'buxtehude_fugueInCmin.bin')));

// const test = new Uint8Array(fs.readFileSync(path.join(__dirname, '..', 'macro', 'test.rim')));

const CHM_CPU_FACTOR = 0.92559;

const pdp1 = new PDP1(3);
console.log(`PDP-1 mem: 12K cpu: ${CHM_CPU_FACTOR * 100}% (CHM)`);

// pdp1.readIn(test);
pdp1.address = 0o4;
console.log('address = 4');

pdp1.mountTape(pdp1m13);
console.log('mount: pdp1m13.rim');

pdp1.readIn();
console.log('read in');

let firstTape = true;

function playTape(tapeName: string, tempo: number, voices: number) {
  if (!firstTape) {
    pdp1.address = 0o700;
    console.log('address = 700');
    pdp1.start();
    console.log('start');
  } else {
    firstTape = false;
  }

  if (pdp1.address !== 0o4) {
    pdp1.address = 0o4;
    console.log('address = 4');
  }
  
  pdp1.setSenseSwitch(1, true);
  console.log('sense switch 1 = on');
  
  pdp1.mountTape(new Uint8Array(fs.readFileSync(path.join(__dirname, 'tapes', tapeName))));
  console.log(`mount: ${tapeName}`);

  for (let i = 0; i < voices; i++) {
    pdp1.start();
    console.log('start');
  }
  
  pdp1.setSenseSwitch(1, false);
  console.log('sense switch 1 = off');

  if (pdp1.testWord !== tempo) {
    pdp1.testWord = tempo;
    console.log(`test word = ${tempo.toString(8)}`);
  }

  pdp1.breakpoint = 0o001671; // run compile, break at music playback
  console.log('breakpoint = 001671');

  pdp1.start();
  console.log('start');
  // fs.writeFileSync('mem4.dmp', pdp1.memory.banks[0].memory);

  // pdp1.breakpoint = 0o000730; // run until song stops
  console.log('compile complete');
  
  pdp1.breakpoint = null;
  console.log('breakpoint = null');
  console.log('playback start');

  const SAMPLE_DURATION = 1 / 44100 * 1000000;
  const audio = Buffer.alloc(300 * 44100 * 16 * 2);
  let audioPos = 0;
  let lastSampleTime = 0;
  let nextSampleTime = 0;
  let audioDuration = 0;
  let frameDuration = 0;
  let pfDuration = [0, 0, 0, 0];

  let priorPF = 0;
  let priorDuration = 0;

  while (pdp1.running) {
    const duration = pdp1.cpu.step() / CHM_CPU_FACTOR;
    frameDuration += duration;
    audioDuration += duration;
    
    while (nextSampleTime <= audioDuration) {
      // Choose the state that's closest to the ideal sample time
      let pf;
      if (priorDuration <= nextSampleTime && nextSampleTime <= audioDuration) {
        // Ideal sample time is between prior and current
        if (Math.abs(audioDuration - nextSampleTime) <= Math.abs(priorDuration - nextSampleTime)) {
          pf = pdp1.programFlags;
        } else {
          pf = priorPF;
        }
      } else {
        // We've jumped past multiple sample points (shouldn't normally happen)
        pf = pdp1.programFlags;
      }

      let left: number
      let right: number;
      left = (pf & 0o40) ? 1 : 0;
      left += (pf & 0o20) ? -1 : 0;
      
      right = (pf & 0o10) ? 1 : 0;
      right += (pf & 0o04) ? -1 : 0;

      left *= Math.round(0.4 * 32767);
      right *= Math.round(0.4 * 32767);

      audio.writeInt16LE(left, audioPos);
      audioPos += 2;
      audio.writeInt16LE(right, audioPos);
      audioPos += 2;
      
      // Always increment by exactly one sample duration
      nextSampleTime += SAMPLE_DURATION;
    }

    priorPF = pdp1.programFlags;
    priorDuration = audioDuration;

    // if (pf & 0o40) pfDuration[0] += duration;
    // if (pf & 0o20) pfDuration[1] += duration;
    // if (pf & 0o10) pfDuration[2] += duration;
    // if (pf & 0o04) pfDuration[3] += duration;

    // if (frameDuration / 1000 >= 16 + 2 / 3) {
    //   const pct = pfDuration.map(d => Math.round(d / frameDuration * 100).toString().padStart(3, '0'));
    //   console.log(pct.join(' '));
    //   frameDuration = 0;
    //   pfDuration[0] = pfDuration[1] = pfDuration[2] = pfDuration[3] = 0;
    // }
  }

  // console.log(`ma: ${pdp1.memory.ma.toString(2).padStart(16, '0')}`);
  // console.log(`mb: ${pdp1.memory.mb.toString(2).padStart(18, '0')}`);
  // console.log(`ac: ${pdp1.cpu.ac.toString(2).padStart(18, '0')}`);
  // console.log(`pf: ${pdp1.programFlags.toString(2).padStart(6, '0')}`);

  // audioDuration is microseconds of CPU time during playback
  console.log(`playback duration: ${(audioDuration / 1000000).toFixed(3)}s`);
  // audioPos is the byte position of 44.1kHz 16-bit stereo audio.
  // console.log(`audio position: ${audioPos / 44100 / 2 / 2}`);


  const writeWav = require('./wav');
  const wavName = tapeName.substring(0, tapeName.length - 4) + '.wav';
  const wavPath = path.join(__dirname, 'audio', wavName);
  writeWav(wavPath, audio.subarray(0, audioPos));
  console.log(wavName);
  console.log();
}

// playTape('boc-olson.bin', 0o151);
// playTape('buxtehude_fugueInCmin.bin', 0);

tapes.forEach(({ name, tempo, voices }) => playTape(name, tempo, voices));