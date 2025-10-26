export class PDP1TapeReader {
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