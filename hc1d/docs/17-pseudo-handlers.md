# Pseudo handlers: articulation, staff, units, tempo, rest, transpose, copy (`ps`, `pv*`)

This section walks the **pseudo-command handlers** at `hc1d.mac` lines **1273-1479**. These are the routines that the dispatcher `pc` (lines 1224-1250) jumps to once it has recognized a spelled-out keyword on the source tape — `s`, `l`, `e`, `bass`, `treble`, `tenor`, `alto`, `units`, `rest`, `up`, `down`, `copy`, `h`, `q`, `tempo` (and `end`/`key`, documented elsewhere). Each handler mutates a small piece of compiler state and then rejoins the main scan; some need a *numeric argument* that has not yet been read, so they arm the deferred-return switch `ps`/`psw` and let the token engine `te`/Scan-1 come back to them after the next number.

This file assumes you have read the [pdp1m13 PDP-1 primer](../../pdp1m13/docs/02-pdp1-primer.md) for core instruction semantics (`lac`/`dac`/`add`/`sub`/`idx`/`sad`/`sas`/`jmp`/`law`/`cma`/`ral`/`sar`, the skip group, ones-complement, and the `Ns` shift notation) and the [hc1d primer/macro appendix](02-hc1d-primer.md) for the macro layer. Every body line below is a macro call; the expansions used here are reproduced from the `define` block at lines 7-325. Per the assembler's 6-character/upper-fold rule, source spellings like `complement`, `dispatch`, `diswith`, `complaint` resolve to the macros `comple`, `dispat`, `diswit`, `compla` — treated as the same token throughout.

## How a pseudo is invoked: `pc` → `pcd` → `pv*`

Before the handlers, recall how control gets here (lines 1224-1250). `pc` walks each candidate keyword string `pn1..pnh` (the FIODEC name tables at lines 1255-1271, e.g. `pn5`=`bass`, `pnh`=`tempo`) character-by-character against the source, indexing them through the `pnm` pointer table. `tht` (line 1532, `/pc: index of pseudo under investigation`) starts at 0 and is bumped to 1 on the first candidate (`step1 tht`, line 1226), so it is a **1-based** index. When a keyword matches, control reaches:

```
pc9,	load tht          / lac tht — 1-based index of the matched pseudo
	dispatch pcd-1    / computed jump through (AC + pcd-1)
```

`dispatch pcd-1` (the macro `dispat`, 6-char fold) expands to `add (pcd-1 ; dap .+1 ; jmp i` — it forms the address `pcd-1+tht`, patches the following `jmp i`, and jumps indirectly through that entry of the jump table `pcd` (lines 1248-1250). With `tht`=1 the target is `pcd` itself. `pcd` is parallel to the name table `pnm`:

| index | name (`pn*`) | spelling | handler (`pv*`) |
|---|---|---|---|
| 1 | pn1 | `s` | pv1 |
| 2 | pn2 | `l` | pv2 |
| 3 | pn3 | `e` | pv3 |
| 4 | pn4 | `end` | pv4 (the `end` punch) |
| 5 | pn5 | `bass` | pv5 |
| 6 | pn6 | `treble` | pv6 |
| 7 | pn7 | `tenor` | pv7 |
| 8 | pn8 | `alto` | pv8 |
| 9 | pn9 | `units` | pv9 |
| 10 | pna | `key` | pva (the `key` handler) |
| 11 | pnb | `rest` | pvb |
| 12 | pnc | `copy` | pvc |
| 13 | pnd | `up` | pvd |
| 14 | pne | `down` | pve |
| 15 | pnf | `h` | pvf |
| 16 | png | `q` | pvg |
| 17 | pnh | `tempo` | pvh |

The FIODEC name strings decode cleanly against the `s2z`/`pn*` comments (e.g. `pn5,` = `62 61 22 22` = `b a s s`; `pnh,` = `23 65 44 47 46` = `t e m p o`). The *musical meanings* (`s`/`l`/`e`/`h`/`q` as articulation classes; the staff names; `units`/`tempo` etc.) are inferred from the keyword strings and the state each handler sets; treat them as *evidently* rather than certain where noted.

## `ps`/`psw` — the deferred-argument return switch (line 1273)

```
ps,	govia psw
```

`govia psw` expands to `jmp i psw` — an **indirect jump through the cell `psw`**. `ps` is therefore a one-instruction trampoline: it transfers control to whatever address currently lives in `psw` (the variable at line 1537, `/ps: switch for return with argument`).

This is the mechanism that lets a pseudo collect a numeric argument it could not have at dispatch time. Several handlers (`units`, `tempo`, `rest`, `up`, `down`, `copy`) need a *number* that follows the keyword on the tape — but `pc` fired the handler the moment it matched the keyword, before that number was scanned. So those handlers do three things and bail back to the scanner:

1. `sett ao, N` — set **`ao` = "arguments outstanding"** (line 1500) to how many numbers they still need (1 or 2).
2. `sett psw, <resume-label>` — arm `psw` with the address to resume at.
3. `goto te` — return to the token engine.

The token engine `te`/Scan-1 then reads the next numeric field into `n1` and, on its terminator, executes (Scan-1, line 745):

```
	test1 ao, ps   / lac ao; sza; jmp ps
```

i.e. *if `ao` ≠ 0, jump to `ps`*, which `jmp i psw` lands on the armed resume label with the freshly-parsed `n1` available. The handler's resume code consumes `n1`, then falls into `psr` (line 1306):

```
psr,	zero ao        / dzm ao  — no more arguments outstanding
	goto te        / jmp te  — back to the token engine
```

`psr` is the **common exit** for handlers: clear `ao` and rejoin `te`. Handlers that need *no* argument (the articulation and staff setters) simply do their work and `goto psr` directly; `ao` is already 0, so they pass straight through. This `psw`+`ao` pairing is hc1d's idiom for a state machine that spans two tokens — the keyword token and the number token after it.

## Articulation setters: `pv1`/`pv2`/`pv3`/`pvf`/`pvg` (lines 1275-1284)

```
pv1,	sett ss, 200000   /s
	goto psr
pv2,	sett ss, 400000   /l
	goto psr
pv3,	zero ss           /e
	goto psr
pvf,	sett ss, 40000    /h
	goto psr
pvg,	sett ss, 20000    /q
	goto psr
```

`sett ss, V` expands to `lac (V ; dac ss` — load the **literal** `V` and store it into `ss`. `zero ss` is `dzm ss`. Each of these sets the **running `sle`-status indicator `ss`** (line 1506, `/s2: running status of sle indicator`) to a distinct high-bit pattern, then exits via `psr`. None reads a number (`ao` stays 0).

These five keywords (`s`, `l`, `e`, `h`, `q`) select an articulation / `sle` mode for subsequent notes; the value in `ss` is later copied per-note into `sv` (line 1507, `/s2: value of ss for particular note`) and folded into the note's compiled word in Scan-2. The exact musical mapping is inferred from the keyword letters and the bit positions:

| handler | keyword | `ss` value (octal) |
|---|---|---|
| pv1 | `s` | 200000 |
| pv2 | `l` | 400000 |
| pv3 | `e` | 0 |
| pvf | `h` | 40000 |
| pvg | `q` | 20000 |

`s`/`l`/`e` appear to select articulation classes (`e` clears the field, evidently a default/"even" mode); `h`/`q` set lower-order bits, plausibly additional duration/articulation qualifiers. All of this is inferred — the in-source comments name only the letters, not their musical semantics. The handler's only certain contract is "deposit this constant in `ss`."

## Staff (clef/voice) setters: `pv5`/`pv6`/`pv7`/`pv8` (lines 1286-1293)

```
pv5,	sett st, 12   /bass
	goto psr
pv6,	sett st, 26   /treble
	goto psr
pv7,	sett st, 16   /tenor	-- from 20, 070418
	goto psr
pv8,	sett st, 20   /alto  -- from 22, 070418
	goto psr
```

Same `sett`/`goto psr` shape: each loads a literal into **`st` = "staff location (0=subbass)"** (line 1509, `/s2: staff location (0=subbass)`) and exits. `st` is the base offset that fixes where on the staff the following notes sit; it feeds the staff→tone pointer arithmetic in Scan-2 (it indexes the momentary-tone table `mt`, inferred from the `ton` comment at line 1517, `/s2, key: tone pointer to staff (mt)`). The values are octal staff positions:

| handler | keyword | `st` (octal) |
|---|---|---|
| pv5 | `bass` | 12 |
| pv6 | `treble` | 26 |
| pv7 | `tenor` | 16 |
| pv8 | `alto` | 20 |

The `-- from 20, 070418` / `-- from 22, 070418` comments record that the tenor and alto base offsets were *revised during the 2006 retype* (the `070418` evidently a date stamp) from earlier values of 20 and 22 to the present 16 and 20. Document as written; do not "correct."

## `pv9` — `units` (lines 1295-1304): set the duration unit

```
pv9,	sett ao, 1    /units
	sett psw, p9a
	goto te
```

This is the canonical deferred-argument pattern: `units` needs the number that follows it, so set `ao`=1, arm `psw`=`p9a`, and return to `te`. When the next number lands in `n1` and Scan-1 sees `ao`≠0, it routes through `ps` → `jmp i psw` → `p9a`:

```
p9a,	load n1       / lac n1
	store 1u      / dac 1u           — 1u := n1
	x2to1         / ral 1s           — AC := 2*n1 (rotate-left 1)
	addi n1       / add n1           — AC := 3*n1
	x2to1         / ral 1s           — AC := 6*n1  (second rotate; see note)
	store 3u      / dac 3u
	sett irl, -1  / lac (-1; dac irl
	... falls into psr
```

`p9a` records the user's unit value `n1` into **`1u` = "1\*units"** (line 1528) and a scaled copy into **`3u` = "3\*units"** (line 1529, `/ps: 3*units`).

> **Literal vs. documented arithmetic.** Traced byte-for-byte, the two `x2to1` rotates give `((2·n1)+n1)·2 = 6·n1`, **not** `3·n1`, yet the variable comment names `3u` as `3*units`. `3u` is the value a full measure of accumulated time must equal: at measure end `te` tests `testel mm, 3u, te1` (line 1196), and per-note `tu` is built as `3·nft` (`s32`, lines 1136-1140) and summed into `mm` (`step mm, tu`, line 1141) — so the running counters `mm`/`tu` are tracked in units-times-three. The discrepancy between the literal `6·n1` and the documented `3*units` is a real feature of the source as transcribed; it is quoted here as-is and **not** reconciled or "fixed." Read the comment as the author's *intent*; read the instructions as what executes.

Finally `sett irl, -1` resets **`irl` = "is rest location?"** (line 1550, `/pvb: is rest location?`) to −1 (no pending rest note). `irl` is also initialized to −1 at program reset (`pfr`, line 433). Falling into `psr` clears `ao` and returns to `te`.

**State effect:** `units N` establishes the rhythmic granularity for everything that follows — one "unit" is the atomic note-duration tick, and `1u`/`3u` are the precomputed multiples the note former uses to accumulate measure time (`mm`) and per-note time (`tu`).

## `pvh` — `tempo` (lines 1344-1350): emit the tempo control word

```
pvh,	sett ao, 1    /tempo
	sett psw, pha
	goto te
```

Again deferred: `tempo` takes one number. After the number is read into `n1`, `ps` resumes at `pha`:

```
pha,	load n1            / lac n1
	addi (700000       / add (700000  — add the constant 700000 (set the top 3 bits)
	call cn            / jda cn       — compile this word into the note array
	goto psr
```

`addi (700000` expands to `add (700000` — an arithmetic add (not a bitwise OR) of the constant `700000`. Since a valid tempo number occupies only the low bits, the effect is to set the top three octal digits to `7-0-0` while the tempo value rides in the low 15 bits. `call cn` (`jda cn`) is the **compile-note-word** subroutine (lines 1109-1113):

```
cn,	answer cnx
	store nf            / dac nf  — argument (the tempo word) into "note forming"
	call snl            / jda snl — bump nl, AC := next free note slot
	putback not, nf     / store nf into not[snl-result]
cnx,	exit cn
```

So the `700000`-tagged value is written into the next slot of the note-word array `not`. The **player** *PDP-1 Music 13* recognizes this tag when it later reads the tape: a note word whose **top three bits are `700000`** is decoded as a **tempo directive**, and the player masks it to its **low 15 bits** (`& 77777`) for the tempo value — see [pdp1m13 data formats](../../pdp1m13/docs/05-data-formats.md), which documents `(700000)` as the tempo tag and `(77777)` as the tempo-value mask on the consumer side. This is exactly the producer side of that agreement: hc1d punches the control word; the player consumes it. `pha` exits via `psr`.

## `pvb` — `rest` (lines 1401-1425): emit a rest note and bar pointers

`rest` is the most involved handler. It needs one number (how many measures of rest), and it must also place a rest marker in the note array `not` plus one pointer per measure in the bar-pointer array `bar`.

```
pvb,	sett ao, 1        /rest
	test0 mm, pb2     / lac mm; sza i; jmp pb2   — if mm=0, go pb2
	error flexo ilr   / "illegal rest" diagnostic
	goto i1a
```

`test0 mm, pb2` jumps to `pb2` *iff* `mm` (units-times-three used in this measure so far, line 1526) is zero. A `rest` is only legal at a measure boundary (`mm`=0); otherwise it is an error.

The line `error flexo ilr` combines two things. `flexo` is a **text/character pseudo-op** (one of the original-assembler facilities the modern macro/macro1 re-assembly lacks — *not emulator-verified*): it assembles the following name `ilr` into a packed three-character FIODEC literal. That literal is then the `U` argument to the `error` macro, which expands to `lac (U ; jda er1` — load the packed error name and call the error subroutine `er1` (line 564). `er1`/the error subsystem ultimately type the diagnostic on the Flexowriter via `tyo` etc. (*not emulator-verified*; the emulator does not implement these I/O IOTs). `goto i1a` then rejoins the shared "swallow the pending argument and return" landing at line 1450.

```
pb2,	sett psw, pb1
	goto te
pb1,	test0 n1, psr     / if the rest count n1 = 0, just exit (psr)
	testp irl, pb3    / lac irl; sma; jmp pb3 — if irl >= 0, skip ahead to pb3
```

After the number arrives, `pb1` runs. `test0 n1, psr` bails out for a zero-length rest. `testp irl, pb3` (`lac irl ; sma ; jmp pb3`) jumps to `pb3` when **`irl` ≥ 0**, i.e. when a rest-location note word has *already* been laid down (irl holds its index). With `irl` = −1 (negative), `sma` does *not* skip and control falls through to build the rest note:

```
	load 1u           / lac 1u   — one unit of duration
	addi (100         / add (100 — add a low-field constant (inferred: a duration/flag field)
	x2to1             / ral 1s
	store t1          / dac t1   — t1 = the rest note's time word
	call snl          / jda snl  — allocate next note slot, AC := its index
	store irl         / dac irl  — remember WHERE the rest note lives
	putback not, t1   / not[<slot>] := t1   (the rest's duration word)
	call snl          / jda snl  — allocate one more slot
	putback not, (600000  / not[<slot>] := 600000  (bar-line word)
	grow nl, 1, lmb   / lac nl; add (1; dac lmb — lmb := nl+1 (last-measure start)
```

`snl` (lines 466-471) bumps `nl` and returns the new `nl` (a positive index) in AC. So a fresh rest writes a two-word note into `not`: a duration word (`(1u + 100) · 2`, the `100` being an inferred low-order field) and a `600000` word. Per [pdp1m13 data formats](../../pdp1m13/docs/05-data-formats.md), the full word `600000` is the **bar-line word** in the note stream (the same constant `te0`/`cn` append at each measure boundary, line 1210), *not* an end-of-note sentinel. The handler saves the rest-note slot index in `irl` and updates **`lmb` = "last measure starting index in not"** (line 1531). `putback U,Q` = `add (U ; dap .+2 ; lac Q ; dac` — an indexed store of `Q` into `not[AC]`.

```
pb3,	call sbc          / jda sbc — allocate a BAR-pointer slot, AC := complemented bar index
	putback bar, irl  / bar[<slot>] := irl  — point this bar at the rest note
	istepa n1, 1      / law i 1; add n1; dac n1 — n1 := n1 - 1 (decrement rest count)
	trnz pb3          / sza; jmp pb3 — repeat if n1 != 0
	goto psr
```

`pb3` loops `n1` times. Each pass calls `sbc` (the bar-location allocator, lines 456-463: bumps `tbc`/`bc`, checks capacity `all`, and returns `bc` **complemented**, since bars are stored at negative offsets below `bar`=7750) and `putback bar, irl` stores the rest-note index `irl` into the new bar slot — i.e. **every measure of the rest reuses the same rest note word**, pointing each bar at it. `istepa n1, 1` subtracts 1 from `n1` (`istepa J,I` = `law i I ; add J ; dac J`; `law i 1` loads −1, so this adds −1), and `trnz pb3` (`sza ; jmp pb3`) repeats while nonzero. When `n1` reaches 0, `goto psr` returns.

**State effect:** `rest N` lays one rest note in `not` and pushes `N` bar-pointers (all aimed at that one note) into `bar`, advancing the bar count. The single-invocation loop materializes exactly one note word, shared across all `N` bars — the tape's bar table just repeats the pointer.

## `pvd` / `pve` — `up` / `down` (lines 1427-1441): transposition

```
pvd,	sett ao, 1        /up
	sett psw, pd1
	goto te
pd1,	move n1, tll      / lac n1; dac tll
	goto psr
```

`up N` is the simplest deferred handler: read the number, `move n1, tll` (`lac n1 ; dac tll`) stores it into **`tll` = "transposition semitone count"** (line 1546, `/pvd, pve: transposition semitone count`), and exit. A positive `tll` shifts subsequent notes up by `n1` semitones (inferred from the variable's ownership comment).

```
pve,	sett ao, 1        /down
	sett psw,pe1
	goto te
pe1,	load n1           / lac n1
	trze pe2          / sza i; jmp pe2 — if n1 = 0, skip the complement
	complement        / cma — negate (ones-complement) the count
pe2,	store tll         / dac tll
	goto psr
```

`down N` is identical except it **negates** the count first. `load n1` then `trze pe2` (`sza i ; jmp pe2`) jumps past the negate when `n1`=0 (avoiding turning 0 into the −0 = `777777` ones-complement representation). For nonzero `n1`, `complement` (= `cma`) forms `-n1`, and `store tll` records the downward transposition. So `up`/`down` write `+N`/`−N` into the same `tll` cell; Scan-2 evidently adds `tll` into the tone-table index when forming each note.

## `pvc` — `copy` (lines 1444-1479): replicate prior bars

`copy` duplicates a range of previously-compiled bars. It takes **two** numbers (`ao`=2): the first bar to copy from (`cbh`, "copy begins here") and the last. It uses staged resume labels because it must read two arguments in sequence.

```
pvc,	sett ao, 2        /copy
	test0 mm, cow     / if mm = 0 (at a bar boundary), go cow
	error flexo ilc   / "illegal copy" diagnostic (mid-measure)
i2a,	sett psw, i1a
	goto te
```

Like `rest`, `copy` is only legal when `mm`=0. If not, `error flexo ilc` types the illegal-copy diagnostic (the `flexo ilc` text-pseudo + `error` → `er1` path; *not emulator-verified*), then `i2a` arms `psw`=`i1a` to *swallow* the forthcoming argument harmlessly and returns to `te`.

```
i1a,
co1,	sett psw, psr
	goto te
```

`i1a`/`co1` (same address; `i1a` is a bare label) is the **argument-eater**: after an error it just consumes the next token (`psw`=`psr`) and returns, so the bad `copy`'s numbers don't pollute the scan. (This is the same `i1a` that `rest`'s error path jumps to.)

The legal path:

```
cow,	sett psw, co2
	goto te
co2,	move n1, cbh      / lac n1; dac cbh — cbh = "copy begins here" (first bar)
	trze co3          / sza i; jmp co3 — if n1 = 0, error (can't copy bar 0)
	tles tbc, co4     / sub tbc; spa; jmp co4 — if cbh < tbc (exists on tape), go co4
co3,	error flexo blc   / out-of-range bar diagnostic
	goto i1a
co4,	sett psw, co5     / arm second argument
	goto te
```

`cow` reads the first number into `cbh`. `trze co3` (`sza i ; jmp co3`) rejects `copy 0`. `tles tbc, co4` (`sub tbc ; spa ; jmp co4`) jumps to `co4` when `cbh < tbc` (the bar exists — `tbc` is the tape bar count, line 1502, `/sbc: bar count within tape`); otherwise `co3` errors via `blc` and eats the rest with `goto i1a`. `co4` then arms `psw`=`co5` and waits for the *second* number.

```
co5,	load n1           / lac n1 — the LAST bar to copy
	tgrel cbh, co7    / sub cbh; sma; jmp co7 — if n1 >= cbh, go co7 (valid range)
co6,	error flexo brc   / bad-range diagnostic (end < start)
	goto psr
```

`co5` validates that the ending bar `n1` is `>= cbh` (the start). `tgrel cbh, co7` = `sub cbh ; sma ; jmp co7` (jump if `n1 - cbh >= 0`). If the range is inverted, `error flexo brc` and exit; otherwise proceed to the copy loop.

```
co7,	istepa cbh, 1     / law i 1; add cbh; dac cbh — cbh := cbh - 1 (pre-adjust)
co8,	load cbh          / lac cbh
	complement        / cma — negate cbh (bar indices are addressed complemented; cf. sbc)
	lookup bar        / add (bar; dap .+1; lac — fetch bar[-cbh], the source note pointer
	store t4          / dac t4
	call sbc          / jda sbc — allocate a fresh bar slot at the current position
	putback bar, t4   / bar[<new slot>] := t4 — copy the source pointer in
	step1 cbh         / idx cbh — advance to next source bar
	tles n1, co8      / sub n1; spa; jmp co8 — loop while cbh < n1
	goto psr
```

The copy loop walks source bars. For each, `load cbh ; complement` forms the *complemented* index (bar slots are addressed in ones-complement here, matching how `sbc` returns negated indices at lines 461-463), `lookup bar` (`add (bar ; dap .+1 ; lac`) fetches that bar's stored note-pointer into `t4`, `call sbc` carves a new bar slot at the write head, and `putback bar, t4` deposits the copied pointer there. `step1 cbh` (`idx cbh`) advances, and `tles n1, co8` (`sub n1 ; spa ; jmp co8`) repeats while `cbh < n1`. The leading `istepa cbh, 1` at `co7` pre-adjusts the start before the top-of-loop `load cbh`; the exact inclusive/exclusive endpoints of the copied range follow from this pre-adjust and the `step1`-then-test ordering (the precise span is inferred from the loop structure). Exit via `psr`.

**State effect:** `copy A B` appends, after the current music, fresh bar-pointer entries that *reference the same note words* as the requested prior bars — so a repeated phrase is encoded once in `not` and re-pointed in `bar`, exactly mirroring how the player will replay those note words again when it walks the bar table.

## Cross-references: `end` (`pv4`) and `key` (`pva`)

Two table entries are intentionally **not** detailed here:

- **`pv4` / `end`** (lines 1309-1341) is the tape-punching finale: it terminates the song, punches the note array `not`, the bar array `bar`, blank feed, and per-section checksums via `ppp`/`feed`, then `goto u` (line 1341) to halt at `u`. This is the **output-tape writer** and is documented in its own section; it is the direct producer of the format the player consumes per [pdp1m13 data formats](../../pdp1m13/docs/05-data-formats.md). (The `ppp`/`fee` punch primitives at lines 377-401 hit the `ppb`/`ppa` IOTs — *not emulator-verified*.)
- **`pva` / `key`** (lines 1352-1399, plus `pum`/`pun`/`pue`/`pus`/`puf`/`puh`/`put`/`pug`/`puw`/`pw1`/`pw2`) handles the key signature: it rebuilds the **keyed tone table `kt`** from the canonical table `nt` and the **momentary table `mt`** from `kt` (the `copy nt,kt,44` / `copy kt,mt,44` block-copies at `pun`/`pue`, lines 1362-1363), then applies sharps/flats per the key. The three-table pitch model (`nt`→`kt`→`mt`) is covered in its own section; the same `pum` entry is reached at program start (`goto pum`, line 449) to initialize all three tables to the canonical scale.

## What this accomplishes

These handlers are the **vocabulary of the transcription DSL**: between the lexer (Scan-1) that reads notes and the note-former (Scan-2) that compiles them, the `pv*` routines let the score author change *modes* mid-stream — articulation (`s`/`l`/`e`/`h`/`q` → `ss`), clef/voice (`bass`/`treble`/`tenor`/`alto` → `st`), rhythmic granularity (`units` → `1u`/`3u`), tempo (`tempo` → a `700000`-tagged control word in `not`), explicit rests (`rest` → a shared rest note + one bar pointer per measure), chromatic transposition (`up`/`down` → `tll`), and phrase repetition (`copy` → re-pointed bar entries). The unifying machinery is the `ps`/`psw`/`ao` deferred-return switch: a keyword arms `psw` and declares how many numbers it still needs in `ao`, and the token engine `te`/Scan-1 feeds the following numeric token(s) back into the handler via the `ps` trampoline. All handlers converge on `psr` (clear `ao`, return to `te`).

**Next:** the `key`/`pva` section details the `nt`/`kt`/`mt` tone-table pitch model these handlers index, and the `end`/`pv4` section covers the final punch that emits the intermediate tape.
