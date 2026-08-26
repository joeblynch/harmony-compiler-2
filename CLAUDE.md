# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A browser-based **PDP-1 music player**, not a general emulator. It runs the actual historical *PDP-1 Music 13* program (Peter Samson's Harmony Compiler) inside a cycle-accurate PDP-1 CPU emulator, and produces sound the same way the real PDP-1 did: by toggling **program-flag bits** at audio frequencies. Each of the 4 music program flags drives one voice; the audio worklet samples those bits at the audio sample rate to synthesize the waveform.

Because pitch comes from emulated timing, **instruction-level timing accuracy is a feature, not a nicety**. `cpu.decodeAndExecute()` returns each instruction's duration in microseconds, and the audio pipeline advances the CPU until enough simulated time has elapsed for the next audio sample.

## Build & run

```bash
npm install
npm run build      # rollup -c  → dist/
npm run watch      # rollup -c -w (rebuild on change)
npm run gen-dev-keys   # one-time: self-signed cert into .dev-keys/ (git-ignored)
npm run serve      # HTTPS static server for dist/ on https://localhost:8443 (utils/serve-https.js)
```

There is **no lint**. Type checking of the browser bundles happens during the rollup build via `@rollup/plugin-typescript`. The only tests are for the CLI: `npm run test:cli` (Node's built-in runner via `tsx --test`) and `npm run typecheck:cli` (`tsc -p cli`).

The output in `dist/` is a **static browser site** (IIFE bundle + copied `public/` assets). It must be served over HTTP(S) — the AudioWorklet module load and the `fetch()` of tape files do not work from `file://`. `npm run serve` does this (accept the self-signed cert once); any static server works too.

> The `start`, `dev`, and `rebuild` npm scripts are **stale/broken**: they reference `dist/pdp1.js` (a Node entrypoint that doesn't exist — this is a browser app) and a `clean` script that isn't defined. Use `build`/`watch` and `serve` instead.

## Two-bundle build (important)

The audio worklet runs in a **separate JS realm** (`AudioWorkletGlobalScope`), so rollup produces two independent bundles with two tsconfigs:

| Bundle | Entry | Output | Format | tsconfig |
|---|---|---|---|---|
| Main app (UI + client, runs on main thread) | `src/index.ts` | `dist/scripts/main.js` | IIFE | `tsconfig.json` (**excludes** `src/audio-worklet`) |
| Audio processor (runs in worklet realm) | `src/audio-worklet/pdp1-audio.ts` | `dist/scripts/pdp1-audio.js` | ES module | `tsconfig.audioworklet.json` (`types: ["audioworklet"]`) |

Both bundles compile in the PDP-1 core (`src/pdp1/*`) and `src/shared-types.ts`. The two halves communicate **only** via `postMessage`, using the discriminated-union message types in `src/shared-types.ts` (`init`, `load-music`, `restart`, `stop`, `stopped`, `recompile`, `compiled`, `logs`, `playback-ended`, `frame-update`). When changing the client↔worklet protocol, update `shared-types.ts` and both ends together.

## Architecture

**1. PDP-1 core — `src/pdp1/`** (hardware-faithful, realm-agnostic)
- `cpu.ts` — full instruction set in 18-bit one's-complement: memory-reference ops with multi-level indirect addressing, skip/shift-rotate/operate/iot groups, `mul`/`div` via `BigInt`, add/sub with end-around carry and overflow. Every path returns a microsecond duration.
- `memory.ts` — banked core memory (4096 words/bank, up to 15 banks) backed by `Uint32Array`; tracks MA/MB; top 4 address bits select the bank (extension).
- `tape-reader.ts` — paper-tape reader. `rpb()` assembles one 18-bit word from 3 tape "lines" (only bytes with bit `0o200` set count; bit `0o100` ignored).
- `pdp1.ts` — the machine / front panel: `start`/`stop`/`continue`/`examine`/`deposit`, sense switches, test word, breakpoints, single-instruction mode, and `readIn()` which is the RIM-loader bootstrap (handles `dio`/`jmp` RIM instructions).
- `const.ts` — word masks etc. `PDP1_DEV` (currently `false`) gates memory bounds-checking; flip it on when debugging emulator memory issues.

**2. Audio processor — `src/audio-worklet/pdp1-audio.ts`** (`PDP1AudioProcessor extends AudioWorkletProcessor`)
- Owns a 3-bank `PDP1`. In `process()` it calls `pdp1.continue()` repeatedly, accumulating simulated time, and writes one audio sample whenever simulated time reaches the next sample point.
- Voice → flag → channel mapping: flag `0o40`→voice1 (L +), `0o20`→voice2 (L −), `0o10`→voice3 (R +), `0o04`→voice4 (R −). Flag `0o1` (program flag 6) signals "compilation done".
- `CHM_CPU_FACTOR` (0.92559) models the real Computer History Museum PDP-1 running slower than spec — it directly affects pitch, so don't change it casually.
- Emits `frame-update` (per-voice duty cycle, for the UI bulbs) ~60fps and `playback-ended` when the program halts.

**3. Audio client — `src/audio-client.ts`** (main thread)
- Creates the `AudioContext`, loads the worklet module, and builds the filter chain that emulates the PDP-1's analog output: 2 kHz one-pole **lowpass** (RC filter) → 30 Hz **highpass** (kills DC offset / speaker pops).
- Drives the whole session over `postMessage` and reflects worklet state into the DOM (play/pause/restart, tempo input, program-flag bulb opacities, log pane).

**4. UI glue** — `src/index.ts` (playlist click → `playMusic`), `src/scroll-fade.ts` (playlist fade mask), `src/upload.ts` (currently disabled; lets users load a local tape decoded by `tape-decoder.ts`).

**5. `src/tape-decoder.ts`** — standalone disassembler/validator for Harmony-Compiler "intermediate" tapes (parses NOTES/BARS sections, checksums, articulation, tempo). Used by the upload path for inspection; **not** part of the audio playback path.

**6. CLI — `cli/`** (Node, run with `tsx`; outside the rollup tsconfigs on purpose, it imports `src/pdp1` directly)
- `npm run pdp1 -- assemble <source.mac> [-o out.rim]` runs the real DEC MACRO assembler tape (`pdp-1/tapes/macro/digital-1-1a-s-mb_6-63_MACRO.bin`) inside the emulator to assemble PDP-1 sources, following the MACRO manual's operating procedure: `readIn()` (halts at `0o1430`), Continue = pass 1, rewind, Continue = pass 2 (punches title lettering, the BIN loader, object blocks), Continue = jump block. Default output `public/tapes/<name>_hc2.rim`; **`public/tapes/pdp1m13.rim` stays canonical**, the `_hc2` output is for comparison.
- `cli/fiodec.ts` is a byte-exact port of `utils/ascii2fiodec/ascii2fiodec.c` (source text → FIO-DEC tape, typewriter decoding). `cli/fiodec.test.ts` checks it against committed `.mac.fio` fixtures (generated once with the C tool) and, when present, the C binary itself — which is git-ignored and must be built with `npm run build:ascii2fiodec` (`-O0`: the C source has an out-of-bounds table scan and segfaults at `-O2`).
- MACRO halt PCs (`MACRO_HALT` in `cli/assemble.ts`, verified against the loaded image): ready `01430`, pass 1 done `01403`, pass 2 done `01361`, jump block done `01377`, error stop `03706`, reader empty `01505`. A halt anywhere else aborts rather than pressing Continue from an unknown state.
- The full pipeline **works end-to-end**: `public/tapes/pdp1m13_hc2.rim` (assembled 2026-08-25) loads to a memory image identical to canonical `pdp1m13.rim` (0/12288 words differ, same halt PC). If a source needs an instruction the emulator lacks, the run stops with exit status 2 and a diagnostic naming it.
- The `.mac` sources in `pdp-1/tapes/` are **macro1 (cross-assembler) dialect**; real 6/63 MACRO has no `*` multiply operator and ends comments at the first tab. `pdp1m13.mac` needs three conversions to assemble (see the `pdp1-asm` skill's macro-assembler reference); the CLI warns about dropped `*` characters.

### End-to-end flow to play a song
1. Client `init()` → fetch `tapes/pdp1m13.rim`, send `init`.
2. Worklet `initPDP1` → `address=4`, mount, `readIn()` (RIM bootstrap loads the music player into banks 1–2).
3. Click a playlist item → client fetches the song `.bin` → sends `load-music`.
4. Worklet `loadMusic` → sense switch 1 on, mount tape, `start()` once per voice, then `compile()`.
5. Worklet `compile` → set test word (tempo), toggle sense switches, breakpoint at `pla` (`0o1671`), run until flag `0o1` set, then enable single-instruction mode and post `compiled`.
6. `process()` steps the CPU and samples flags into audio.

## Tapes & assembly source

- `public/tapes/*.bin` — Harmony-Compiler intermediate music tapes. `public/tapes/pdp1m13.rim` — the music-player program (RIM format).
- `src/music-tapes.ts` — the playlist: each entry's tempo is **octal**, with a voice count. The `data-song` attribute in `public/index.html` indexes into this array.
- Tempo (test word) valid range: **`0o40`–`0o1377`** octal (enforced in `audio-client.ts`).
- `pdp1m13/pdp1m13.mac` (+ `.lst`/`.txt` listing) is the original MACRO assembly source for *PDP-1 Music 13*. Use it as the authority for magic memory addresses, e.g. `pla` = `0o1671` (playback entry), `nog` = `0o700` (clear-song address). Reach for it whenever you need to understand or change a hard-coded address in `pdp1-audio.ts`.
- `pdp-1/tapes/` holds the MACRO assembler tape, the `pdp1m13`/`hc1d` sources with their listings and docs. `utils/title/` is the SIMH-based reference run (`title.ini`) that the CLI's assemble flow mirrors.
- `macro/` is git-ignored scratch/debug output (the `macro1` assembler, audio dumps, gzipped artifacts) — not part of the app.
