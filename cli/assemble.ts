import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { PDP1 } from '../src/pdp1';
import { createMachine } from './devices';
import { TypewriterDecoder, asciiToFiodec, type DroppedChar } from './fiodec';

export const DEFAULT_MACRO_TAPE = 'pdp-1/tapes/macro/digital-1-1a-s-mb_6-63_MACRO.bin';
export const DEFAULT_OUT_DIR = 'public/tapes';
export const DEFAULT_OUT_SUFFIX = '_hc2.rim';

/**
 * Halts in the MACRO image (Digital-1-1a-S-MB, 6/63), given as the PC *after* the `hlt` —
 * that is what `pdp1.pc` holds, because the CPU increments PC during the fetch. The `hlt`
 * itself sits one word earlier. Names are from the MACRO internals listing; each address
 * was verified to hold a `hlt` by loading the tape and examining core.
 */
export const MACRO_HALT = {
  /** hlt at 01427 (ps1-1): MACRO loaded, waiting for a source tape and Continue. */
  ready: 0o1430,
  /** hlt at 01402 (ist): pass 1 reached the stop code after `start`. */
  pass1Done: 0o1403,
  /** hlt at 01360 (s4): pass 2 done — title, binary loader and object blocks punched. */
  pass2Done: 0o1361,
  /** hlt at 01376 (s6): jump block punched; followed by `jmp 1430`. */
  jumpBlockDone: 0o1377,
  /** hlt at 03705 (alh): an error line was typed. Continue from here suppresses punching. */
  errorStop: 0o3706,
  /** hlt at 01504 (np2+6): the reader has no tape / MACRO wants the next tape. */
  readerEmpty: 0o1505,
} as const;

/**
 * Three-letter error codes this MACRO image types before an error stop, taken from the
 * `flex` words in the loaded image (the manual's list differs slightly: no zpa/ilp here,
 * but uds/ich/ipa/ils/vld). Used as a second signal when the typewriter is emulated.
 */
export const MACRO_ERROR_CODES = [
  'ich', 'ids', 'ilf', 'ilr', 'ils', 'ipa', 'ipi', 'mdd', 'mdm', 'mdt', 'mdv', 'sce', 'tmc', 'tmp', 'tmv',
  'uds', 'usa', 'usc', 'usd', 'usl', 'usm', 'usp', 'usr', 'uss', 'usw', 'vld',
];
const MACRO_ERROR_LINE = new RegExp(`^(${MACRO_ERROR_CODES.join('|')})\\b`);

/**
 * Safety cap per Continue phase: MACRO polls the I/O status with cks between reader
 * characters, so a wrong status bit would otherwise spin forever inside continue().
 */
const MAX_PHASE_INSTRUCTIONS = 200_000_000;

/** Mnemonics for the IOTs MACRO uses, for diagnostics when the emulator rejects one. */
const IOT_MNEMONICS: Record<number, string> = {
  0o720001: 'rpa (read tape, alphanumeric, no wait)',
  0o730001: 'rpa (read tape, alphanumeric, wait)',
  0o720002: 'rpb (read tape, binary, no wait)',
  0o730002: 'rpb (read tape, binary, wait)',
  0o720003: 'tyo (type out, no wait)',
  0o730003: 'tyo (type out, wait)',
  0o720004: 'tyi (type in)',
  0o720005: 'ppa (punch, alphanumeric, no wait)',
  0o730005: 'ppa (punch, alphanumeric, wait)',
  0o720006: 'ppb (punch, binary, no wait)',
  0o730006: 'ppb (punch, binary, wait)',
  0o730007: 'dpy (display)',
  0o720030: 'rrb (read reader buffer)',
  0o720033: 'cks (check I/O status)',
  0o720054: 'lsm (leave sequence break mode)',
  0o720055: 'esm (enter sequence break mode)',
  0o720056: 'cbs (clear sequence break system)',
  0o720074: 'lem (leave extend mode)',
  0o724074: 'eem (enter extend mode)',
};

export interface AssembleOptions {
  /** MACRO source file (ASCII). */
  source: string;
  /** MACRO assembler tape (RIM loader + BIN body). */
  macroTape: string;
  /** Output object tape path. */
  out: string;
  /**
   * Test word (18 bits). MACRO reads it on Start with bit 0 set (pass/punch options) and
   * after every error printout (bit 17 = auto-continue). Via Continue, 0 is the normal value.
   */
  testWord: number;
  /** Core memory banks (4096 words each). */
  banks: number;
  /** Drop the readable title lettering and blank leader ahead of the binary loader. */
  stripTitle: boolean;
  verbose: boolean;
}

export interface PhaseResult {
  name: string;
  /** Simulated microseconds. */
  duration: number;
  /** PC at the halt. */
  haltPC: number;
  /** Typewriter output during this phase (decoded). */
  typed: string;
}

export interface AssembleResult {
  phases: PhaseResult[];
  outputPath: string;
  outputBytes: number;
  droppedChars: number;
  warnings: string[];
}

export class AssembleError extends Error {
  constructor(message: string, readonly exitCode = 1) {
    super(message);
    this.name = 'AssembleError';
  }
}

const octal = (value: number, width = 6) => value.toString(8).padStart(width, '0');

export function defaultOutputPath(source: string): string {
  return join(DEFAULT_OUT_DIR, basename(source).replace(/\.mac$/i, '') + DEFAULT_OUT_SUFFIX);
}

/** Address of the instruction that just executed (the CPU increments PC before executing). */
function previousPC(pc: number): number {
  return (pc & 0o170000) | ((pc - 1) & 0o7777);
}

function describeCPUError(error: unknown, phase: string, pdp1: PDP1): AssembleError {
  const message = error instanceof Error ? error.message : String(error);
  const unsupported = /^unsupported instruction: ([0-7]+)/.exec(message);
  if (unsupported) {
    const word = parseInt(unsupported[1], 8);
    const mnemonic = IOT_MNEMONICS[word];
    return new AssembleError(
      `the emulator does not implement ${octal(word)}${mnemonic ? ` = ${mnemonic}` : ''}, ` +
      `executed at ${octal(previousPC(pdp1.pc), 5)} during ${phase}. ` +
      `Stopping here: MACRO needs this instruction and the CPU (src/pdp1/cpu.ts) does not support it.`,
      2,
    );
  }
  return new AssembleError(`${phase}: ${message} (pc=${octal(pdp1.pc, 5)})`);
}

/** One warning per distinct dropped character, with a count and the first few positions. */
function describeDropped(source: string, dropped: DroppedChar[]): string[] {
  const byChar = new Map<string, DroppedChar[]>();
  for (const d of dropped) byChar.set(d.char, [...(byChar.get(d.char) ?? []), d]);
  return [...byChar].map(([char, hits]) => {
    const where = hits.slice(0, 3).map(h => `${h.line}:${h.column}`).join(', ');
    const more = hits.length > 3 ? `, … (${hits.length} times)` : '';
    return `${source}: ${JSON.stringify(char)} has no FIO-DEC code and was dropped at ${where}${more}`;
  });
}

export function assemble(options: AssembleOptions, log: (line: string) => void = () => {}): AssembleResult {
  const warnings: string[] = [];
  const warn = (text: string) => { warnings.push(text); log(`warning: ${text}`); };

  // --- source → FIO-DEC tape ('\r' has no code and would only produce a warning per line).
  // Note: '*' has no FIO-DEC code and 6/63 MACRO has no multiply operator anyway (expressions
  // are syllables joined by +, -, or space — manual p.7); '*' in code is macro1 dialect and the
  // product must be precomputed in the source, so it is dropped with a warning like the C tool.
  const sourceText = readFileSync(options.source, 'utf8').replace(/\r\n/g, '\n');
  const { tape: encoded, dropped } = asciiToFiodec(sourceText);
  // Physical tapes end in blank trailer. MACRO pre-starts the next reader cycle after every
  // character — including the final stop code — and the emulated reader must have tape there.
  const sourceTape = new Uint8Array(encoded.length + 64);
  sourceTape.set(encoded);
  for (const text of describeDropped(options.source, dropped)) warn(text);
  log(`source: ${options.source} → ${sourceTape.length} tape lines`);

  // --- machine
  const macroTape = new Uint8Array(readFileSync(options.macroTape));
  const { pdp1, typewriterCodes, tearPunch } = createMachine(options.banks);

  const decoder = new TypewriterDecoder();
  let typedSoFar = 0;
  const drainTypewriter = (): string => {
    const text = decoder.decodeAll(typewriterCodes.slice(typedSoFar));
    typedSoFar = typewriterCodes.length;
    return text;
  };
  const logTyped = (typed: string) => {
    if (typed) log(`tty> ${typed.trimEnd().replace(/\n/g, '\ntty> ')}`);
  };

  /** Continue until hlt, stepping one instruction at a time so a runaway loop is caught. */
  const runUntilHalt = (): number => {
    let duration = 0;
    pdp1.singleInstruction = true;
    try {
      for (let i = 0; i < MAX_PHASE_INSTRUCTIONS; i++) {
        duration += pdp1.continue();
        if (!pdp1.running) return duration;
      }
    } finally {
      pdp1.singleInstruction = false;
    }
    throw new Error(`no halt after ${MAX_PHASE_INSTRUCTIONS} instructions — MACRO appears stuck (I/O status polling?)`);
  };

  const phases: PhaseResult[] = [];
  const runPhase = (name: string, expectedHalt: number, run: () => number): PhaseResult => {
    log(`# ${name}`);
    let duration: number;
    try {
      duration = run();
    } catch (error) {
      logTyped(drainTypewriter());
      throw describeCPUError(error, name, pdp1);
    }

    const typed = drainTypewriter();
    logTyped(typed);
    const errorLine = typed.split('\n').map(l => l.trim()).find(l => MACRO_ERROR_LINE.test(l));

    if (pdp1.running) {
      throw new AssembleError(`${name}: machine did not halt (pc=${octal(pdp1.pc, 5)})`);
    }
    log(`halt at ${octal(pdp1.pc, 5)} after ${(duration / 1e3).toFixed(1)} ms simulated`);

    if (pdp1.pc === MACRO_HALT.errorStop || errorLine) {
      const detail = errorLine ?? (typed.trim() || 'no typewriter output');
      throw new AssembleError(`MACRO error stop during ${name}: ${detail}`);
    }
    if (pdp1.pc === MACRO_HALT.readerEmpty) {
      throw new AssembleError(`${name}: MACRO found no tape in the reader (halt at ${octal(MACRO_HALT.readerEmpty, 5)}); the source tape may lack its stop code`);
    }
    if (pdp1.pc !== expectedHalt) {
      throw new AssembleError(`${name}: expected halt at ${octal(expectedHalt, 5)}, got ${octal(pdp1.pc, 5)} — not continuing from an unknown state`);
    }

    const result: PhaseResult = { name, duration, haltPC: pdp1.pc, typed };
    phases.push(result);
    return result;
  };

  // Same procedure as the MACRO manual (Operating Procedure) and title/title.ini in SIMH:
  // read in MACRO, Continue through pass 1, rewind, Continue through pass 2 (punches title,
  // binary loader, object blocks), Continue once more to punch the jump block.
  pdp1.testWord = options.testWord;
  if (pdp1.testWord & 1) {
    warn('test word bit 17 is set: MACRO auto-continues after error printouts, so error stops cannot be detected by halt address');
  }
  log(`test word = ${octal(pdp1.testWord)}, memory = ${options.banks * 4}K`);

  runPhase('read-in MACRO', MACRO_HALT.ready, () => {
    log(`mount: ${options.macroTape}`);
    pdp1.mountTape(macroTape);
    return pdp1.readIn();
  });

  runPhase('pass 1', MACRO_HALT.pass1Done, () => {
    log('mount: source tape');
    pdp1.mountTape(sourceTape);
    return runUntilHalt();
  });

  runPhase('pass 2', MACRO_HALT.pass2Done, () => {
    log('mount: source tape (rewound)');
    pdp1.mountTape(sourceTape);
    return runUntilHalt();
  });

  runPhase('punch jump block', MACRO_HALT.jumpBlockDone, () => runUntilHalt());

  // --- output
  let output = tearPunch();
  if (options.stripTitle) {
    const firstBinary = output.findIndex(byte => (byte & 0o200) !== 0);
    if (firstBinary > 0) {
      log(`stripping ${firstBinary} bytes of leader/title lettering`);
      output = output.subarray(firstBinary);
    }
  }
  mkdirSync(dirname(options.out), { recursive: true });
  writeFileSync(options.out, output);
  log(`wrote ${output.length} bytes → ${options.out}`);

  return { phases, outputPath: options.out, outputBytes: output.length, droppedChars: dropped.length, warnings };
}
