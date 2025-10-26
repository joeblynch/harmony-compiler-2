import {
  PDP1_MEMORY_ACCESS_DURATION,
  PDP1_MEMORY_ADDRESS_MASK,
  PDP1_MEMORY_EXTENSION_MASK,
  PDP1_NEG_ZERO,
  PDP1_SIGN_BIT_MASK,
  PDP1_UNSIGNED_MASK,
  PDP1_WORD_LENGTH,
  PDP1_WORD_MASK,
} from './const';
import { PDP1Memory } from './memory';
import { PDP1TapeReader } from './tape-reader';

export class PDP1CPU {
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