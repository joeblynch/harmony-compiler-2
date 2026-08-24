# `1317`-`1471`: the compiler — segment scan, note decode, and articulation (`cc`/`cxt`/`c58`)

`cc` (octal `1317`) compiles **one segment**: the stretch of music up to the next event that changes any voice. Each call finds the minimum time remaining across the four voices, decoding a fresh note for any voice whose current note has expired, then emits a fixed-length chunk of that minimum duration. The routine is a dense exercise in self-modifying code: a single `dap` fleet retargets seven memory-reference cells (`lac`/`idx`/`dac`) per voice so one body of code can walk all four per-voice arrays.

## Per-voice state arrays

The four voices share five parallel 4-word arrays in bank 0, each indexed by the voice number `ij` (`0255`):

| Array | Base (octal) | Meaning |
|---|---|---|
| `b` | `750` | bar pointer |
| `n` | `754` | note pointer (into the tape buffer) |
| `t` | `760` | time left in current note (192nds × 8) |
| `a` | `764` | time left in current articulation (192nds × 8) |
| `p` | `770` | current pitch |

Because the arrays are laid out contiguously 4 apart, the constant at `02244` is `(n-b) = (t-n) = (a-t) = (p-a) = 4`. The same offset `add` advances the running pointer from one array to the next.

## `cc1` (`1317`-`1337`): build the pointer fleet for one voice

```
1317  dzm ij           / start at voice 0
1320  lac (177700      / a large positive value...
1321  dac min          / ...so the first real time wins
1322  dzm ceb          / count of voices at a bar line
1323  law b      cc1,  / AC := base of b array
1324  add ij           / AC := &b[ij]
1325  add (n-b         / AC := &n[ij]
1326  dap c0n          / patch the two note-pointer cells
1327  dap c1n
1330  add (t-n         / AC := &t[ij]
1331  dap c0t
1332  dap c1t
1333  add (a-t         / AC := &a[ij]
1334  dap c0a
1335  dap c1a
1336  add (p-a         / AC := &p[ij]
1337  dap c0p
```

`dzm ij` zeroes the voice index; `cc1` is re-entered (from `cc5`, just past this section) once per voice. `lac (177700` / `dac min` seeds `min` with `177700` — a large positive value (its sign bit is clear), so the first voice's actual time-remaining always compares as smaller. `dzm ceb` clears the end-bar counter (incremented later at `c9c` when a voice hits a bar line).

The body then computes `&b[ij]` with `law b` + `add ij`, and **walks it forward through each array** by repeatedly adding `4`. Each address is stamped into the operand of the cells that will use it via `dap`, which replaces only the low 12 bits (the address field) of the target word and **preserves the opcode/indirect bits**. After this block:

- `c0n` / `c1n` point at `n[ij]`
- `c0t` / `c1t` point at `t[ij]`
- `c0a` / `c1a` point at `a[ij]`
- `c0p` points at `p[ij]`

This is the core self-modify trick of the whole compiler: one straight-line body services any voice because its operands were just rewritten. (The `dap c0b`/`dap c1b` for the bar pointer are commented out in the source — the bar array is touched elsewhere.)

## `c0t`/`c0a` (`1340`-`1345`): is this voice still busy?

```
1340  lac .    c0t,  / time left in note (operand patched to t[ij])
1341  sza
1342  jmp cc2
1343  lac .    c0a,  / time left in artic
1344  sza
1345  jmp cc2
```

`c0t` loads `t[ij]`. `sza` skips if AC = 0; if the note time is **non-zero** the skip does not happen and we `jmp cc2` with that time as this voice's contribution to the minimum. If the note time is zero we fall through to `c0a` and do the same test on the articulation time `a[ij]`. Only when **both** note and articulation times are exhausted does the voice need a new note.

## `c0n` (`1346`-`1356`): fetch a note; tempo-change special case

```
1346  lac i .  c0n,  / get note  (indirect: AC := C(n[ij]))
1347  and (700000
1350  sas (700000     / skip if AC == 700000
1351  jmp c9c
1352  xct c0n         / re-fetch the note word
1353  and (77777
1354  jda tpo         / set tempo
1355  idx .    c1n,  / advance note ptr  n[ij] += 1
1356  jmp c0n         / loop back for the *next* note word
```

`lac i .` is an **indirect** load through the patched operand `n[ij]`, so it reads the note word the pointer points at. `and (700000` isolates the top three bits; `sas (700000` **skips if AC == `700000`** (sas = skip if AC equals C(Y)). So: if the top three bits are **not** all-ones, `sas` does not skip and the following `jmp c9c` runs (normal note / bar-line handling). If they **are** all-ones the word is an **inline tempo change**: `sas` skips the `jmp c9c`, then `xct c0n` re-executes the `lac i .` to reload the full word, `and (77777` keeps the low 15 bits (the tempo seed), and `jda tpo` (`1606`) installs the new tempo mid-piece. `c1n` then does `idx n[ij]` to advance past the tempo word and `jmp c0n` loops to read the actual following note — a tempo change consumes no time of its own.

## `c9c` (`1357`-`1367`): bar line vs. real note

```
1357  xct c0n  c9c,  / get note (re-execute lac i .)
1360  sas (600000     / skip if AC == 600000
1361  jmp cc3         / it's really a note
1362  idx ceb         / it's a bar line: bump end-bar count
1363  cla
1364  xct c1t         / 0 -> note time  t[ij]
1365  xct c1a         / 0 -> artic time a[ij]
1366  xct c0p         / 0 -> pitch      p[ij]
1367  jmp cc2         / contribute 0 as this voice's time
```

`xct c0n` re-runs the indirect load to get the full note word again. `sas (600000` **skips when AC == `600000`**. So a **non-match** (a real note) does not skip, falling straight into `jmp cc3`. A **match** (AC == `600000`) skips `jmp cc3` and runs the **bar-line** path: `idx ceb` counts it, then `cla` zeroes AC and `xct c1t`/`xct c1a`/`xct c0p` execute the three `dac` cells to write 0 into this voice's note time, artic time, and pitch. The voice then enters `cc2` contributing time 0. (Note the `xct` reuses `c1t`/`c1a`/`c0p` as `dac` instructions — the opcode was set when those cells were written in source, and only the address part was patched in `cc1`.)

## `cc3` (`1370`-`1414`): decode a real note word

A note word packs articulation, a triplet flag, pitch, and duration into 18 bits. The decoder peels fields off the **top** of the word by rotating it through IO. First, get the word into IO:

```
1370  rcl 9s   cc3,
1371  rcl 9s          / note now in IO
1372  xct c1n         / advance note ptr  n[ij] += 1
```

`rcl Ns` rotates the combined 36-bit AC:IO left; two `rcl 9s` rotate 18 places total, moving the note word (currently in AC) wholesale into IO with AC cleared of it. `xct c1n` runs `idx n[ij]` to consume this note word.

```
1373  cla
1374  rcl 2s          / first 2 articulation bits into AC low
1375  clf 6           / assume not a triplet
1376  spi             / skip if IO sign bit clear (>= 0)
1377  stf 6           / triplet flag (program flag 6 reused as temp)
1400  ril 1s          / discard the triplet bit just tested (IO-only rotate)
1401  rcl 2s          / next 2 articulation bits into AC
1402  add (cxt        / form an index into the articulation jump table cxt
1403  dap c0x         / patch c0x to xct the selected cxt entry
1404  cla
```

`cla` clears AC; `rcl 2s` rotates the top 2 articulation bits from IO into AC. `clf 6` clears program flag 6; `spi` skips if the IO sign bit is clear (≥ 0), so `stf 6` runs only when the next bit is set — that bit is the **triplet** marker, stashed temporarily in flag 6. (Flag 6 is normally the "compiled" status bit, octal `01`; here it is borrowed as scratch and cleared again at `1423`.) `ril 1s` rotates IO alone left 1 to drop the triplet bit, then a second `rcl 2s` shifts AC left 2 and brings the remaining 2 articulation bits in. AC is **not** cleared between the two `rcl 2s`, so the articulation index is a **4-bit code** (the two 2-bit groups concatenated). `add (cxt` turns that code into the absolute address of an entry in the `cxt` table (`cxt` = `1443`), and `dap c0x` patches the `xct .` at `c0x` (`1431`) to execute that entry. The 4-bit code spans the 16-entry `cxt` table (`1443`-`1462`).

```
1405  rcl 6s          / pitch (6 bits) into AC
1406  sad (1          / skip if AC != 1
1407  cla             / 1 is a rest too -> force pitch 0
1410  dac .    c0p,  / put pitch  p[ij] := AC
1411  sza
1412  jmp cca
1413  law (cla
1414  dap c0x         / rest: override artic handler with plain cla
```

`rcl 6s` extracts the 6-bit pitch. `sad (1` skips unless AC = 1 (sad = skip if AC ≠ C(Y)); a pitch of 1 is treated as a rest, so when AC = 1 the skip does not happen and `cla` zeroes it (rest = pitch 0). `c0p` stores the pitch into `p[ij]`. `sza` then tests it: a non-zero pitch (a real note) does not skip and `jmp cca` runs. A zero pitch is a rest, so `sza` skips the `jmp cca`, then `law (cla` and `dap c0x` retarget the articulation handler. Note that `law (cla` loads the **address of the literal-pool cell** holding the `cla` word (`(cla` = the literal `760200` at `02271`, so `law (cla` → AC := `2271`), **not** the address `1453` of the `cla`/legato slot inside `cxt`. `dap c0x` then patches `c0x` to `xct 2271`, so at run time `c0x` executes the `cla` instruction stored in that literal cell. The net effect is the same as legato (zero gap) — a rest is never split into note+gap — but the patched operand is `2271`, not the `cxt` table slot.

## `cca` (`1415`-`1430`): duration in 192nds

```
1415  cla      cca,
1416  rcl 7s          / duration in 64ths into AC
1417  dac tem         / save it
1420  sal 1s          / *2
1421  szf i 6         / skip if flag 6 SET (triplet)
1422  add tem         / non-triplet: *3 total (2*x + x)
1423  clf 6           / done with the triplet temp flag
1424  sal 3s          / *8: now 192nds * 8 (precise artic units)
1425  sma             / skip if AC < 0
1426  sza i           / skip if AC != 0
1427  jmp c0n         / zero duration -> go fetch another note
1430  dac tem         / save scaled duration
```

`rcl 7s` extracts the 7-bit duration field (in 64ths of a whole note) and `dac tem` saves it. `sal 1s` arithmetic-shifts AC left 1 (×2). The triplet logic converts to a common unit of **192nds**: a normal note is ×3, a triplet is ×2. `szf i 6` (skip if flag 6 **set**) skips the `add tem` for triplets; for non-triplets `add tem` makes the total `2×dur + dur = 3×dur`. `clf 6` releases the temp flag. `sal 3s` shifts left 3 (×8) to reach the internal unit "192nds × 8", giving headroom for the fractional articulation split.

The trailing `sma` / `sza i` are two **sequential** skips. `sma` skips if AC < 0; `sza i` (inverted `sza`) skips if AC ≠ 0. The net effect: a **strictly positive** duration skips the `jmp c0n` (via `sza i`) and proceeds to `dac tem`; a **zero** duration falls through to `jmp c0n` to fetch the next note (a zero-length note carries no time). A negative AC would land on `jmp c0n` via `sma`, but the scaled 7-bit duration can never be negative, so in practice `jmp c0n` is taken only for a zero duration.

## `c0x` (`1431`-`1442`): split into articulation + note time

```
1431  xct .    c0x,  / compute time of artic (executes a cxt entry on tem)
1432  spa             / skip if AC >= 0
1433  cla             / clamp negative artic to 0
1434  dac .    c1a,  / put artic time  a[ij] := AC
1435  cma             / AC := ~AC  (ones-complement negate)
1436  add tem         / AC := tem - artic  (note time = total - artic)
1437  spa
1440  cla             / clamp negative note time to 0
1441  dac .    c1t,  / put note time  t[ij] := AC
1442  jmp c0t         / re-test this voice (now it has fresh times)
```

`c0x` is the patched `xct .`: it executes the `cxt` entry chosen at `1403`/`1414`, with `tem` (the scaled duration) in AC (the prior `dac tem` left AC unchanged), producing the **articulation duration** — the silent gap at the end of the note (staccato = big gap, legato = none). `spa` skips if AC ≥ 0, so a negative result falls into `cla`, clamping it to 0; `c1a` stores the result as `a[ij]`. Then `cma` (ones-complement negate, i.e. `~AC` = −AC) plus `add tem` computes `~artic + tem` = `tem − artic` (end-around carry makes the one's-complement subtraction come out right) = the **sounding** time of the note. `spa`/`cla` clamps again and `c1t` stores it as `t[ij]`. `jmp c0t` loops back to `c0t` for the *same* voice — now that `t[ij]` and `a[ij]` are populated, the busy-test will succeed and route to `cc2` with a real time.

## `cxt` (`1443`-`1462`): the articulation jump table

`cxt` is indexed by the articulation code; `c0x` does `xct` on the selected entry, so each entry is a single instruction (or a `jda` call) that transforms `tem` (in AC) into the articulation/gap time.

| Addr | Op | Mark | Effect on AC (=duration) |
|---|---|---|---|
| `1443` | `sar 3s` | e | ÷8 — small gap |
| `1444` | `sar 2s` | q | ÷4 |
| `1445` | `sar 1s` | h | ÷2 |
| `1446` | `hlt` | — | unused code |
| `1447` | `jda c58` | s (staccato) | ×5/8 (see `c58`) |
| `1450`-`1452` | `hlt` | — | unused codes |
| `1453` | `cla` | l (legato) | 0 — no gap, note holds full length |
| `1454`-`1457` | `hlt` | — | unused codes (`1457` is the bar-line index) |
| `1460`-`1462` | `hlt` | — | unused codes |

`sar Ns` is an **arithmetic** shift right (sign-preserving) by N, i.e. divide-by-2ᴺ. So `e`/`q`/`h` make the gap 1/8, 1/4, 1/2 of the duration. `cla` (legato) yields a zero gap. The `hlt` cells are unused codes; reaching one would halt the machine (a defensive "should never happen"). A rest, whose handler was forced to the literal `cla` at `02271` in `cc3`, likewise produces no articulation split — the rest occupies its whole duration as note time.

## `c58` (`1463`-`1471`): the staccato ×5/8 helper

```
1463  0        c58,  / arg cell (AC stored here by jda)
1464  dap c5x         / stash return address into the exit jmp
1465  lac c58         / AC := the argument
1466  sar 2s          / AC := arg/4
1467  add c58         / AC := arg + arg/4   (= 5/4 * arg)
1470  sar 1s          / AC := (5/4*arg)/2   (= 5/8 * arg)
1471  jmp .    c5x,  / return
```

`c58` is reached via `jda c58` from the `s` entry: `jda` stores the incoming AC (the duration `tem`) into cell `c58` and resumes at `c58+1`, leaving the return linkage in AC. `dap c5x` saves that linkage into the exit `jmp` at `c5x`. Then it computes `arg + arg/4 = 5/4·arg` and halves it with `sar 1s` to `5/8·arg`. So the **staccato** gap is exactly 5/8 of the note's duration — a markedly detached note. (`c5x, jmp .` is the self-returning exit patched by `dap c5x`.)

## What this routine accomplishes

`cc`/`cc1` set up, then for each of the four voices either reuse the time already remaining (`c0t`/`c0a`) or pull and decode a fresh event from that voice's note stream. The decoder (`cc3`) unpacks the 18-bit note word — articulation code, triplet flag, 6-bit pitch, 7-bit duration — using `rcl`/`ril` rotations through IO, handling three special encodings inline: a **tempo change** (`700000` prefix → `jda tpo`), a **bar line** (exact word `600000` → zero the voice and count it in `ceb`), and a **rest** (pitch 0 or 1 → forced to the literal `cla` so it is never split). Duration is normalized to the internal "192nds × 8" unit with triplet correction, then split via the `cxt` jump table into a **note (sounding) time** `t[ij]` and an **articulation (gap) time** `a[ij]`, using a one's-complement `cma`/`add` to subtract. Every per-voice access is reached through `dap`-patched operands, so a single code body drives all four voices. Control then flows to `cc2` (`1472`), which folds each voice's time into the running `min` (a smaller time replaces `min`) to determine how long the current segment lasts.
