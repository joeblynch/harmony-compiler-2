---
name: pdp1-asm
description: Write, optimize, debug, and assemble PDP-1 assembly (MACRO) code the way Peter Samson did — cycle-exact, self-modifying, two registers, 4K words. Bundles the complete instruction reference (semantics, timings, octal encodings, FIO-DEC codes), a catalog of every optimization idiom mined from the pdp1m13 and hc1d listings, and the MACRO assembler language + this repo's assemble toolchain. Use this skill whenever the task involves PDP-1 assembly or machine code in any form - writing or editing .mac files, reading or explaining .lst listings (pdp1m13, hc1d, MACRO), decoding octal instruction words, questions about PDP-1 instructions/timing/flags/IOTs/FIO-DEC, making PDP-1 code faster or smaller, cycle counting, the Harmony Compiler or Music 13 programs, or running `npm run pdp1 -- assemble`. Also consult it before touching hard-coded octal addresses or instruction constants anywhere in this project (e.g. src/audio-worklet), since those come from the assembly listings.
---

# Writing highly optimized PDP-1 code

This skill makes you a competent PDP-1 systems programmer for this repository — where
the assembly is not a museum piece: the emulator plays *PDP-1 Music 13* by executing
it, **pitch is derived from instruction timing**, and new/changed assembly is
assembled with the real 1963 MACRO assembler tape running inside the emulator.

## The machine in one breath

18-bit words, one's complement (negate = complement; −0 exists). Two registers
(AC, IO), six testable-only program flags, an overflow flip-flop. 4096-word banks.
No stack, no index registers — indexing is writing into an instruction's address
field (`dap`), calling is `jsp`/`jda` + a patched exit `jmp`. Memory-reference
instructions cost 10 µs, everything augmented (skips, shifts, operates, `law`,
`jmp`, non-waiting `iot`) costs 5 µs, indirection +5 µs each level. Self-modifying
code is the *normal addressing mechanism*, with a rigorous idiom set — not a hack.

## References (read before writing)

All three live in `references/` in this skill:

- **`cpu-instructions.md`** — the complete instruction set, transcribed from the
  DEC F-16A card and F-15D handbook. Word format & indirect addressing (§2), exact
  timings (§3), the full mnemonic/octal table (§4), per-instruction semantics
  (§5 memory-reference, §6 augmented: shift/skip/operate groups with all octal
  codes), IOT group + `cks` status bits + tape reader (§7), FIO-DEC/Concise
  character codes with this repo's ASCII stand-ins (appendix). This is the ground
  truth for what any instruction does, to the bit and the microsecond.
- **`optimizations.md`** — every technique catalogued from the pdp1m13/hc1d
  listings, with cycle math and source citations. Part I cost model; II
  one's-complement idioms (negate, add-back compare, sign-extend by rotate,
  shift-add multiplies, the computed-rotate parity trick); III skip calculus
  (reversed skips, combined skips, sad/sas chains, branchless select); IV
  self-modifying code toolkit (dap idioms, instruction-as-loop-counter, dispatch
  tables, patch discipline); V calling conventions (jda argument slots, multi-way
  returns, inline strings, non-local exits); VI data structures (bit-packing via
  rcl/rcr, aligned tables, sentinels, two-ended tables, literal-pool tricks); VII
  **cycle-exact real-time code** (the 175 µs balanced loop — mandatory reading for
  anything timing-sensitive); VIII hardware probing/config; IX I/O craft; X MACRO
  leverage; XI checklists; appendix technique→source index.
- **`macro-assembler.md`** — the MACRO source language (expressions, the 3-char
  symbol / 4-char macro-name rule, literals `(expr`, pseudos, `define…terminate`,
  the permanent vocabulary incl. shift counts `1s`–`9s`) and this repo's
  `npm run pdp1 -- assemble` toolchain: phases, halt PCs, error codes, and the
  ASCII↔FIO-DEC character rules (including the `*` trap). Read it before writing
  any `.mac` file — several of its rules (3-character labels! no `*`!) are easy
  to violate and produce confusing failures.

Load what the task needs: a "what does this opcode do" question usually needs only
`cpu-instructions.md`; writing or reviewing code needs `optimizations.md`; producing
an assemblable file needs `macro-assembler.md` too.

## Workflow for writing or changing PDP-1 code

1. **Establish the budget first.** Is this code timing-critical (in or near the
   play loop), space-critical, or neither? In this project the play loop's period
   *is* the audio; any change on a path the loop reaches must keep every path's
   cycle count identical (optimizations.md Part VII). Count cycles instruction by
   instruction using the §3/§4 timings — write the count in comments like the
   originals do.
2. **Design in the native idioms**, not in ported modern habits: skip+jmp
   conditionals, dap-patched addressing, jda calling, sentinels over counters,
   precompute-then-stream. Check optimizations.md Part XI's checklists; if you're
   about to write a loop/dispatch/compare, there is almost certainly a named idiom
   for it.
3. **Write MACRO source that actually assembles**: labels ≤3 chars, macro names
   ≥4, expressions join with `+ - space` only (no `*` — precompute products),
   shift counts spelled `1s`…`9s`, literals `(expr`, one `constants` (or
   `consta`) before `start`, comments with `/`. Match the style of
   `pdp-1/tapes/pdp1m13/pdp1m13.mac`: version-dated header comments, units
   documented on every scaled value, per-cell comments on variables.
4. **Assemble and verify**:
   ```
   npm run pdp1 -- assemble path/to/source.mac -o public/tapes/out.rim
   ```
   Expect the four phases (ready 01430 → pass 1 01403 → pass 2 01361 → jump block
   01377). On an error stop, the three-letter code + the typed line identify the
   problem (table in macro-assembler.md §1). Heed dropped-character warnings —
   they mean the assembled program differs from your source.
5. **Check your work against the listing conventions**: compare assembled octal
   against hand-computed encodings for anything novel (the mnemonic tables make
   this mechanical), and for timing-critical code re-count the cycles on every
   path of the final instruction sequence.

## Project ground rules

- `public/tapes/pdp1m13.rim` is **canonical**; CLI-assembled output defaults to a
  `_hc2.rim` suffix for comparison. Don't overwrite canonical tapes.
- The emulator (`src/pdp1/`) is the runtime and is **change-gated in this repo**:
  if assembly needs an instruction or device the emulator lacks, stop and surface
  the gap (the CLI's exit-code-2 diagnostic names the missing IOT) rather than
  editing the emulator.
- Magic addresses in the app (e.g. `pla` = 01671, `nog` = 0700 in
  `src/audio-worklet/pdp1-audio.ts`) come from `pdp1m13.lst`. Any assembly change
  that moves a referenced label must be reconciled with those constants — check
  the listing, never guess.
- Instruction-level timing is a feature: `cpu.decodeAndExecute()` returns each
  instruction's µs duration and the audio pipeline depends on it. That is why the
  cycle counts in these references are correctness data, not trivia.

## Exemplars and deeper background (in-repo, not bundled)

Study real code before writing new code in an unfamiliar area:

- `pdp-1/tapes/pdp1m13/pdp1m13.mac` + `.lst` — the music player; the canonical
  style reference. Per-routine walkthroughs in `pdp-1/tapes/pdp1m13/docs/`
  (22 chapters: memory map, multiply/divide, compiler, player loop, frequency
  table…).
- `pdp-1/tapes/hc1d/hc1d.mac` + `.lst` — the Harmony Compiler phase 1; the macro
  suite and I/O exemplar. Walkthroughs in `pdp-1/tapes/hc1d/docs/` (23 chapters),
  Samson's own papers in `pdp-1/tapes/hc1d/prs-docs/`.
- Primary documents: `pdp-1/docs/F15D_PDP1_Handbook_Oct63.pdf`,
  `F16A_PDP-1_Instruction_List_196307.pdf`,
  `pdp-1/tapes/macro/docs/PDP-1_Macro.pdf` (F-36BP manual) — consult when a
  question exceeds the transcribed references.
- The bundled references duplicate `pdp-1/docs/CPU_INSTRUCTIONS.md` and
  `OPTIMIZATIONS.md`; if they ever disagree, the `pdp-1/docs/` copies are the
  maintained originals — resync the skill copies from there.
