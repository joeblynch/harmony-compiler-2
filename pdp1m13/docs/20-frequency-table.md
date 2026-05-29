# `2137`-end: the frequency table (`pt`), the literal pool, and the assembler errors

This is the tail of the program image. It contains no executable code in the usual sense — it is the read-only **pitch table** the player indexes into, a tiny reserved area (`sb`), and the assembler's automatically-collected **literal pool** (`consta`). The `start beg` directive that fixes the load/start address closes the file. We also account for the four errors the modern re-assembler reports at the bottom of the listing.

## `pt` (`2137`): the equal-tempered base frequency-increment table

```
998   890                   / equal-tempered frequencies, assuming 175 microsec loop
999   891                   pt,	decimal
1000  892 02137 000000      	0				/rest
1001  893                   	/1337				/as0
1002  894 02140 002610      	1416				/b0
1003  895 02141 002734      	1500	1589	1684		/c1, cs1, d1
      ...
1068  911 02236 143257      	50863				/cs6
1069  912                   	/53887				/d6
```

`pt` is the canonical 12-tone **equal-tempered** table. The `decimal` pseudo-op switches the assembler's radix so the source can list the values as ordinary decimal integers; each is assembled into one 18-bit word. The table layout is:

| `pt` index | Address | Note | Decimal | Octal |
|---|---|---|---|---|
| 0 | `02137` | rest | 0 | `000000` |
| 1 | `02140` | b0 | 1416 | `002610` |
| 2 | `02141` | c1 | 1500 | `002734` |
| 3 | `02142` | cs1 | 1589 | `003065` |
| 4 | `02143` | d1 | 1684 | `003224` |
| ... | ... | ... | ... | ... |
| 62 | `02235` | c6 | 48008 | `135610` |
| 63 | `02236` | cs6 | 50863 | `143257` |

A few decimal→octal correspondences you can verify directly against the `.lst` words: `1416 = 002610`, `1500 = 002734`, `48008 = 135610`, `50863 = 143257`. These are plain integers, not packed fields, so the printed octal is just the same value in base 8. (cs6 sits at `02236`; `02236 − 02137 = 77` octal `= 63` decimal, so the last entry is index 63.)

What each word *means*: every entry is the per-iteration **phase increment** for the player's phase accumulators (`p1..p4`); the `f1..f4` voice frequencies are loaded from a detuned copy of this table. On each pass of the unrolled playing loop `lup` (`2014`), the player computes `AC = f + p`; when the 17-bit phase overflows into the sign bit it wraps the phase and toggles that voice's program flag (`stf`/`clf` on flags 1–4). The flag therefore toggles once per `2^17 / increment` loop passes, i.e. the output square-wave frequency is **directly proportional to the increment**. The header comment `assuming 175 microsec loop` pins the conversion: the table was tuned so that, given a ~175 µs loop period, these increments land on standard pitches. (The browser worklet's `CHM_CPU_FACTOR` exists precisely because the real Computer History Museum machine ran slightly off this nominal loop time, which shifts pitch.)

The values form an equal-tempered scale: each semitone is `2^(1/12) ≈ 1.0595` times the one below it. Check it on the low end — `1500 / 1416 = 1.0593` (c1 over b0), `1589 / 1500 = 1.0593` (cs1 over c1). The ratio holds all the way up; `50863 / 48008 = 1.0595` (cs6 over c6). Because the increment doubles every octave, an octave up is the same note one table-octave (12 entries) higher: e.g. c1 = 1500 and c2 = 3001 ≈ 2×.

**Index 0 is the rest** — increment `0` means the phase never advances, the flag never toggles, and the voice is silent. The player uses pitch index 0 as a rest sentinel rather than carrying a separate "is-rest" bit.

Two endpoints are **commented out** and so contribute no words:

```
1001  893                   	/1337				/as0
1069  912                   	/53887				/d6
```

`as0` (1337) below `b0`, and `d6` (53887) above `cs6`, are present in the source as documentation of where the scale *would* continue but are excluded from the assembled table. The usable compass is therefore exactly **b0 … cs6** (table indices 1…63, 63 pitches plus the rest at 0). Note that `tun()` (at `212`) reads `pt` to build four slightly **detuned** copies at `300`/`400`/`500`/`600` octal (one per voice, for the chorus shimmer); `pt` itself is the un-detuned master.

## `sb` (`2237`): saved bar pointers (reserved, not initialized)

```
1071  914                   octal
1073  916                   sb,
1074  917       002243      sb+4/
1076  919       002243      consta
```

The `octal` pseudo-op restores octal radix for the remaining definitions. `sb,` labels the **current location counter**, which is `02237` — the word immediately after the last `pt` entry at `02236`. (`sb,` emits no word, so the listing prints no address on that line.) The next line `sb+4/` is a **set-location-counter** directive (the trailing `/` sets `.` to the value on its left): it advances `.` to `sb+4 = 02243`, reserving a 4-entry array (one saved bar pointer per voice) without emitting any data. The `002243` shown on that line is the *new* value of `.` (i.e. `sb+4`), not the address of `sb`. The cells `sb[0..3]` are left uninitialized and filled by the player at run time.

## `consta` (`2243`): the literal pool

```
1076  919       002243      consta
...
1082      02243 000077
1083      02244 000004
1084      02245 240400
...
1111      02274 000000
```

`consta` is the macro assembler's **literal-pool dump directive**: every parenthesized literal written anywhere in the program — `lac (10000`, `mul (10`, `add (cxt`, `law (cla`, etc. — is collected, **deduplicated**, and laid down here as a constant word that the referencing instruction's address field points at. The pool begins at `02243` because that is where `.` was left after `sb` reserved its four words (`consta = sb+4`). Several distinct-looking literals collapse to one cell because they evaluate equal — most strikingly the array strides `(n-b`, `(t-n`, `(a-t`, `(p-a` are all `= 4` (the per-voice arrays `b`,`n`,`t`,`a`,`p` are spaced 4 apart) and so share the single cell `02244 = 000004` with the literal `(4`.

A representative decode of the pool, each line confirmed against where it is referenced in the listing (line numbers are the *source* line numbers in the second `.lst` column):

| Address | Word | Literal(s) in source | Meaning / where used |
|---|---|---|---|
| `02243` | `000077` | `(77` | low-6-bit mask (`and (77`, line 130) |
| `02244` | `000004` | `(4`, `(n-b`, `(t-n`, `(a-t`, `(p-a` | increment offset / per-voice array stride |
| `02245` | `240400` | `(dac tbe` | an instruction word used as data (`dac`, opcode 24; addr 400 — `tbe` assembled to 400 here because of the `t6*100` error, see below) |
| `02246` | `402237` | `(add pt+100` | instruction-valued literal (`add`, opcode 40; `pt+100 = 2237`) |
| `02247` | `000010` | `(10` | the constant 8, used by the `mul (10`/`div (10` hardware probe at `beg` |
| `02250` | `640000` | `(skp` | skip-group word that **never** skips — patched into `mps`/`dvs` to select the hardware mul/div path |
| `02251` | `650000` | `(skp i` | skip-group word that **always** skips — the software (`mus`/`dis`) path |
| `02252` | `000200` | `(200` | tape-line data bit (`lio (200`, line 192) |
| `02253` | `760002` | `(clf 2` | operate-group instruction as data (clear flag 2) |
| `02254` | `760012` | `(stf 2` | operate-group instruction as data (set flag 2) |
| `02255` | `760003` | `(clf 3` | clear flag 3 |
| `02256` | `760013` | `(stf 3` | set flag 3 |
| `02257` | `010000` | `(10000` | bank-1 base (extend-mode bank stride); the most-used literal (6 refs) |
| `02260` | `600000` | `(600000` | bar-line sentinel (`are all voices at bar line?`, line 393); 6 refs |
| `02261` | `001400` | `(1400` | a constant addend (`sub (1400`, line 377) |
| `02262` | `001340` | `(1340` | constant addend (`add (1340`, line 380) |
| `02263` | `340770` | `(dzm a+4` | instruction literal (`dzm`, opcode 34; `a+4 = 770`); compared with `sas` to test a packed word (line 405) |
| `02264` | `177700` | `(177700` | mask (high 12 bits set, low 6 clear) |
| `02265` | `700000` | `(700000` | top-3-bit-field mask (`and (700000`, line 484) |
| `02266` | `077777` | `(77777` | 15-bit mask |
| `02267` | `001443` | `(cxt` | address-valued literal (`cxt = 1443`; `add (cxt`, line 513) |
| `02270` | `000001` | `(1` | the constant 1 (`sad (1`, line 517) |
| `02271` | `760200` | `(cla` | operate instruction as data (`cla`; `law (cla`, line 522) |
| `02272` | `001131` | `(1131` | address constant (`tpx = 1131`; `lio (1131`, line 665) |
| `02273` | `017760` | `(17760` | mask, `/7770 and a null bit` (line 670) |
| `02274` | `000000` | `(nbk*10000` | **should be `030000`**; left `000000` by an assembler error (see below) |

Two flag-instruction cells deserve a sanity check, since the flag↔voice mapping is the heart of this program. Operate-group instructions have opcode `76`; the set/clear-flag micro-op uses bit `010` to *set* and `000` to *clear*, with the flag number in the low 3 bits. So `clf 2 = 760002`, `stf 2 = 760012`, `clf 3 = 760003`, `stf 3 = 760013` — exactly the four cells `02253..02256`. Flag 2 (`20` octal) is voice 2 (Left −) and flag 3 (`10` octal) is voice 3 (Right +); these ready-made instruction words are deposited to drive the alto/tenor channel selection (the SW5 swap, `p2c`/`p3c`/`p2s`/`p3s`).

The pervasive use of **instruction-valued literals** — `(clf 2`, `(stf 2`, `(dac tbe`, `(add pt+100`, `(dzm a+4`, `(skp`, `(skp i`, `(cla` — is idiomatic PDP-1: the program reads these constants to *compare against* assembled instruction words, to **patch** self-modifying cells, or to deposit a ready-made instruction. The `(skp`/`(skp i` pair is the canonical example: at `beg` the startup code probes for hardware mul/div and deposits either `(skp` (`640000`, never skips → take the hardware `jmp mpu`/`jmp dvu` path) or `(skp i` (`650000`, always skips → fall into the software step-loop) into `mps` (`35`) and `dvs` (`125`). A single literal cell does double duty as both a number and a micro-program.

## Closing directive

```
1078  921       002304      not=.-20	/notes & bars (tape buffer area)
1080  923       000700      start beg
```

`not = .-20` defines the tape-buffer symbol relative to the current location counter: `not = . − 20` octal `= 02304` (the assembler prints `002304`, the value of `not`, in the address column). `not` is the bottom of the raw notes/bars tape buffer and is indexed at run time as voices are read off paper tape. `start beg` is the assembler's program-start directive — it records the run-address (`beg = 0700`, shown in the address column as `000700`) so the loaded image begins execution at `beg`, the RIM read-in landing point.

## The four "detected errors"

The listing ends with `4 detected errors` (line 1113), but only **three** carry a `^` diagnostic in the body — at `.lst` lines 58, 118, and 790. All are **artifacts of re-assembling 1960s source with a modern `macro1`**; none affect any code path the browser emulator executes, because the emulator runs the original, correctly-assembled `pdp1m13.rim`.

```
58:UD undefined            	           ^      (source 49  00051  repeat 21, mus mp2)
118:UD undefined            	           ^      (source 88  00132  repeat 22, dis dv1)
790:IC in expression        	        ^         (source 698 01656  sad (nbk*10000)
```

1. **`UD undefined` at line 58** — the mnemonic **`mus`** (multiply-step) in `repeat 21, mus mp2` is unknown to this assembler. The `repeat 21` (octal, = 17 decimal) still emits its words, but each is the bare *operand* `mp2` (`000030`) instead of a `mus mp2` instruction; the block fills `00051..00071` with `000030`. This is the **software multiply** step-loop, only reached when `mps` is patched to `skp i`. Because the emulator implements hardware `mul`, `mps` is always patched to `skp` and this block is **never executed**.

2. **`UD undefined` at line 118** — identically, **`dis`** (divide-step) in `repeat 22, dis dv1` is unknown; the block (`repeat 22` octal = 18 decimal words, `00132..00153`) fills with the bare operand `dv1` (`000115`). This is the **software divide** step-loop behind `dvs`, which is likewise always patched to take the hardware `div` path. Dead at runtime.

3. **`IC in expression` at line 790** — "illegal character in expression": the assembler cannot evaluate the `*` in `nbk*10000`, so the literal `(nbk*10000` is emitted as **`02274 000000`** instead of the intended `nbk*10000 = 3*10000 = 030000` octal. This literal is the operand of `sad (nbk*10000` at `01656` (in the compile-output bank-allocation code, `cpl`/`ca`), which checks whether the compile write-pointer has run off the top of bank `nbk`. With the literal zeroed the "core full" detection there is wrong — but it only matters for songs large enough to fill banks 1–2, which the bundled tapes do not. Harmless for the shipped repertoire; if you ever re-assemble for real use, fix this expression (e.g. write the constant as `30000`).

4. **The silent fourth error: `tab=t6*100`.** Only three `^` diagnostics print, yet the summary tallies `4 detected errors`. The missing one is the *same* `*`-in-an-expression failure, this time inside an `=` assignment, where the assembler emits no caret. Line 168 defines `tab=t6*100` (intended `3*100 = 0300` octal), but the listing shows it evaluated to **`02274`'s sibling problem — `tab = 000000`** (line 223 of the listing). The fallout propagates: `tbe = tab+400 = 400` (not `700`), which is why the literal `(dac tbe` at `02245` assembled to `240400` (`dac 400`) rather than `dac 700`; and the detune-table setup `tn1, law tab` at `00222` assembled to `law 0` instead of `law 300`. As with `nbk*10000`, these are re-assembly artifacts only — the shipped `pdp1m13.rim` was produced by an assembler that evaluated `*` correctly, so `tab = 0300`, `tbe = 0700`, and the four detuned tables really do land at `300`/`400`/`500`/`600`. (The assembler attributes one error to each of `mus`, `dis`, `nbk*10000`, and `t6*100`; only the first three print a caret.)

## What this section accomplishes

`pt` gives the player its **pitch vocabulary**: 63 equal-tempered phase increments (plus a rest at index 0) tuned for the nominal 175 µs loop, from which `tun` derives four detuned per-voice copies. `sb` (`2237`) reserves scratch for per-voice bar pointers. `consta` (`2243`) is the assembler-built **constant/literal pool** that every parenthesized operand in the program points into — a mix of bit-masks, magic addresses, and ready-to-use instruction words (notably the `(skp`/`(skp i` pair that selects hardware vs. software arithmetic and the `(clf n`/`(stf n` words that drive the voice channels). `start beg` sets the run address. The four reported errors are benign re-assembly artifacts of a modern toolchain that cannot evaluate the `*` operator: two are dead software-arithmetic step-loops the emulator never enters, one zeroes a "core-full" sentinel that the bundled songs never trip, and the fourth silently zeroes `tab`/`tbe` (and the detune-table base) — all of which are correct in the shipped `.rim` the player actually runs.
