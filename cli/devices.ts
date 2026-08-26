import { PDP1 } from '../src/pdp1';

/**
 * Builds a PDP-1 wired up with the peripherals the assembler needs beyond the reader:
 * the console typewriter (a constructor callback; codes are collected here in order) and
 * the paper-tape punch (always present on the machine; `tearPunch()` hands over everything
 * punched so far and starts a fresh tape, via `pdp1.tearPunchedTape()`).
 */
export interface Machine {
  pdp1: PDP1;
  /** Every 6-bit concise code sent with `tyo` so far, in order. */
  typewriterCodes: number[];
  tearPunch(): Uint8Array;
}

export function createMachine(banks: number): Machine {
  const typewriterCodes: number[] = [];
  const pdp1 = new PDP1(banks, code => typewriterCodes.push(code));
  return { pdp1, typewriterCodes, tearPunch: () => pdp1.tearPunchedTape() };
}
