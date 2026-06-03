# Harmony Compiler, phase 1 — an annotated deep dive

*Harmony Compiler phase 1* (`hc1d.mac`, dated 5/21/63, retyped 2006 by Peter Samson) is the **front end** of the PDP-1 Harmony Compiler. It reads a music-transcription DSL from paper tape, compiles it through two scan passes into a packed note/bar representation in core, and **punches the intermediate tape** that the separate program *PDP-1 Music 13* later reads and plays. Diagnostics are typed on the Flexowriter (in red). In short: hc1d is the **producer** of the tape that Music 13 **consumes** — the format documented from the player's side in [`pdp1m13/docs/05-data-formats.md`](../../pdp1m13/docs/05-data-formats.md).

These notes annotate the program top to bottom, one routine (or topic) per file. They are built from:

- [`hc1d/hc1d.mac`](../hc1d.mac) — the clean MACRO source, and the authority for what the code is.
- [`hc1d/hc1d.lst`](../hc1d.lst) + [`hc1d/hc1d.err`](../hc1d.err) — a modern re-assembly with `macro/macro1`. It emits **171 diagnostics** because that reimplementation lacks the original assembler's `text`/`flexo` directives and is stricter about blanks; its octal addresses **drift** and are unreliable. We use its `-d` symbol dump only for approximate addresses (appendix), and treat the diagnostics themselves as evidence (they confirm the 6-character/upper-case symbol rule and isolate the genuine retype typos).
- [`pdp1m13/docs/`](../../pdp1m13/docs/) — the companion deep dive of *Music 13* (the player). Core PDP-1 instruction semantics are **cross-referenced** to [`02-pdp1-primer.md`](../../pdp1m13/docs/02-pdp1-primer.md) rather than repeated here.
- [`src/pdp1/cpu.ts`](../../src/pdp1/cpu.ts) — the emulator. It grounds the core ALU/jump/shift ops, but does **not** implement hc1d's tape/Flexowriter I/O (`tyo`, `rrb`, `rpa`, `cks`, `ppa`, `ppb`); those, the `flexo`/`text` pseudo-ops, and FIODEC code meanings are documented from PDP-1/MACRO knowledge and are flagged **"(not emulator-verified)."**

**Conventions.** All addresses and word values are **octal**; the PDP-1 is 18-bit and **ones-complement** (negate = bitwise NOT; a distinct `-0 = 777777` exists). hc1d is written almost entirely in a **macro pseudo-language** — read [the primer](02-hc1d-primer.md) and [the macro vocabulary](20-macro-vocabulary.md) first; every body line is a macro call you mentally expand, and subroutines use the `answer`/`exit` convention (the analogue of *Music 13*'s `jsp`/`dap` idiom). This assembler is significant to **six characters, folded to upper case** (so `complement` = the macro `comple`, `complaint` = `compla`, etc.). Because the re-assembly's addresses are unreliable, sections are headlined by **symbolic label + `.mac` line numbers**, not octal ranges. Inferred musical semantics and unverifiable I/O are flagged throughout.

## Background

- [What the Harmony Compiler (phase 1) is](01-overview.md)
- [A primer for reading hc1d (delta from the PDP-1 primer)](02-hc1d-primer.md)
- [Lifecycle: read, scan, emit, punch](03-pipeline-and-buffers.md)
- [Memory map and variables](04-memory-map.md)

## Annotated code walkthrough

These walk the program by routine (named labels, since the re-assembly addresses drift). They fall into groups: the **I/O and startup** (`wr`/`rp`/`ppp`, `u`/`ap`/`pfr`); the **reader and error subsystem** (`rch`, `er`/`red`/`blk`); the **two scan passes** — scan 1 lexes a measure and resolves rhythm, scan 2 turns it into note words (`s1…`, `s2…`, `cn`); and the **pseudo-commands and output** (`pc`/`ps`/`pv*`, the key-signature builder, and `pv4` which punches the tape).

- [I/O primitives (`wr`, `rpr`, `rp`, `fee`, `ppp`)](05-io-primitives.md)
- [Startup and title (`u`, `ap`, `pf`, `pg`, `pfr`)](06-startup.md)
- [The buffered reader and counters (`rch`, `sbc`, `snl`, `cr`, `rcw`, `rrc`)](07-reader.md)
- [The error subsystem (`er`, `er1`, `red`, `blk`) and the measure replay](08-error-subsystem.md)
- [Scan 1: lexing and number accumulation (`s1`-`s1d`)](09-scan1-numbers.md)
- [Scan 1: fraction, triplet and rest timing (`s1e`-`s1o`)](10-scan1-timing.md)
- [Scan 2: the character dispatcher and note modifiers (`s2`-`s38`)](11-scan2-dispatch.md)
- [Scan 2: forming and emitting a note (`s2r`-`s33`, `cn`)](12-scan2-note-emission.md)
- [Scan 2: embellishments — trills, mordents, turns (`s71`-`s95`)](13-scan2-embellishments.md)
- [Scan 2 tables: `s2z`, `s2y`, `ebl`/`ebd`/`ebe`](14-scan2-tables.md)
- [Terminator and measure commit (`te`, `teb`)](15-terminator-measure-end.md)
- [The pseudo-command recognizer (`pc`, `pnm`/`pcd`/`pn*`)](16-pseudo-recognizer.md)
- [Pseudo handlers: articulation, staff, units, tempo, rest, transpose, copy (`ps`, `pv*`)](17-pseudo-handlers.md)
- [The key-signature builder (`pva`, `pum`, `pue`, `put`, `pug`, `puw`)](18-pseudo-key-signature.md)
- [The "end" pseudo and the output tape format (`pv4`, `ppp`)](19-output-tape-format.md)

## Reference

- [The macro vocabulary](20-macro-vocabulary.md)
- [The input language (the music transcription DSL)](21-input-dsl.md)
- [Flexowriter codes, I/O, and the `flexo`/`text` directives](22-flexowriter-and-io.md)
- [Appendix: quick reference](23-appendix.md)
