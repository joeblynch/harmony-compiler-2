/**
 * FIO-DEC: the Flexowriter character code used on PDP-1 paper tape and the console typewriter.
 *
 * The tape encoder/decoder is a straight port of Peter Samson's `ascii2fiodec`
 * (utils/ascii2fiodec/ascii2fiodec.c) and is kept byte-for-byte compatible with
 * `ascii2fiodec -f` / `-a`, so the CLI feeds MACRO exactly the source tapes the SIMH
 * workflow used. Unrepresentable characters are dropped (as the C tool does), but reported.
 *
 * Deliberate difference: the C encoder's table scan runs `i < 100` (decimal) over 64-entry
 * tables, so NUL and SOH match the 0 sentinel / out-of-bounds memory and emit junk
 * (`274 212`, `302`) — undefined behaviour that must not be reproduced. This port scans
 * 0..0o77 and drops them like any other unrepresentable character.
 *
 * A tape line has 8 holes: bits 0..5 are the 6-bit "concise" code, bit 0o100 is unused by
 * the reader in alphanumeric mode, and hole 8 (0o200) is set to make the line's parity odd.
 */

/** Concise codes with special meaning (6-bit, no parity). */
export const FIODEC = {
  SPACE: 0o00,
  STOP_CODE: 0o13,     // '@' in ascii2fiodec; MACRO stops on it
  TAB: 0o36,
  LOWER_CASE: 0o72,
  UPPER_CASE: 0o74,
  BACKSPACE: 0o75,
  CARRIAGE_RETURN: 0o77,
} as const;

// Index = concise code; null = unassigned (0 in the C tables).
export const UPPER: ReadonlyArray<string | null> = [
  ' ', '"', "'", '{', '}', '|', '&', '<',
  '>', '!', null, '@', null, null, null, null,
  ':', '?', 'S', 'T', 'U', 'V', 'W', 'X',
  'Y', 'Z', null, '=', null, null, '\t', null,
  '_', 'J', 'K', 'L', 'M', 'N', 'O', 'P',
  'Q', 'R', null, null, '+', ']', '%', '[',
  null, 'A', 'B', 'C', 'D', 'E', 'F', 'G',
  'H', 'I', null, '#', null, '\b', null, null,
];

export const LOWER: ReadonlyArray<string | null> = [
  ' ', '1', '2', '3', '4', '5', '6', '7',
  '8', '9', null, '@', null, null, null, null,
  '0', '/', 's', 't', 'u', 'v', 'w', 'x',
  'y', 'z', null, ',', null, null, '\t', null,
  ';', 'j', 'k', 'l', 'm', 'n', 'o', 'p',
  'q', 'r', null, null, '-', ')', '~', '(',
  null, 'a', 'b', 'c', 'd', 'e', 'f', 'g',
  'h', 'i', null, '.', null, '\b', null, null,
];

function popcount(value: number): number {
  let n = 0;
  for (let v = value; v; v >>= 1) n += v & 1;
  return n;
}

/** Add hole 8 so the tape line has odd parity (`putpar` in ascii2fiodec.c). */
export function withParity(code: number): number {
  return popcount(code) & 1 ? code : code | 0o200;
}

export interface DroppedChar {
  line: number;   // 1-based
  column: number; // 1-based
  char: string;
}

export interface EncodedTape {
  tape: Uint8Array;
  dropped: DroppedChar[];
}

/**
 * ASCII text → FIO-DEC tape image, terminated by a stop code (`ascii2fiodec -f`).
 * Case-shift codes are emitted only when the case changes, starting in lower case.
 */
export function asciiToFiodec(text: string): EncodedTape {
  const out: number[] = [];
  const dropped: DroppedChar[] = [];
  let upperCase = false;
  let line = 1;
  let column = 1;

  for (const ch of text) {
    if (ch === ' ') {
      out.push(0o200);
    } else if (ch === '\t') {
      out.push(0o236);
    } else if (ch === '\n') {
      out.push(0o277);
    } else {
      let found = false;
      // Same search order as the C loop: for each code, upper table first, then lower
      // (bounded to the real tables; see the header about the C tool's `i < 100`).
      for (let code = 0; code < 0o100; code++) {
        if (UPPER[code] === ch) {
          if (!upperCase) {
            out.push(0o274);
            upperCase = true;
          }
          out.push(withParity(code));
          found = true;
          break;
        }
        if (LOWER[code] === ch) {
          if (upperCase) {
            out.push(0o272);
            upperCase = false;
          }
          out.push(withParity(code));
          found = true;
          break;
        }
      }
      if (!found) dropped.push({ line, column, char: ch });
    }

    if (ch === '\n') {
      line++;
      column = 1;
    } else {
      column++;
    }
  }

  out.push(FIODEC.STOP_CODE);
  return { tape: Uint8Array.from(out), dropped };
}

/** FIO-DEC tape image → ASCII (`ascii2fiodec -a`). Lines with bad parity or the 0o100 hole are skipped. */
export function fiodecToAscii(tape: Uint8Array): string {
  let out = '';
  let upperCase = false;

  for (const byte of tape) {
    switch (byte) {
      case 0o272: upperCase = false; break;
      case 0o274: upperCase = true; break;
      case 0o277: out += '\n'; break;
      default: {
        if (!(popcount(byte) & 1)) break;
        if (byte & 0o100) break;
        const ch = (upperCase ? UPPER : LOWER)[byte & 0o77];
        if (ch) out += ch;
      }
    }
  }

  return out;
}

/**
 * Decodes the 6-bit concise codes a program sends to the console typewriter with `tyo`
 * (IO bits 12..17, no parity), tracking case shifts across calls.
 */
export class TypewriterDecoder {
  private upperCase = false;

  decode(code: number): string {
    switch (code & 0o77) {
      case FIODEC.LOWER_CASE: this.upperCase = false; return '';
      case FIODEC.UPPER_CASE: this.upperCase = true; return '';
      case FIODEC.CARRIAGE_RETURN: return '\n';
      case FIODEC.TAB: return '\t';
      case FIODEC.BACKSPACE: return '\b';
      default: return (this.upperCase ? UPPER : LOWER)[code & 0o77] ?? '';
    }
  }

  decodeAll(codes: Iterable<number>): string {
    let out = '';
    for (const code of codes) out += this.decode(code);
    return out;
  }
}
