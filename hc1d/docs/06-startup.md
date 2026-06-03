# Startup and title (`u`, `ap`, `pf`, `pg`, `pfr`)

This section walks the program's cold-start path: how a run begins, how the **title line** of the source program is read off the tape and echoed back to the operator, and how `pfr` wipes the per-piece state clean before the first real scan. It is the entry that the front-panel `start u` button hits, so it is also the program's idle/halt point.

All addresses are octal. Core PDP-1 instruction semantics (`lac`/`dac`/`dzm`/`idx`/`jmp`/`jda`/`dap`/`sad`/`sas`/`law`/`cma`/etc.) are not re-taught here; see [`../../pdp1m13/docs/02-pdp1-primer.md`](../../pdp1m13/docs/02-pdp1-primer.md). The macro layer (`load`, `store`, `sett`, `call`, `goto`, `answer`/`exit`, the `tr*`/`test*` skip-and-jump tests, `putback`, `copy`, etc.) is defined in `hc1d.mac` lines 7-325; expansions are shown inline as each call appears. Remember the assembler folds case and is significant to six characters, so `testnl`, `putback`, etc. resolve to their six-letter macro names.

---

## `u` -- the idle / halt entry (line 406)

```
u,	halt
```

`halt` expands to `hlt`. This single word is both the program's logical "done / waiting" state and its named **start address**: the assembled `start u` directive (line 1604) makes `u` the run entry, so the machine begins by halting here, and the operator presses CONTINUE to begin a run. (The constant block confirms `11c=u` at line 1601, marking `u` as an externally meaningful entry point.)

The machine sits at `u` whenever there is nothing to do. Several finished/aborted paths converge here -- e.g. the table-overflow handler `s3x` (line 654) ends by reaching `goto u` at line 658, and `rrz`'s "measure has too many characters" handler funnels through `eha,` (line 657), which also reaches `goto u`. So pressing CONTINUE after a halt at `u` would re-execute the `hlt`; the run actually advances when CONTINUE resumes execution at the cell *after* `u`.

Control reaches `ap` by **falling through** the `hlt`, not by a jump: `ap` is the cell immediately after `u`, and `ap` is never the target of any `jmp`/`goto` in the source. On the PDP-1 `hlt` stops the machine in place; pressing CONTINUE resumes at the next instruction word, which is `ap`. That is exactly the "halt at `u`, press CONTINUE to run" idiom.

---

## `ap` -- per-run initialization (lines 407-411)

```
ap,	zero lmb
	call rpr
	sett bc, -1
	store nl
	sett mjp, -2
```

Line by line:

| Line | Macro call | Expansion | Effect |
|---|---|---|---|
| 407 | `zero lmb` | `dzm lmb` | Clear `lmb` (`/te: last measure starting index in not`, line 1531) -- no measure emitted yet. |
| 408 | `call rpr` | `jda rpr` | Prime the paper-tape reader (see `rpr` below). |
| 409 | `sett bc, -1` | `lac (-1; dac bc` | Set `bc` (`/te: bar count`, line 1501) to `-1` so the first bar makes it `0`. |
| 410 | `store nl` | `dac nl` | Store AC (still `-1` from line 409) into `nl` (`/s2: note location in not`, line 1521): the note-word array index starts at `-1` so the first stored note lands at `not+0`. |
| 411 | `sett mjp, -2` | `lac (-2; dac mjp` | Set `mjp` (`/er: last measure having error`, line 1567) to `-2`, an impossible measure number, so the first error never spuriously matches "same measure as last error." |

`bc` and `mjp` are seeded to negative sentinels; `nl` reuses the `-1` left in AC by the preceding `sett bc, -1` (a deliberate micro-optimization -- AC is not reloaded between lines 409 and 410). This is hc1d's first idiom worth flagging: **the author reads code top-to-bottom and trusts AC to carry forward.**

### `rpr` -- reader prime (lines 338-342, not emulator-verified)

```
rpr,	0
	rrb
	rpa-i
	dap .+1
	jmp
```

`rpr` is a leaf subroutine entered by `jda` (so cell `rpr` holds the deposited return-AC, and the body starts at `rpr+1`). It issues `rrb` (Read Reader Buffer) then `rpa-i` (Read Paper-tape Alphanumeric, indirect/clear variant) to clear and re-strobe the reader hardware, then patches its own exit (`dap .+1` followed by a bare `jmp`) to return. Concretely it leaves the reader armed so the next `rp`/`rch` read sees fresh data. The `rrb`/`rpa` IOTs are PDP-1 I/O instructions not present in the TS emulator (`src/pdp1/cpu.ts`), so this bit-level behavior is **inferred from standard PDP-1 reader semantics, not emulator-verified.**

---

## `pf` -- point at the title buffer (line 413)

```
pf,	sett ft, fb
```

`sett ft, fb` expands to `lac (fb; dac ft` -- i.e. it loads the **literal value** `fb` (the address of the `f` buffer base) into `ft`. (`sett A,B` loads the constant `B`, not `C(B)`; contrast `move`.) `ft` is the running "f top" write pointer (`/rch f top`, line 1557). It holds an **absolute address**, not a 0-based index: `fb` is the base of the source-character buffer (`fb=.` at line 1592), and the companion symbol `f=0` (line 1591) is a zero offset used by the `putback f,...` store below, so `f`-relative stores land at the absolute address sitting in `ft`. After `pf`, `ft` points at the first free cell of the title buffer.

`pf` runs once, before the read loop. The loop itself re-enters at `pg` (not `pf`) -- the loop tail `pg1` advances `ft` and jumps back to `pg`, so `ft` is initialized exactly once here.

---

## `pg` / `pg1` / `hap` -- read and buffer the title line (lines 415-429)

```
pg,	call rp		/read title

	store chr
	load ft
	putback f, chr
	testnl chr, (21, pg1
```

The loop reads one source character per pass and stows it in the `f` buffer:

- **`call rp`** (`jda rp`) reads one character from the tape into AC. `rp` (lines 344-375, below) is the heavyweight reader: it waits on the reader flag, validates the line, and discards ribbon-shift / spacer codes.
- **`store chr`** (`dac chr`) saves the character (`/s1, s2, pc, ri: character read`, line 1504).
- **`load ft`** (`lac ft`) puts the current write pointer into AC.
- **`putback f, chr`** is the indexed-store macro: it expands to `add (f; dap .+2; lac chr; dac` -- add the literal base `f` (= 0) to the pointer in AC, patch the address field of the `dac` two words ahead (the cell `dap .+2` reaches), reload the datum `chr`, then `dac` it. Net effect: the character is stored at the absolute address held in `ft`. This is a self-modifying store; the patched cell is the trailing `dac` of the expansion.
- **`testnl chr, (21, pg1`** expands to `lac chr; sas (21; jmp pg1` -- `sas (21` skips the `jmp` only when `chr = 21`, so this is "jump to `pg1` if `chr != 21`" (note the reload of `chr` into AC). Code `21` is the FIODEC **vertical bar `|`** (the measure/field separator; from the assignment's FIODEC table); here it terminates the title line. So: if this character is *not* the bar, loop on via `pg1`; otherwise fall through to `xp`.

```
pg1,	step1 ft
	trnl (fl, pg
hap,	goto rrz
```

- **`pg1, step1 ft`** (`idx ft`) advances the write pointer and leaves the new value in AC (the emulator's `idx` writes the incremented word back *and* loads it into AC -- see `cpu.ts`).
- **`trnl (fl, pg`** expands to `sas (fl; jmp pg` -- `sas (fl` skips the `jmp` only when AC `= fl`, so this jumps back to `pg` (read another char) **unless** `ft` has reached the literal `fl`. `fl` is the end of the `f` source-character buffer (`fl=fw+200`, line 1595; the note array `not` begins at `fl+1`, line 1596). So the title may fill the entire `f`-buffer up to `fl`.
- **`hap, goto rrz`** (`jmp rrz`): if the title overran to `fl` without a closing `|`, we fall here. `rrz` (line 660) types *"Measure has too many characters.  Rearrange tape."* and routes through `eha` to halt at `u`. (The message text says "measure," but on this path it is really the title that overflowed -- the routine is shared.)

### `rp` -- validated single-character read (lines 344-375, not emulator-verified)

`rp` (entered by `jda`) is the front end's careful character reader. It patches its return (`dap rtx`), then at `rt2` busy-waits on the reader: `cks` (Check Status) + `ril 1s` + `spi i` loop until the reader flag is set, then `rrb`/`rpa-i` fetch the line into IO and `dio t1` saves it. The remaining logic (`rcr 7s; spa; ...; law 77; and t1; sad (77 ...; sad (36 ...; sad (13 ...`) rejects blank/feed lines, the delete code `77`, the ribbon-shift code `36`, and code `13`, looping back to `rt2` to skip them so only genuine characters are returned. The `cks`/`rrb`/`rpa` IOTs are not in the TS emulator -- this control flow is **inferred from standard reader I/O, not emulator-verified.** The comparison constants (`77`, `36`, `13`) are taken from the source literally.

---

## `xp` -- arm the title-echo and replay it (lines 422-425)

When `pg` sees the closing `|` (code `21`), control falls into `xp`:

```
xp,	sett pfu, pfr
	sett emp, fb
	sett tc, -1
	goto erf
```

| Line | Macro call | Expansion | Effect |
|---|---|---|---|
| 422 | `sett pfu, pfr` | `lac (pfr; dac pfu` | Set the **return switch** `pfu` to the literal `pfr`. |
| 423 | `sett emp, fb` | `lac (fb; dac emp` | Point the error-printer's index `emp` (`/er: internal index on f`, line 1569) at the buffer base `fb`. |
| 424 | `sett tc, -1` | `lac (-1; dac tc` | Set `tc` (`/s1: terminator count within measure`, line 1503) to `-1`. |
| 425 | `goto erf` | `jmp erf` | Jump into the **error printer** at `erf` (line 582). |

This is the clever bit, and worth dwelling on. The title is not printed by a dedicated routine -- **it is replayed through the error-message typewriter path.** `erf`/`err` (lines 582-608) is normally used to echo a measure of source while flagging an error; here `xp` simply aims that machinery at the freshly-buffered title (`emp = fb`) and lets it type the whole line out on the Flexowriter as a confirmation of what was read. (The `tyo`-driven type-out is not in the TS emulator; **not emulator-verified.**)

The `pfu` cell is doing double duty (its comment at line 1547 reads: *"pf, key: identity check for title; switch: sh. or fl."*). It is a **return switch**: the printer reaches `ec, govia pfu` (line 614 = `jmp i pfu`), an indirect jump through `pfu`. By loading `pfu` with `pfr` here, `xp` arranges that **after the title finishes printing, control resumes at `pfr`** -- the per-run reset. So the title-echo and the reset are chained: read title -> print title via the error path -> `govia pfu` -> `pfr`.

The same return-switch is what makes the printer reusable. On the *error* path, `er`/`er1` set `pfu` to `ec3` first (at `erc, sett pfu, ec3`, line 568) so that the shared `govia pfu` continues into `ec3` (the bell/red-error tail) instead. The title path is just one customer of the convention; `pfu` is likewise reloaded at lines 1220, 1361 (`pum`), 1366, 1368, and 1398 to steer the shared printer/return to different destinations. (The "identity check for title" wording in the comment reflects that `pf`/`key` reuse `pfu` to distinguish a replayed title string from a key signature.)

---

## `pfr` -- the per-piece reset (lines 431-449)

`pfr` ("pf reset") establishes the default machine state for a **fresh piece of music**. It is reached via the `pfu` switch after the title echo (above). It is a straight run of clears and seeds, then a jump into the tone-table setup:

```
pfr,	zero 1u
	zero 3u
	sett irl, -1
	zero tll
	zero ft
	sett fi, 1
	store sid
	zero rob
	zero gi
	zero gis
	zero ao
	zero tc
	zero mm
	zero ss
	sett rb, 1
	store tbc
	sett tim, -1
	sett st, 26
	goto pum	/copies nt to kt to mt, goes to s1
```

| Line | Macro call | Expansion | Cell (and its source comment) | Reset to |
|---|---|---|---|---|
| 431 | `zero 1u` | `dzm 1u` | `1u` `/ps: 1*units` (1528) | 0 |
| 432 | `zero 3u` | `dzm 3u` | `3u` `/ps: 3*units` (1529) | 0 |
| 433 | `sett irl, -1` | `lac (-1; dac irl` | `irl` `/pvb: is rest location?` (1550) | -1 (no rest pending) |
| 434 | `zero tll` | `dzm tll` | `tll` `/pvd, pve: transposition semitone count` (1546) | 0 (no transposition) |
| 435 | `zero ft` | `dzm ft` | `ft` `/rch f top` (1557) | 0 |
| 436 | `sett fi, 1` | `lac (1; dac fi` | `fi` `/rch: f index` (1556) | 1 |
| 437 | `store sid` | `dac sid` | `sid` `/s2: si delayed` (1539) | 1 (reuses AC=1 from line 436) |
| 438 | `zero rob` | `dzm rob` | `rob` `/s2: time desired by grace notes` (1543) | 0 |
| 439 | `zero gi` | `dzm gi` | `gi` `/s2: grace note indicator` (1544) | 0 |
| 440 | `zero gis` | `dzm gis` | `gis` `/s2: gi saved` (1545) | 0 |
| 441 | `zero ao` | `dzm ao` | `ao` `/ps: arguments outstanding` (1500) | 0 |
| 442 | `zero tc` | `dzm tc` | `tc` `/s1: terminator count within measure` (1503) | 0 |
| 443 | `zero mm` | `dzm mm` | `mm` `/s2: units*3 used in measure to date` (1526) | 0 |
| 444 | `zero ss` | `dzm ss` | `ss` `/s2: running status of sle indicator` (1506) | 0 |
| 445 | `sett rb, 1` | `lac (1; dac rb` | `rb` `/red, blk: +1 blac, -1 red.` (1570) | +1 (black ribbon) |
| 446 | `store tbc` | `dac tbc` | `tbc` `/sbc: bar count within tape` (1502) | +1 (reuses AC=1 from line 445) |
| 447 | `sett tim, -1` | `lac (-1; dac tim` | `tim` `/s1: running time` (1498) | -1 |
| 448 | `sett st, 26` | `lac (26; dac st` | `st` `/s2: staff location (0=subbass)` (1509) | 26 (octal) -- treble default |
| 449 | `goto pum` | `jmp pum` | -- | enter tone-table setup |

Two AC-reuse shortcuts appear again: line 437 `store sid` reuses the `1` deposited by `sett fi, 1`, and line 446 `store tbc` reuses the `1` from `sett rb, 1`. So `sid` and `tbc` are both seeded to `+1` "for free."

What each group sets up:

- **Counters / running totals zeroed** (`1u`, `3u`, `ft`, `rob`, `gi`, `gis`, `ao`, `tc`, `mm`, `ss`, `tll`): the per-piece accumulators -- units, grace-note timing, sle/slur status, arguments-outstanding, measure subtotals -- all start empty.
- **Sentinels seeded:** `irl=-1` (no rest location yet), `tim=-1` (running time before the first note), `fi=1` and `sid=1` (index/flag primed to 1).
- **Ribbon state:** `rb=+1` per its comment (line 1570) means **black** ribbon, so a fresh run starts in black (diagnostics later switch to red and back). The `red`/`blk` routines at lines 630-641 flip `rb` and emit FIODEC ribbon-shift codes `35` (red) / `34` (black) via `type` (`tyo`) -- the `tyo` emission is **not emulator-verified**; the code values come from the assignment's FIODEC table.
- **Staff default `st=26`:** `st` is the staff location with `0 = subbass` (line 1509). `26` (octal) is the treble default: the treble clef handler `pv6` sets exactly this value (`sett st, 26	/treble`, line 1288), while `pv5`/`pv7`/`pv8` set the bass/tenor/alto values `12`/`16`/`20`. So a fresh run assumes treble register until a clef pseudo-command overrides it (handlers `pv5`-`pv8`; the matching name strings are `pn5`-`pn8` = `bass`/`treble`/`tenor`/`alto`).

### Falling into `pum` -- build the tone tables, then start scanning (lines 1361-1364)

```
pum,	sett pfu, s1
pun,	copy nt, kt, 44
pue,	copy kt, mt, 44
	govia pfu
```

- **`sett pfu, s1`** reloads the return-switch `pfu` with `s1`, so that *this* time `govia pfu` lands in **scan 1** rather than back in the title path. (Same `pfu` cell, new destination -- the switch is repurposed for each phase.)
- **`copy nt, kt, 44`** is the block-copy macro (`copy H,I,N`, lines 289-300): it copies `44`+1 (octal) words from the **canonical tone table** `nt` (the fixed chromatic scale, values at lines 1582-1587) into the **keyed tone table** `kt`.
- **`copy kt, mt, 44`** then copies `kt` into the **momentary tone table** `mt`.
- **`govia pfu`** (`jmp i pfu`) jumps through `pfu` to `s1`, beginning Scan 1.

This is the pitch model's reset: `nt` -> `kt` -> `mt`. With no key signature and no momentary accidental yet applied, all three tables start identical to the canonical scale; the key handler (`key`/`pna`) later re-derives `kt` from `nt`, and per-note accidentals derive `mt` from `kt`. (The musical role of `mt`/`kt`/`nt` is summarized in the memory map; the precise per-note transformation is **inferred** from these table names and the `ton`/`tne` pointer comments at lines 1517-1518, and is documented in the scan-2 section.)

---

## What this accomplishes

The startup path turns "operator pressed CONTINUE at `u`" into "the scanner is running on a blank-slate piece." `ap` seeds the cross-piece sentinels (`bc`, `nl`, `mjp`, `lmb`) and primes the reader via `rpr`. `pf`/`pg` read the human-readable **title** off the tape into the `f` buffer one validated character at a time (via `rp`), stopping at the `|` separator (code `21`) or the buffer end `fl`. `xp` then performs hc1d's neatest trick: it **echoes the title back to the operator by replaying it through the error-message typewriter path** (`emp=fb`, `goto erf`), and uses the `pfu` return-switch to chain that echo straight into `pfr`. `pfr` clears every per-piece accumulator, sets the musically meaningful defaults (treble staff `st=26`, black ribbon `rb=1`, running time `tim=-1`), and falls into `pum`, which rebuilds the three tone tables (`nt`->`kt`->`mt`) and jumps to `s1`.

Forward pointer: control now enters **Scan 1 (`s1`)**, the first pass that lexes a measure of source characters into numeric fields and terminators -- documented in the scan-1 section.
