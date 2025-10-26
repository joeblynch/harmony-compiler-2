import { PDP1_DEV, PDP1_MEMORY_ADDRESS_MASK, PDP1_MEMORY_BANK_SIZE, PDP1_WORD_MASK } from './const';

export class PDP1MemoryBank {
  public readonly memory: Uint32Array;

  constructor(bankSize = PDP1_MEMORY_BANK_SIZE) {
    this.memory = new Uint32Array(bankSize);
  }

  read(address: number) {
    if (PDP1_DEV) {
      if (address < 0 || address >= this.memory.length) {
        throw new RangeError(`memory address out of range: ${address}`);
      }
    }

    return this.memory[address] as number;
  }

  write(address: number, value: number) {
    if (PDP1_DEV) {
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

export class PDP1Memory {
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

    if (PDP1_DEV) {
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

    if (PDP1_DEV) {
      if (extension >= this.bankCount) {
        throw new RangeError(`extension address out of range`);
      }
    }

    this._ma = address;
    this._mb = value;

    this.banks[extension]!.write(address & PDP1_MEMORY_ADDRESS_MASK, value);
  }
}