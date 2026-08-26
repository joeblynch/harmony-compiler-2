import { PDP1_WORD_MASK } from './const';

export class PDP1TapeReader {
  // bit 1 by PDP-1 notation
  public readonly STATUS_BIT_MASK = 1 << 16;

  private tape: Uint8Array | null = null;
  private position = 0;
  private _buffer = 0;

  get buffer() {
    return this._buffer;
  }

  mount(tape: Uint8Array) {
    this.tape = tape;
    this.position = 0;
  }

  unmount() {
    this.tape = null;
    this.position = 0;
  }

  rpa() {
    if (!this.tape) {
      throw new Error('no tape is mounted');
    }

    if (this.position >= this.tape.length) {
      throw new Error('cannot read past end of tape');
    }

    this._buffer = this.tape[this.position]!;
    this.position++;

    return this._buffer;
  }

  rpb() {
    if (!this.tape) {
      throw new Error('no tape is mounted');
    }

    for (let i = 0; i < 3;) {
        if (this.position >= this.tape.length) {
          throw new Error('cannot read past end of tape');
        }

        const byte = this.tape[this.position]!;
        
        if (byte & 0o200) {
            // rbp skips lines without the 8th bit set, ignores 7th bit
            this._buffer = ((this._buffer << 6) | (byte & 0o77)) & PDP1_WORD_MASK;
            i++;
        }

        this.position++;
    }



    return this._buffer;
  }
}