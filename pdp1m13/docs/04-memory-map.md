# Memory map and key variables

The PDP-1 has 18-bit words and (here) three 4K core banks. *Music 13* keeps its **entire program, all working variables, and all read-only tables in bank 0**, and writes the **compiled performance data into banks 1–2**. The player then walks that data in extend mode, hopping bank-to-bank (`hop`/`gap`, `xbk` at `1716`).

## Core-memory map

| Region (octal) | Contents |
|---|---|
| `4`–`10` | Entry vector: `4 repeat 4, opr` (4 NOPs at `4`–`7`), `10 jmp go`. Pressing **Start** with the test address at `4` falls through the NOPs into `jmp go` (`go` = `1000`). |
| `11`–`27` | Global scalars (`tuw`…`tix`) — see table below. |
| `30`–`113` | `mpy`/`mpu`/`mpx` multiply routine. |
| `114`–`173` | `dvd`/`dvu`/`dve` divide routine. |
| `174`–`246` | Flag helper `gfg` (`176`), detune builder `tun` (`212`), tempo-from-testword setup (`207`–`246`). |
| `253`–`256` | Compiler state: `cb`,`eb`,`ij`,`off`. |
| `700`–`747` | `beg` (`700`, read-in entry), `stp`/`con` (`724`/`731`) halt/continue, and the Continue/Start dispatch code through `jmp pla` at `747`. |
| `750`–`773` | Per-voice arrays `b`,`n`,`t`,`a`,`p` (4 words each) — see table below. |
| `1000`–`1135` | Start/read dispatch (`go`, `rdi`, `rdp`, `rdg`) and compile scalars (`pit`…`ceb`). |
| `1136`–`1605` | The compiler proper (`cpl` `1136`, segment former `cc`/`cc2`/`cc4`, etc.). |
| `1606`–`1662` | `tpo` tempo set, `ini` pointer init, `put` block writer. |
| `1663`–`2046` | The **player**: `ptr`,`ct`,`hop`,`gap` state, `pla` (`1671`, audio entry), `xbk` (`1716`), `nxt` (`1740`), `lup` (`2014`, the base unrolled loop body). |
| `2047`–`2136` | The three additional unrolled per-voice phase-overflow loops `p1`–`p4` (`2047`/`2076`/`2117`/`2132`). |
| `2137`–`2236` | `pt` — base equal-tempered frequency table (`/rest`, then one phase-increment per chromatic pitch b0…cs6, assuming the ~175 µs loop). |
| `2237`–`2242` | `sb` — saved bar pointers (4 voices). |
| `2243`–`2303` | `consta` — assembler literal pool (`(10000`, `(77`, `(skp`, …). |
| `2304`+ (`not`) | Raw tape buffer where `rpb` reads notes/bars (`not = . − 20`). |
| `300`–`677` | **Detuned frequency tables**: `tun` builds four slightly-offset copies of `pt`, one per voice, at `tab`=`300`, `400`, `500`, `600` (`tbe`=`700`). Each voice indexes its own copy → chorus shimmer. |

Note: the four detune tables physically occupy `300`–`677`, i.e. the space below `nog`; `nog` (`700`) is the bottom of the *compile output* area (`tbe` = `tab+400` = `700` is also where the detune tables stop), not of bank 0 generally.

`lup` is the first copy of the unrolled playing loop; it runs from `2014` through `2046` and contains its own self-modify points `p2c`/`p3c` (the `clf`/`stf` cells patched by `cpl`). The continuation copies entered when a voice's phase overflows (`jda p1`…`jda p4`) are the separate blocks at `p1`–`p4` (`2047`+). So the "player" spans `1663`–`2136` as a whole; the row split above just separates the base loop from the overflow copies.

## `nog` / `noe` / `nof` / `top` — the memory limits

Compiled output is written to banks 1–2 starting at `10000 + nog`. The two *tops* select how much room to leave for **DDT** (the resident debugger), chosen at read time by **sense switch 3** (`szs 30` at `1025`, the second instruction of `rdp` at `1024`):

| Cell | Addr | Value | Meaning |
|---|---|---|---|
| `nog` | `15` | `700` | Bottom of available mem in banks 1+ (compile base offset). |
| `noe` | `13` | `5400` | Top of bank 1 **if DDT present** (SW3 on leaves room). |
| `nof` | `14` | `7776` | Top of each bank **if DDT absent** (use it all). |
| `top` | `17` | (set) | Top of available bank 0, chosen at runtime (`nof` if SW3 off, else `noe`); guards tape reads (`sad top` after `idx ib` → fall to `hlt` "too much data" when `ib == top`). |

`pla` (`1671`) bootstraps the play pointer with `lac (10000` then `add nog`, so playback begins at the compiled base in bank 1; `hop`/`gap` (computed in `pla` from `nof`/`nog`) carry it across the bank boundary in `xbk`.

## Global variables

| Cell | Addr | Purpose |
|---|---|---|
| `tuw` | `11` | Detuning increments (3 bits per voice) consumed by `tun`. |
| `tpf` | `12` | Tempo fudge factor (2nd `mpy` factor in `tpo`). |
| `noe` | `13` | Bank-1 top with DDT present (see above). |
| `nof` | `14` | Bank top with DDT absent. |
| `nog` | `15` | Compile base = `700`. |
| `npt` | `16` | Number of parts (voices) read. |
| `top` | `17` | Top of available bank 0 (runtime limit). |
| `f1`–`f4` | `20`–`23` | Current per-voice frequency (phase) increment; summed into `p1`–`p4` each loop. |
| `sum` | `24` | Running tape checksum. |
| `ib` | `25` | Tape-buffer write/read pointer into `not`. |
| `tpg` | `26` | Tempo factor derived from the front-panel test word. |
| `tix` | `27` | Detune scale (`scl 8s`). |
| `cb` | `253` | Compiler write pointer (next free word in banks 1–2). |
| `eb` | `254` | End of the current compiled block. |
| `ij` | `255` | Voice number being read/compiled (0–3). |
| `off` | `256` | Offset of this voice's notes in the tape buffer. |
| `pit` | `1127` | Working pitch during compile. |
| `tem` | `1130` | Scratch: holds the test-word tempo, then note durations during compile. |
| `tpx` | `1131` | Max fraction for tempo. |
| `tpm` | `1132` | Tempo multiplier. |
| `min` | `1133` | Minimum time fraction across voices (segment length). |
| `mn2` | `1134` | `min` loop-count ÷ 2. |
| `ceb` | `1135` | Count of voices that reached a bar line ("end bars"); `=4` means all four are at a bar line. |
| `ptr` | `1663` | Player fetch pointer into compiled data. |
| `ct` | `1664` | Loop count for the current segment (negative; `isp ct` increments it and, on reaching 0, skips `jmp lup` to fall through to `jmp nxt`). |
| `hop` | `1665` | Step from end of one bank to start of the next. |
| `gap` | `1666` | Step from start of a bank to its end. |

## Per-voice arrays and saved bars

Each lives as 4 consecutive words (`+0`…`+3` indexed by `ij`):

| Array | Addr | Per-voice meaning |
|---|---|---|
| `b` | `750`–`753` | Bar pointer (position in this voice's bar stream). |
| `n` | `754`–`757` | Note pointer. |
| `t` | `760`–`763` | Time left in current note (192 × 8 units). |
| `a` | `764`–`767` | Time left in current articulation (192 × 8). |
| `p` | `770`–`773` | Current pitch (index into the voice's detuned table). |
| `sb` | `2237`–`2242` | Saved bar pointers (4 voices) used to repeat bars/refrains. |

These arrays plus `f1`–`f4`/`p1`–`p4` are the entire live state of the four-voice player: `b`/`n` say *where in the score*, `t`/`a` say *how long until the next event*, `p` selects the *pitch*, and `f1`–`f4` are the phase increments that the unrolled `lup`/`p1`–`p4` loop accumulates to toggle the voice flags (the sound). Note the distinction between the per-voice array `p` (`770`, the compiled pitch index) and the player phase accumulators `p1`–`p4` (`2047`+, the running phase that overflows to clock each square wave).
