import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { TypewriterDecoder, asciiToFiodec, fiodecToAscii, withParity } from './fiodec';

/** Reference tool (git-ignored binary; build with `npm run build:ascii2fiodec`). */
const REFERENCE_TOOL = 'utils/ascii2fiodec/ascii2fiodec';

/** `.fio` fixtures generated once with the reference tool (-O0 build). */
const FIXTURES = [
  ['utils/title/title.mac', 'utils/title/title.mac.fio'],
  ['pdp-1/tapes/pdp1m13/pdp1m13.mac', 'pdp-1/tapes/pdp1m13/pdp1m13.mac.fio'],
  ['pdp-1/tapes/hc1d/hc1d.mac', 'pdp-1/tapes/hc1d/hc1d.mac.fio'],
] as const;

test('reproduces the committed .fio fixtures byte for byte', () => {
  for (const [source, fixture] of FIXTURES) {
    const { tape } = asciiToFiodec(readFileSync(source, 'utf8'));
    assert.deepEqual(Array.from(tape), Array.from(readFileSync(fixture)), source);
  }
});

test('matches a live ascii2fiodec -f on the real sources', { skip: !existsSync(REFERENCE_TOOL) && 'reference binary not built (npm run build:ascii2fiodec)' }, () => {
  for (const [source] of FIXTURES) {
    const text = readFileSync(source, 'utf8');
    const expected = execFileSync(REFERENCE_TOOL, ['-f'], { input: text, maxBuffer: 1 << 24 });
    assert.deepEqual(Array.from(asciiToFiodec(text).tape), Array.from(expected), source);
  }
});

test('reports dropped characters with positions', () => {
  const { tape, dropped } = asciiToFiodec('ab*c\n\t*\n');
  assert.deepEqual(dropped, [{ line: 1, column: 3, char: '*' }, { line: 2, column: 2, char: '*' }]);
  assert.deepEqual(Array.from(tape), [withParity(0o61), withParity(0o62), withParity(0o63), 0o277, 0o236, 0o277, 0o13]);
});

test('case shifts are emitted only on change, starting in lower case', () => {
  const { tape } = asciiToFiodec('aAB1');
  assert.deepEqual(Array.from(tape), [withParity(0o61), 0o274, withParity(0o61), withParity(0o62), 0o272, withParity(0o01), 0o13]);
});

test('fiodecToAscii inverts the encoder (stop code reads back as @)', () => {
  const text = 'lac (10000\tadd nog\n\tdac cb /Comment "Q"\n';
  assert.equal(fiodecToAscii(asciiToFiodec(text).tape), text + '@');
});

test('typewriter decoder tracks case across calls', () => {
  const decoder = new TypewriterDecoder();
  const codes = [0o72, 0o47, 0o61, 0o22, 0o22, 0o00, 0o01, 0o77, 0o74, 0o24, 0o22, 0o72, 0o00, 0o01, 0o62, 0o03, 0o00];
  assert.equal(decoder.decodeAll(codes), 'pass 1\nUS 1b3 ');
});
