export class PDP1TapePunch {
  private tape: number[] = [];

  tear() {
    const unmountedTape = new Uint8Array(this.tape);
    this.tape = [];
    return unmountedTape;
  }

  ppa(io: number) {
    this.tape.push(io & 0o377);
  }

  ppb(io: number) {
    const frame = 0o200 | ((io >> 12) & 0o77);
    this.tape.push(frame);
  }
}