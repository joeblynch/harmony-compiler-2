# PDP-1 Music 13 — an annotated deep dive

*PDP-1 Music 13* is Peter Samson's **music player** for the DEC PDP-1 — the back end of a two-program toolchain that, in this repository, runs unmodified inside a cycle-accurate PDP-1 emulator to play four-voice music in the browser. A *separate* program, Peter Samson's **Harmony Compiler**, compiles a score written in a custom music-transcription language into an *intermediate* note/bar tape; *Music 13* reads that tape, runs a **second compilation pass** that packs it into a playback stream in core banks 1–2, and then **plays** it by toggling the PDP-1's program-flag bits at audio frequencies. There is no sound hardware: the four voices *are* four program flags switched on and off by a precisely-timed loop.

These notes annotate the program top to bottom, one routine per file. They are built from three sources, all in this repo:

- [`pdp1m13/pdp1m13.lst`](../pdp1m13.lst) — the assembled listing (each code line is `line · octal-address · octal-word · source`), including the four assembler diagnostics it emitted on re-assembly.
- [`pdp1m13/pdp1m13.mac`](../pdp1m13.mac) — the clean MACRO assembly source.
- [`src/pdp1/`](../../src/pdp1/) — the emulator. Every instruction claim here is grounded in [`cpu.ts`](../../src/pdp1/cpu.ts), and the sound mapping in [`src/audio-worklet/pdp1-audio.ts`](../../src/audio-worklet/pdp1-audio.ts).

**Conventions.** All addresses and word values are **octal** unless noted. The PDP-1 is an 18-bit, **ones-complement** machine (negate = bitwise NOT; a distinct `-0` exists). Code is quoted in the listing's `address  source` form; `.` in an operand means "this word's own address," the basis of the program's pervasive self-modifying code. If you are new to the PDP-1, read the [primer](02-pdp1-primer.md) first; the [walkthrough](#annotated-code-walkthrough) leans on it heavily.

## Background

- [What PDP-1 Music 13 is](01-overview.md)
- [A 5-minute PDP-1 primer](02-pdp1-primer.md)
- [Lifecycle: load, read, compile, play](03-lifecycle.md)
- [Memory map and key variables](04-memory-map.md)
- [Data formats: the tape, the note stream, and the compiled segment stream](05-data-formats.md)

## Annotated code walkthrough

These walk the program in address order, from the entry vector at `4` to the frequency table at `2137`. Each file quotes the relevant listing lines and explains both *what* each instruction does and *why*. The routines fall into five groups: the low-level math kernels (`mpy`, `dvd`); the setup helpers (`gfg`, `tun`); the read-in and front-panel dispatch logic (`beg`/`con`, `go`, `rdp`); the **compiler** (`cpl` → `cc` → `cxt`, with `tpo`/`ini`/`put`); and the **player** (`pla`/`nxt`/`xbk` and the sound-generating loop `lup`/`p1`–`p4`).

- [`4`-`27`: entry vector and global variables](06-entry-and-globals.md)
- [`30`-`113`: the multiply routine (`mpy`)](07-multiply.md)
- [`114`-`173`: the divide routine (`dvd`)](08-divide.md)
- [`174`-`206`: reading flags 5 and 6 from memory (`gfg`)](09-flags-gfg.md)
- [`207`-`252`: building the detuned frequency tables (`tun`)](10-detuning-tun.md)
- [`700`-`747`: read-in entry, hardware detection, and the Continue dispatch (`beg`/`stp`/`con`)](11-readin-dispatch.md)
- [`750`-`1023`: per-voice arrays, the Start dispatch (`go`), and voice init (`rdi`)](12-start-dispatch.md)
- [`1024`-`1126`: reading a voice from tape (`rdp`/`rdm`/`rdg`)](13-read-voice.md)
- [`1136`-`1316`: the compiler — setup and the measure loop (`cpl`/`ca`)](14-compiler-setup.md)
- [`1317`-`1471`: the compiler — segment scan, note decode, and articulation (`cc`/`cxt`/`c58`)](15-compiler-notes.md)
- [`1472`-`1605`: the compiler — minimum-time bookkeeping and segment emission (`cc2`/`cc6`/`cc4`)](16-compiler-emit.md)
- [`1606`-`1662`: tempo, pointer init, and the segment writer (`tpo`/`ini`/`put`)](17-tempo-init-put.md)
- [`1663`-`2013`: the player — setup, bank hopping, and note fetch (`pla`/`xbk`/`nxt`)](18-player-fetch.md)
- [`2014`-`2136`: the player — the sound-generating loop (`lup`, `p1`-`p4`)](19-player-loop.md)
- [`2137`-end: the frequency table (`pt`), the literal pool, and the assembler errors](20-frequency-table.md)

## Reference

- [How program flags become audio](21-flags-to-audio.md)
- [Appendix: quick reference](22-appendix.md)
