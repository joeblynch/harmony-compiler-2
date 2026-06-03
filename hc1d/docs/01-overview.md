# What the Harmony Compiler (phase 1) is

*Harmony Compiler phase 1* (`hc1d`) is the **front end** of Peter Samson's Harmony Compiler for the DEC PDP-1. Its job is the mirror image of the player documented next door in [`../../pdp1m13/docs/`](../../pdp1m13/docs/01-overview.md): where *PDP-1 Music 13* **reads** an intermediate note/bar tape and plays it, `hc1d` is the program that **produces** that tape. It reads a human-authored music-transcription language from paper tape, compiles it, and punches the intermediate note/bar tape that *Music 13* later loads and performs. The two programs meet only at that tape, whose envelope is described from the consumer's side in [`../../pdp1m13/docs/05-data-formats.md`](../../pdp1m13/docs/05-data-formats.md); `hc1d`'s output handler (`pv4`, below) is the producer that the format agreement is with. Along the way it also types diagnostics — "complaints" and "errors" — on the Flexowriter.

The source header (lines 1-3) carries the provenance:

```
 harmony compiler  phase 1  : 5/21/63
/Form A-31276490732-3b/21
/ retyped 060321
```

So the program dates to **21 May 1963** (form number `A-31276490732-3b/21`), and this clean MACRO listing was **retyped 060321** (`YYMMDD` = 21 March 2006) by Peter Samson, whose initials `--prs` annotate the handful of dated edits scattered through the body (e.g. the `mt` table base change at line 1578, dated 2006-02-25, and the `nl`→`nld` save: `move nl, nld` added at line 1143 and consumed at lines 790/795, dated 2006-02-26). "Phase 1" is the division-of-labour name: this is the **compiler front end**, a distinct program from the **player** (*Music 13* is the back end). The word "compiler" thus spans two programs in this toolchain, exactly as the player overview notes — `hc1d` is the score-to-tape compiler, and *Music 13* runs its own *second* compile pass on the tape `hc1d` punches.

The data flow runs through two scanning passes over an in-core source buffer. The program's entry/restart label is `u` (defined at line 406, `u, halt`); the assembler's `start u` directive (line 1604) sets `u` as the run address. (Note that `u` is itself a `halt`: the machine stops there on entry and after each completed compile, and `pv4` ends with `goto u` at line 1341 to return to it; the operator presses continue to advance into the assembler proper at `ap`, line 407.) Characters arrive from the tape reader and are accumulated into the source-character buffer `f` (base `fb`, see the memory map at lines 1576-1602) by the read-character routine `rch` (`rch,` at line 483). **Scan 1** (`s1`, lines 677-827) is the lexer-plus-timing pass: it walks the buffered characters via `rch`, classifies numeric vs. non-numeric fields (`ldl`, `ucd`, `num`, `n1`/`n2`), tallies separators (`g`/`r`/`cm`, `rt`/`lt`), accumulates running time (`tim`), and validates the measure — emitting the fatal **errors** `tmf`/`tff`/`unc`/`ert` (the `error` macro → `jda er1`, lines 645-651) or the non-fatal **complaints** `bbl`/`tmr`/`tmg`/`tmc`/`dtu` (the `complaint`/`compla` macro → `jda er`, lines 747-822) when the transcription does not add up. The terminator routine `te` (line 1193, `te, test0 trm, s1`) closes a measure and loops back to `s1`. **Scan 2** (`s2`, lines 832 onward) is the note-forming pass: it re-reads the same buffered characters and builds compiled **note words** into the `not` array, threading them through the three-stage pitch model — `nt` (canonical scale) → `kt` (after the key signature) → `mt` (after a momentary accidental) — and recording bar boundaries in the `bar` pointer array (`bc`/`tbc`/`nl`/`lmb`). Pseudo-commands embedded in the score (`s`, `l`, `e`, `end`, `bass`/`treble`/`tenor`/`alto`, `units`, `key`, `rest`, `copy`, `up`/`down`, `h`, `q`, `tempo`, decoded from the `pn1..pnh` name strings at lines 1255-1271) dispatch — via `dispatch pcd-1` (line 1246) through the jump table `pcd` (line 1248) — to handlers `pv1..pvh`, returning via the `psw` switch at `ps` (line 1273, `ps, govia psw`). (The musical meaning of each handler is partly inferred.)

The compiled `not`/`bar` core arrays are turned into the output tape by the **`end`** pseudo-command's handler, `pv4` (lines 1309-1341; the comment `/end` confirms it, and `pn4` = `65 45 64` decodes as the FIODEC characters `e n d`). It calls `sbc` (line 456) to settle the bar count, then drives the binary punch routine `ppp` once per logical field — the note count, the note entries, their checksum, then the bar count, the bar entries, and their checksum:

```
pv4,    call sbc        /end
        ...
        call ppp        /no. of notes
        ...
        call ppp        /note entry
        ...
        call ppp        /+checksum
        ...
        call ppp        /no. of bars
        ...
        call ppp        /bar entry
        ...
        call ppp        /+checksum
```

That count → entries → checksum sequence, punched per section, is precisely the per-section envelope that *Music 13* later reads back ([`05-data-formats.md`](../../pdp1m13/docs/05-data-formats.md)). (`ppp`, lines 389-401, builds three paper-tape lines per 18-bit word via the `ppb` punch IOT, rotating the word with `ril 6s` between lines; the punch/reader IOTs are not implemented in this repo's emulator and are documented from standard PDP-1 I/O knowledge — *not emulator-verified*.)

## What this accomplishes

`hc1d` is the compiler half of the toolchain: it ingests a typed music-transcription score from paper tape, lexes and time-checks it (scan 1), forms the actual note and bar data (scan 2), reports any transcription faults on the Flexowriter (errors and complaints), and on `end` punches the intermediate note/bar tape in the exact format *PDP-1 Music 13* expects. This doc set mirrors the sibling [`pdp1m13/docs/`](../../pdp1m13/docs/01-overview.md) set in structure and conventions; assume you have read the player overview before continuing.

Next: the PDP-1 primer addendum and the macro layer (the "Rosetta stone" of `define ... termin` macros that every body line expands through).
