# Appendix: quick reference

## (A) Symbol / address map (octal)

All addresses and symbols are octal. "Self-mod" marks cells that are patched at run time (see the routine that patches them).

| Addr | Symbol | Meaning |
|---|---|---|
| 4–7 | (entry vector) | 4 `nop`s; Start@4 lands here |
| 10 | (jmp go) | `jmp go` — Start@4 dispatch |
| 11 | `tuw` | detune increment |
| 12 | `tpf` | tempo fudge factor |
| 13 | `noe` | memory top, leaving room for DDT (SW3 on) |
| 14 | `nof` | memory top, no DDT |
| 15 | `nog` | compile base = 700 |
| 16 | `npt` | number of parts (voices) |
| 17 | `top` | top of bank-0 program |
| 20–23 | `f1`–`f4` | per-voice current frequency increment |
| 24 | `sum` | tape checksum accumulator |
| 25 | `ib` | tape-buffer pointer |
| 26 | `tpg` | tempo from test word |
| 27 | `tix` | `scl 8s` detune scale constant |
| 30 | `mp2` | software-multiply step target |
| 31 | `mpr` | multiply: multiplier |
| 32 | `mpy` | `jda` multiply entry / arg cell |
| 35 | `mps` | multiply skip-patch (`skp`/`skp i`) — self-mod at `beg` |
| 44 | `mp1` | multiply inner |
| 107 | `mp3` | multiply inner (signs-alike path) |
| 111 | `mpu` | hardware-multiply path (`mul`) |
| 113 | `mpx` | multiply exit |
| 114 | `dv0` | divide constant |
| 115 | `dv1` | software-divide step target |
| 116 | `dv2` | divide inner |
| 117 | `dvd` | `jda` divide entry / arg cell |
| 125 | `dvs` | divide skip-patch (`skp`/`skp i`) — self-mod at `beg` |
| 162 | `dvu` | hardware-divide path (`div`) |
| 170 | `dvw` | divide inner |
| 171 | `dve` | divide overflow exit |
| 174–175 | `f5`,`f6` | scratch frequency cells |
| 176 | `gfg` | (gfg routine) |
| 206 | `gfx` | gfg exit |
| 207–211 | `tw0`,`tw1`,`tw2` | detune setup temporaries |
| 212 | `tun` | builds the 4 detuned freq tables (300/400/500/600) |
| 222 | `tn1` | tun inner |
| 224 | `tn2` | tun inner |
| 235 | `tl` | tun loop |
| 236 | `ti` | tun index |
| 243 | `to` | tun output ptr |
| 246 | `tux` | tun exit |
| 253 | `cb` | compile write pointer (banks 1–2) |
| 254 | `eb` | end of compiled block |
| 255 | `ij` | voice index |
| 256 | `off` | note offset |
| 700 | `beg` | RIM read-in entry; probes hw mul/div, patches `mps`/`dvs` |
| 724 | `stp` | stop/halt point |
| 731 | `con` | Continue path |
| 750–753 | `b` | per-voice bar array (4) |
| 754–757 | `n` | per-voice note array (4) |
| 760–763 | `t` | per-voice time array (4) |
| 764–767 | `a` | per-voice articulation array (4) |
| 770–773 | `p` | per-voice phase/parameter array (4) |
| 1000 | `go` | Start@4 main entry |
| 1015 | `rdi` | read-voice init |
| 1024 | `rdp` | read-paper-tape voice loop |
| 1056 | `rdm` | read inner |
| 1063–1064 | `rd2`,`rd3` | read inner |
| 1114 | `rdg` | read get |
| 1126 | `rgx` | read exit |
| 1127 | `pit` | pitch temp |
| 1130 | `tem` | tempo temp |
| 1131 | `tpx` | tempo state x (max fract) |
| 1132 | `tpm` | tempo state m (multiplier) |
| 1133–1134 | `min`,`mn2` | minimum-time temps |
| 1135 | `ceb` | compile end-of-block |
| 1136 | `cpl` | compile entry |
| 1161 | `cp1` | compile inner |
| 1164 | `cp0` | compile inner |
| 1226 | `ca` | compile-articulation |
| 1237–1264 | `ca0`–`ca9` | compile-articulation cases |
| 1316 | `cpx` | compile exit (also the "full, fail" target) |
| 1317 | `cc` | compile-core |
| 1323 | `cc1` | cc inner |
| 1340 | `c0t` | compile case: time |
| 1343 | `c0a` | compile case: articulation |
| 1346 | `c0n` | compile case: note |
| 1355 | `c1n` | compile case: note (1) |
| 1357 | `c9c` | compile case |
| 1370 | `cc3` | cc inner |
| 1410 | `c0p` | compile case: part |
| 1415 | `cca` | cc-articulation |
| 1431 | `c0x` | compile: self-mod `xct` (artic compute) |
| 1434 | `c1a` | compile case |
| 1441 | `c1t` | compile case: time |
| 1443 | `cxt` | compile time exit |
| 1463 | `c58` | compile case |
| 1471 | `c5x` | compile case exit |
| 1472 | `cc2` | cc inner |
| 1501 | `cc5` | cc inner |
| 1512 | `cc6` | cc inner |
| 1530 | `cc4` | cc inner |
| 1553 | `c4m` | compile case |
| 1560–1561 | `c4n`,`c4o` | compile cases |
| 1570 | `c4p` | compile case |
| 1574 | `c4r` | compile case |
| 1577 | `c4s` | compile case |
| 1601–1602 | `c4q`,`c4x` | compile case / exit |
| 1606 | `tpo` | `jda` set-tempo (writes `tpg`/`tpm`/`tpx`) |
| 1634 | `stx` | set-tempo exit |
| 1635 | `ini` | player init |
| 1643 | `inx` | init exit |
| 1644 | `put` | player put |
| 1650 | `pux` | put exit |
| 1663 | `ptr` | compiled-data read pointer (extend mode) |
| 1664 | `ct` | segment loop counter (`isp ct`) |
| 1665 | `hop` | bank-hop dispatch |
| 1666 | `gap` | bank gap handling |
| 1667 | `plq` | player setup |
| 1671 | `pla` | **playback entry** (worklet breakpoint) |
| 1716 | `xbk` | cross-bank fetch |
| 1740 | `nxt` | fetch next segment |
| 2014 | `lup` | main playing loop (voice 1 entry) |
| 2027 | `p2c` | voice-2 clear-flag path |
| 2035 | `p3c` | voice-3 clear-flag path |
| 2047 | `p1` | voice-1 loop entry |
| 2056 | `p2d` | voice-2 dac path |
| 2064 | `p3d` | voice-3 dac path |
| 2076–2077 | `p2`,`p2s` | voice-2 loop entry / set path |
| 2105 | `p3e` | voice-3 path |
| 2117–2120 | `p3`,`p3s` | voice-3 loop entry / set path |
| 2132 | `p4` | voice-4 loop entry |
| 2137 | `pt` | base equal-tempered frequency table |
| 2237 | `sb` | saved bar pointers (4) |
| 2243 | `consta` | literal pool start |
| 2304 | `not` | tape buffer (raw notes/bars) |

Other constants: `t6`=3, `tab`=`t6*100`=300, `tbe`=`tab+400`=700, `nbk`=3. Detuned tables: 300/400/500/600 (64 entries each); voice base = `(t6+voice)<<6`. Compiled data lives in banks 1–2 (`cb` starts at 10000+`nog`). `start = beg`.

> Note: in the assembled listing the first column is a **line number**, not an address; the octal address is the *second* column. `mp3` (107) and `mpu` (111) are easy to mis-copy from their line numbers (64, 67). The body's multiply section documents them at 107 and 111.

## (B) Program flags → bit → voice / role

Flag *n* maps to bit `(1 << (6−n))` of the 6-bit flag register. The worklet samples flags 1–4 at the audio sample rate; toggling them in the player loop *is* the sound.

| Flag | Octal bit | Role | Audio sample |
|---|---|---|---|
| 1 | 40 | Voice 1 | Left +0.5 |
| 2 | 20 | Voice 2 | Left −0.5 |
| 3 | 10 | Voice 3 | Right +0.5 |
| 4 | 04 | Voice 4 | Right −0.5 |
| 5 | 02 | status: "voice(s) read" | — |
| 6 | 01 | status: "compiled" (reused as temp "triplet" bit during compile) | polled to detect compile done |

## (C) Sense switches

| SW | Skip test | Effect |
|---|---|---|
| 1 | `szs 10` | read-tape mode (on = read voices) vs. compile/play (off). Worklet sets it on to read, off to compile. |
| 2 | `szs 20` | recompile |
| 3 | `szs 30` | leave room for DDT: choose `noe` (13) vs. `nof` (14) as memory top |
| 5 | `szs 50` | swap alto/tenor (which voice drives which clf/stf channel) |
| 6 | `szs 60` | loop playback |

## (D) Instruction cheat-sheet

Word = 5-bit opcode + 1 indirect/variant bit + 12-bit `Y`. Prefix `i` sets the indirect bit. Arithmetic is **ones-complement** (negate = bitwise NOT; −0 = 777777).

| Mnemonic | Action |
|---|---|
| `lac Y` / `dac Y` | AC := C(Y) / C(Y) := AC |
| `lio Y` / `dio Y` | IO := C(Y) / C(Y) := IO |
| `dzm Y` | C(Y) := 0 |
| `dap Y` | replace only low 12 bits of C(Y) with AC<6:17> (opcode preserved) — **self-modify primitive** |
| `add`/`sub Y` | AC ± C(Y); end-around carry; sets Overflow |
| `and`/`xor Y` | bitwise |
| `idx Y` | C(Y) := C(Y)+1, AC := result (−0 → +0) |
| `isp Y` | `idx`, then skip if result ≥ 0 — non-negative loop counter |
| `sad`/`sas Y` | skip if AC ≠ / = C(Y) |
| `mul`/`div Y` | signed multiply (AC:IO) / divide (skips on success; no skip + unchanged on overflow). Optional hw |
| `jmp Y` | PC := Y |
| `jsp Y` | AC := return linkage, PC := Y — subroutine call |
| `jda Y` | C(Y) := AC; AC := linkage; PC := Y+1 — call passing AC at name cell |
| `xct Y` | execute the single instruction at C(Y) |
| `law N` / `law i N` | AC := N / AC := ~N (12-bit immediate) |
| `cla`/`cli`/`cma`/`hlt`/`lat`/`nop` | clear AC / clear IO / complement AC / halt / AC := AC OR testword / no-op |
| `clf n`/`stf n` | clear/set flag *n* (n=7 → all) |
| `sma`/`spa`/`sza`/`spi` | skip if AC<0 / AC≥0 / AC=0 / IO≥0 |
| `szf n`/`szs n` | skip if flag *n* clear / switch *n* off (`i` inverts both) |
| `skp` = 640000 / `skp i` = 650000 | never skips / always skips (in this core) |
| shift/rotate `Ns` | `N` = popcount of operand (9s=777=9 places…). `rar`/`ral`, `rcr`/`rcl`, `ril`, `sar`/`sal`, `scl` — `rcl`/`rcr`/`scl` move bits between AC and IO |
| `eem` = 724074 | enter Extend mode (single-level, full 16-bit indirect → cross banks) |
| `rpb` = 730002 | read paper-tape binary: assemble one 18-bit word from 3 tape lines (only lines with bit 200; bit 100 ignored) |

## (E) Assembler errors in the listing

The listing footer (line 1113) reports **"4 detected errors"**, shown at 3 inline caret sites. All are harmless re-assembly artifacts of a `macro1` that lacks the optional-hardware step mnemonics and the `nbk*10000` expression form; they do **not** affect runtime, because the emulator always takes the hardware `mul`/`div` path so the `repeat` step-blocks never execute.

| Listing line | Source line | Marker | Cause / impact |
|---|---|---|---|
| 58 | `repeat 21, mus mp2` (addr 51) | `UD undefined` | `mus` (multiply-step) mnemonic unknown to this assembler. Software-multiply path; never run (hw `mul` at `mpu` 111 used). |
| 118 | `repeat 22, dis dv1` (addr 132) | `UD undefined` | `dis` (divide-step) mnemonic unknown. Software-divide path; never run (hw `div` at `dvu` 162 used). |
| 790 | `sad (nbk*10000` (addr 1656) | `IC in expression` | assembler can't evaluate `nbk*10000` (illegal constant expression); the literal at 2274 assembles as 0. The compile "core full" bounds check; cosmetic. |

The footer's count of 4 exceeds the 3 distinct inline caret sites. The exact discrepancy is unclear; the most likely cause is that the assembler tallies the undefined symbol inside one of the `repeat` expansions more than once. It has no runtime effect either way.
