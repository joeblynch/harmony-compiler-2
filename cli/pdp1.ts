/**
 * Command-line front end for the PDP-1 emulator in src/pdp1. Run with tsx:
 *
 *   npm run pdp1 -- assemble <source.mac> [-o out.rim] [--macro tape] [--tw octal] [--banks n]
 */
import { parseArgs } from 'node:util';
import { AssembleError, DEFAULT_MACRO_TAPE, assemble, defaultOutputPath } from './assemble';

const USAGE = `usage: pdp1 <command> [options]

commands:
  assemble <source.mac>   assemble MACRO source to an object (RIM-loader + BIN) tape

assemble options:
  -o, --out <file>        output tape (default: public/tapes/<source>_hc2.rim)
      --macro <file>      MACRO assembler tape (default: ${DEFAULT_MACRO_TAPE})
      --tw <octal>        test word before read-in, 0..777777 (default: 0)
      --banks <n>         4K core banks, 1..15 (default: 1)
      --strip-title       drop the readable title lettering ahead of the binary loader
  -v, --verbose           show each step
  -h, --help

exit status: 0 ok, 1 error, 2 stopped by an emulator limitation (unsupported instruction / missing device)
`;

function fail(message: string, exitCode = 1): never {
  process.stderr.write(`pdp1: ${message}\n`);
  process.exit(exitCode);
}

function isSystemError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && typeof (error as NodeJS.ErrnoException).code === 'string' && 'errno' in error;
}

function parseOctal(text: string, name: string, max: number): number {
  if (!/^[0-7]+$/.test(text)) fail(`${name} must be octal, got '${text}'`);
  const value = parseInt(text, 8);
  if (value > max) fail(`${name} must be at most ${max.toString(8)} (octal), got '${text}'`);
  return value;
}

function parseDecimal(text: string, name: string, min: number, max: number): number {
  const value = /^[0-9]+$/.test(text) ? Number(text) : NaN;
  if (!(value >= min && value <= max)) fail(`${name} must be ${min}..${max}, got '${text}'`);
  return value;
}

function main(argv: string[]) {
  const [command, ...rest] = argv;

  if (!command || command === '-h' || command === '--help') {
    process.stdout.write(USAGE);
    process.exit(command ? 0 : 1);
  }

  switch (command) {
    case 'assemble':
      return assembleCommand(rest);
    default:
      fail(`unknown command '${command}'\n\n${USAGE}`);
  }
}

function assembleCommand(argv: string[]) {
  let parsed: ReturnType<typeof parseAssembleArgs>;
  try {
    parsed = parseAssembleArgs(argv);
  } catch (error) {
    if (error instanceof Error && 'code' in error && String(error.code).startsWith('ERR_PARSE_ARGS_')) {
      fail(`${error.message}\n\n${USAGE}`);
    }
    throw error;
  }
  const { values, positionals } = parsed;

  if (values.help) {
    process.stdout.write(USAGE);
    return;
  }
  if (positionals.length !== 1) fail(`assemble takes exactly one source file\n\n${USAGE}`);

  const source = positionals[0];
  const log = values.verbose
    ? (line: string) => process.stdout.write(`${line}\n`)
    : (line: string) => { if (/^(warning:|tty>)/.test(line)) process.stdout.write(`${line}\n`); };

  try {
    const result = assemble({
      source,
      macroTape: values.macro,
      out: values.out ?? defaultOutputPath(source),
      testWord: parseOctal(values.tw, '--tw', 0o777777),
      banks: parseDecimal(values.banks, '--banks', 1, 15),
      stripTitle: values['strip-title'],
      verbose: values.verbose,
    }, log);
    process.stdout.write(`assembled ${source} → ${result.outputPath} (${result.outputBytes} bytes)\n`);
  } catch (error) {
    if (error instanceof AssembleError) fail(error.message, error.exitCode);
    if (isSystemError(error)) fail(error.message);
    throw error;
  }
}

function parseAssembleArgs(argv: string[]) {
  return parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      out: { type: 'string', short: 'o' },
      macro: { type: 'string', default: DEFAULT_MACRO_TAPE },
      tw: { type: 'string', default: '0' },
      banks: { type: 'string', default: '1' },
      'strip-title': { type: 'boolean', default: false },
      verbose: { type: 'boolean', short: 'v', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
}

main(process.argv.slice(2));
