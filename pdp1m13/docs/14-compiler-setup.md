# `1136`-`1316`: the compiler — setup and the measure loop (`cpl`/`ca`)

`cpl` (`1136`) is the top of *Music 13*'s compiler — the **second compilation pass**, which turns the intermediate note/bar tape (the output of the separate Harmony Compiler) into the packed, banked segment stream the player loop walks. It is a `jsp` subroutine: the caller has already read the raw voices off paper tape into the per-voice bar-pointer table `b` (`rdm` and friends), set the tempo on the test word, and now jumps in to turn that into the playable, banked segment data the player loop walks. This first chunk does three things, in order:

1. **prologue (`cpl`..`cp0`)** — patch the voice-2/voice-3 flag instructions inside the player loop so the right flag drives the right channel, then initialise the compile-output pointers and read the tempo.
2. **`ca`** — the *measure loop*: a "have all four voices reached a bar line?" gate that, when satisfied, advances every voice to its next measure.
3. The "all done" tail that closes out compilation and returns through `cpx`.

Everything here is heavy on self-modifying code. Read every `dap`/`dac .`/`idx .` as "the operand is patched at run time."

## Prologue: patch the player's voice-2/3 flag ops (`1136`-`1163`)

```
1136  cpl,  dap cpx        / stash return address into the exit jmp
1137        lac (clf 2
1140        lio (stf 2
1141        dac p2c
1142        dac p2d
1143        dac p3c
1144        dac p3d
1145        dac p3e
1146        dio p2s
1147        dio p3s
1150        lac (clf 3
1151        lio (stf 3
1152        szs 50          / switch 5 swaps alto, tenor
1153        jmp cp1
```

`dap cpx` (`1136`) is the standard `jsp` entry idiom: it deposits the return address (passed in AC by the caller's `jsp cpl`) into the *address part* of the cell `cpx` (`1316`), which is itself a `jmp .`. `dap` preserves the opcode bits and overwrites only the low 12 bits (in the emulator, `C(ma) = (C(ma) & 0o770000) | (AC & 0o7777)`), so `cpx` becomes `jmp <return>`. The routine will fall into it at the end to return.

The next block is **configuring the unrolled player loop's voice flags**. The player has parallel copies `p2c`/`p2d`/`p2s` (voice 2) and `p3c`/`p3d`/`p3e`/`p3s` (voice 3); each is a literal `clf n`/`stf n` instruction sitting in the player code that toggles a program flag, and *toggling that flag at the phase-overflow rate is the sound*. The flag→voice map matters:

| flag | octal bit | voice / channel |
|---|---|---|
| flag 2 | `20` | voice 2 (Left −) |
| flag 3 | `10` | voice 3 (Right +) |

`cpl` loads `(clf 2` into AC and `(stf 2` into IO (these `(...` operands are literals from the constant pool), then sprays AC = `clf 2` into the five "clear" slots `p2c`, `p2d`, `p3c`, `p3d`, `p3e` and IO = `stf 2` into the two "set" slots `p2s`, `p3s`. After this fan-out, **both** the voice-2 and voice-3 player slots are temporarily wired to flag 2. Then `lac (clf 3` / `lio (stf 3` reloads AC/IO with the flag-3 forms, and `szs 50` (sense switch 5) decides where they land.

The skip sense is the part most likely to trip you up: in this core `szs n` **skips when sense switch n is OFF** (the emulator skips when `!(ss & bit)`; the `i` prefix would invert that, and there is no `i` here). So:

- **SW5 off** (`szs 50` skips the `jmp cp1` at `1153`), so execution falls into the inline block at `1154`, which writes `clf 3`/`stf 3` into the **voice-3** slots `p3c`,`p3d`,`p3e`,`p3s` and then `jmp cp0`. Voice 3 ends up on flag 3; the voice-2 slots keep the `clf 2`/`stf 2` from the fan-out.

```
1154        dac p3c         / AC = clf 3
1155        dac p3d
1156        dac p3e
1157        dio p3s         / IO = stf 3
1160        jmp cp0
```

- **SW5 on** (`szs 50` does *not* skip), so the `jmp cp1` runs and control reaches `cp1` (`1161`), which writes `clf 3`/`stf 3` into the **voice-2** slots `p2c`,`p2d`,`p2s`, leaving the voice-3 slots as the `clf 2`/`stf 2` they were set to above.

```
1161  cp1,  dac p2c        / AC = clf 3
1162        dac p2d
1163        dio p2s         / IO = stf 3
```

Net effect: by default (SW5 off) voice 2 → flag 2 and voice 3 → flag 3; with SW5 on the two are swapped (voice 2 → flag 3, voice 3 → flag 2). This is the documented **"switch 5 swaps alto, tenor"**: which inner voice drives the Left− channel (flag 2 = `20`) versus the Right+ channel (flag 3 = `10`). Note the asymmetry in slot counts (two voice-2 clear slots `p2c`/`p2d`, three voice-3 clear slots `p3c`/`p3d`/`p3e`): voice 3's loop body has one extra `clf` op. The fan-out wires *both* voices to flag 2 first, then the selected branch overwrites just one voice's slots with the flag-3 forms; the other voice is left holding the flag-2 fan-out values.

Per the header conventions this prologue does **not** touch the voice-1/voice-4 slots — those are flags 1 (`40`) and 4 (`04`) and are fixed.

## `cp0`: compile-output pointers, save bar table, read tempo (`1164`-`1225`)

```
1164  cp0,  lac (10000
1165        add nog
1166        dac cb          / cb = 10000 + nog  (compile write ptr, bank 1)
```

`cb` (`253`) is the compiler's write pointer. `nog` (`15`) = `700` is the bottom of the compile area; `10000` is the base of core bank 1 (banks 0..7777, 10000..17777, …). So `cb` starts at `10000+700` — the player reads compiled data from **banks 1..2 in extend mode**, and the compiler writes it there starting here.

```
1167        lac b           / save the four bar pointers b+0..b+3 into sb..sb+3
1170        dac sb
1171        lac b+1
1172        dac sb+1
1173        lac b+2
1174        dac sb+2
1175        lac b+3
1176        dac sb+3
```

`b` (`750`..`753`) holds the four voices' current **bar pointers** (one per voice) as read from tape. The measure loop below will consume and advance `b` destructively, so `cp0` snapshots all four into `sb` (`2237`..`2242`); the "all done" tail restores them.

```
1177        law (600000      / prime the pump
1200        dac n
1201        dac n+1
1202        dac n+2
1203        dac n+3
```

`n` (`754`..`757`) holds each voice's current **note pointer**. Watch the addressing here: `law (600000` does **not** load the value `600000`. The `(600000` literal lives in the constant pool at `2260`, and `law` takes a 12-bit *immediate*, so `law (600000` loads the literal's **address** — AC = `2260` (assembled word `702260`). Each `n` cell is therefore seeded with `2260`, a *pointer* to a cell whose contents are `600000`. `600000` is the **sentinel** meaning "not pointing at a real note / end of a bar." Seeding all four `n` cells with this sentinel-pointer forces the very first pass of `ca` (which dereferences `i n`) to see `600000` for every voice and treat them all as "at a bar line," so the loop immediately advances each voice from its bar pointer to its first note — the comment's *"prime the pump."*

```
1204        lat              / test word contains tempo?
1205        dac tem
1206        sub (1400
1207        sma
1210        jmp cp2          / if too big
1211        add (1340
1212        spa
1213        jmp cp2          / if too small
1214        lac tem
1215        jmp cp3
1216  cp2,  law 252          / default, 170.
1217  cp3,  dac tpg          / save tempo value from test word
```

`lat` ORs the front-panel **test word** into AC (this is how the worklet injects tempo: it sets the test word, the spec range being `40`–`1377` octal). `dac tem` saves it. The range check is a classic ones-complement two-sided clamp:

- `sub (1400`: AC = tempo − `1400`. If tempo ≥ `1400` the result is ≥ 0 (sign clear); `sma` (skip if AC < 0) does *not* skip, so `jmp cp2` (too big → default).
- Otherwise `add (1340`: AC = (tempo − `1400`) + `1340` = tempo − `40`. If tempo < `40` this is negative; `spa` (skip if AC ≥ 0) does *not* skip, so `jmp cp2` (too small → default).
- In range: `lac tem` reloads the original value and `jmp cp3`.

`cp2` substitutes the default `252` octal (= 170 decimal, per the comment). Either way `cp3` stores the chosen tempo into `tpg` (`26`).

```
1220        law 252
1221        jda tpo          / set tempo
1222        lac nof
1223        add cb
1224        sub nog
1225        dac eb
```

`jda tpo` calls the tempo routine (`tpo` at `1606`); `jda` deposits AC (`law 252`) into the cell `tpo` as its argument, then runs at `tpo+1` — it computes the tempo state (`tpm`/`tpx`) used later when emitting note durations. Note the seed in AC is the fixed literal `252`; this is only the *first* factor. `tpo` itself reads the validated tempo with `lio tpg` (`tpo`+3) and multiplies the two together, so `tpg` is consumed *inside* `tpo`, not elsewhere — both the `252` seed and the clamped `tpg` feed the tempo computation.

`eb` (`254`) is the **end-of-block** boundary for the current output bank: `eb = nof + cb − nog`. `nof` (`14`) is the in-bank memory top; this sets `eb` so that `put` (`1644`, below) can detect when `cb` has filled the current bank and needs to hop to the next.

## `ca`: the measure loop — "are all voices at a bar line?" (`1226`-`1234`)

```
1226  ca,   lac (600000      / are all voices at bar line?
1227        sad i n
1230        sas i n+1
1231        jmp cc
1232        sad i n+2
1233        sas i n+3
1234        jmp cc
```

This is the gate. `lac (600000` here is a real `lac` (assembled word `202260`), so AC = `C(2260)` = the sentinel value `600000`. `n` holds four note pointers; `i n` is an **indirect** reference, so `sad i n` / `sas i n+1` compare AC against the *word pointed to by* each `n(ij)` — i.e. the current note word of each voice. The skip logic is a short-circuit test:

- `sad i n` — skip if `C(C(n)) ≠ 600000`. If voice 0's current note is **not** the bar sentinel (the voice is mid-measure), skip the next instruction; that lands on `1231 jmp cc`, so we go compile a segment. If voice 0 *is* at the sentinel, do not skip → fall to `sas i n+1`.
- `sas i n+1` — skip if `C(C(n+1)) == 600000`. If voice 1 *is* at the sentinel, skip the `1231 jmp cc` and continue testing voices 2/3 at `1232`. If voice 1 is mid-measure, do not skip → `1231 jmp cc`.

So the pattern "`sad i n` / `sas i n+1` / `jmp cc`" means: take `jmp cc` (compile a normal segment) **as soon as either voice 0 or voice 1 is mid-measure**, and only reach the second pair (`1232`) when both are at the sentinel. The second pair applies the same test to voices 2 and 3.

Net: the routine falls through past `1234` (to "advance to next measure") only when **all four** voices are at a bar line; it takes `jmp cc` (`1317`) the moment **any** voice still has notes left in its current bar. Note the priming subtlety: on the very first pass all four `n` were seeded with `2260`, a pointer to the literal `600000`, so `i n` dereferences to the sentinel for every voice — the "all at bar line" branch is forced, and every voice is advanced to its first measure.

```
1235        law t
1236        dap ca0
1237  ca0,  dzm .            / clear t..a
1240        idx ca0
1241        sas (dzm a+4
1242        jmp ca0
```

**Self-modifying sweep #1.** `law t` puts the immediate address `t` (`760`) in AC; `dap ca0` patches the address part of `ca0` so it reads `dzm 760`. Then the loop:

- `ca0: dzm .` — zero the cell whose address is in `ca0`'s operand (starts at `t`).
- `idx ca0` — increment `ca0` itself, so its operand now points one cell higher.
- `sas (dzm a+4` — skip if `C(ca0) == "dzm a+4"`. The terminator literal is the fully-assembled instruction `dzm a+4` (pool cell `2263` = `340770`). `a+4` = `770` (= `p`), so the loop clears `t+0..t+3` and `a+0..a+3` — the eight cells of the `t` (time-left-in-note) and `a` (time-left-in-articulation) arrays, stopping *before* it would clobber `p` (pitch). When `idx` bumps `ca0` to `dzm 770` the `sas` matches and skips the `jmp ca0`, ending the sweep.

Clearing `t`/`a` resets every voice's note-time and articulation-time counters at the measure boundary.

```
1243        dzm ij
1244  ca1,  law b
1245        add ij
1246        dap ca2
1247        dap ca4
1250        add (n-b
1251        dap ca3
```

**Self-modifying sweep #2 (`ca1`..`ca9`): advance each voice's bar pointer to its first note pointer.** `ij` (`255`) is the voice index, zeroed to start. Each iteration:

- `law b` / `add ij` → AC = `b + ij` (address of this voice's bar pointer).
- `dap ca2` and `dap ca4` patch both `ca2` and `ca4` to address `b(ij)`.
- `add (n-b` adds the constant `n−b` = `4` (pool cell `2244` = `000004`) → AC = `n + ij` (address of this voice's note pointer); `dap ca3` patches `ca3` to address `n(ij)`.

So within one iteration, `ca2`/`ca4` operate on `b(ij)` and `ca3` on `n(ij)`.

```
1252  ca2,  lac .            / get bar ptr
1253        sza i            / skip if AC != 0
1254        jmp ca9          / if voice is over
1255        dac tem
1256        lac i tem
1257        sad (600000      / skip if C(tem-target) != 600000
1260        jmp ca9          / if voice is over
1261  ca3,  dac .            / put note ptr
1262        sas (600000      / skip if AC == 600000
1263  ca4,  idx .            / advance bar ptr
1264  ca9,  idx ij
1265        sas (4
1266        jmp ca1
```

- `ca2: lac .` reads `C(b(ij))`, the voice's bar pointer.
- `sza i` is `sza` with the `i` (invert) prefix → **skip if AC ≠ 0**. So if the bar pointer is zero (voice exhausted), do *not* skip → `jmp ca9` ("voice is over"). A nonzero bar pointer skips that jump and continues.
- `dac tem` / `lac i tem`: dereference the bar pointer — `tem` now holds the bar pointer value, and `lac i tem` loads the **first word of that bar** (a pointer to the bar's first note).
- `sad (600000`: skip if that word ≠ `600000` (`sad` here is direct — pool cell `2260` holds the sentinel value). If it *is* the sentinel, the bar is empty/over → fall through to `jmp ca9`.
- `ca3: dac .` stores AC into `n(ij)` — **"put note ptr"**: the voice's note pointer is now set to the contents at its bar pointer, i.e. the start of the new measure.
- `sas (600000`: skip if AC == `600000`. (Here AC still holds the word from `lac i tem`.) Having already filtered the sentinel at `sad (600000` above, AC is non-sentinel, so this guard does not skip and `ca4` runs; it is a defensive duplicate of the earlier test.
- `ca4: idx .` increments `b(ij)` — **"advance bar ptr"** — so next time the voice's bar pointer points one entry further along its bar list.
- `ca9: idx ij` bumps the voice index, leaving the incremented value in AC; `sas (4` skips the `jmp ca1` loop-back when `ij == 4` (all four voices processed); else `jmp ca1`.

After this sweep each voice that still has music has had its `n(ij)` repointed to the start of its next measure and its `b(ij)` advanced; exhausted voices were left alone (their `n` still holds the `2260` sentinel-pointer from the prime, or whatever value the dereference produced).

## The "all done" tail (`1267`-`1316`)

```
1267        lac (600000
1270        sad i n
1271        sas i n+1
1272        jmp cc
1273        sad i n+2
1274        sas i n+3
1275        jmp cc
```

This repeats the *exact* four-way bar-line test from `ca` (`1226`). After advancing every voice to its next measure, we re-ask: did any voice get a real note? If so (`jmp cc`), go compile that segment. Only if **all four voices are still at the sentinel** — i.e. every voice has truly run out of measures — do we fall through to the finish.

```
1276        lac sb           / restore the four bar pointers
1277        dac b
1300        lac sb+1
1301        dac b+1
1302        lac sb+2
1303        dac b+2
1304        lac sb+3
1305        dac b+3
```

Restore `b+0..b+3` from the `sb` snapshot taken in `cp0`, undoing the destructive advances so the bar table is intact for any subsequent pass (e.g. replay/recompile).

```
1306        lac (10000
1307        add nog
1310        sas cb           / skip if cb == 10000+nog
1311        stf 6            / set flag if successful
```

Recompute the initial value of `cb` (`10000 + nog`) and compare against the current `cb` with `sas` (skip if equal). If `cb` is **unchanged**, nothing was ever written → skip the `stf 6`. Otherwise `cb` has advanced (real data was emitted) and `stf 6` sets **program flag 6** (`01`), the **"compiled" status bit**. This is precisely the bit the AudioWorklet polls to learn that compilation finished. So `stf 6` here is the success signal that unblocks playback.

```
1312        cli
1313        jsp put          / 0, 0, 0
1314        cli
1315        jsp put          / 0, 0
1316  cpx,  jmp .            / exit
```

`cli` clears IO to 0; `jsp put` (`put` at `1644`) writes IO into the compiled stream at `cb` (`dio i cb`) and advances `cb` (handling bank hops via `eb`). Each `jsp put` emits one word, so the two `cli`/`jsp put` pairs write two **zero terminator words** into the compiled segment so the player's segment-walk recognises the end of music. Finally `cpx: jmp .` — whose address part was patched to the caller's return by `dap cpx` at entry — returns from the compiler.

## What this routine accomplishes

`cpl`/`ca` is the **measure-level driver** of the compiler. Before any notes are compiled it (1) rewires the player loop's voice-2/3 flag instructions so the inner voices map to the correct audio channels, honouring the SW5 alto/tenor swap; (2) initialises the bank-1 output pointer `cb` and the bank boundary `eb`, snapshots the bar table into `sb`, primes all four note pointers with the `2260` sentinel-pointer (which dereferences to `600000`), and reads/clamps the tempo from the test word. Then the `ca` loop repeatedly asks *"are all four voices sitting at a bar line?"*: while any voice still has notes in its current bar it hands off to `cc` (`1317`) to compile a segment; when all four are at a bar boundary it clears the per-voice time counters (`t`/`a`), walks each voice from its bar pointer `b(ij)` to the first note of its next measure `n(ij)` (advancing `b(ij)`), and re-tests. When every voice is finally exhausted it restores `b` from `sb`, sets the **compiled** flag (flag 6) iff any output was produced, writes the zero-word terminators via `put`, and returns through the self-patched `cpx`. The whole thing leans entirely on self-modifying code — `dap`-patched operands at `ca0`/`ca2`/`ca3`/`ca4` and the constant terminators `(dzm a+4`/`(4`/`(600000` — to sweep the four parallel voice tables with a single loop body.
