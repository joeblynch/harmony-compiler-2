export type PDP1TypewriterOutputHandler = (char: number) => void;

export class PDP1Typewriter {
  // bit 2 by PDP-1 notation
  public readonly STATUS_BIT_MASK = 1 << 15;

  constructor(private readonly onOutput?: PDP1TypewriterOutputHandler) {}

  tyo(io: number) {
    this.onOutput?.(io & 0o77);
  }
}