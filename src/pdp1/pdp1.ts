import { PDP1_MEMORY_ACCESS_DURATION, PDP1_MEMORY_ADDRESS_MASK, PDP1_WORD_MASK } from './const';
import { PDP1CPU } from './cpu'
import { PDP1Memory } from './memory';
import { PDP1TapeReader } from './tape-reader';

export class PDP1 {
  public breakpoint: number | null = -1;
  public singleInstruction = false;
  
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
    } while (this.cpu.running && this.cpu.pc !== this.breakpoint && !this.singleInstruction);

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