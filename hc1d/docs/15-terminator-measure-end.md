# Terminator and measure commit (`te`, `teb`)

This section annotates the two routines at `hc1d.mac` lines 1193-1221 that fire whenever scan-1 (`s1`) reaches a **terminator** -- the space, bar, or end-of-measure character that closes off one chord/note's worth of input. `te` decides whether the token just finished a measure; if so it performs measure-end housekeeping (timing check, grace-note flush) and emits the bar-line note word, then falls through to `teb`, which **commits** the finished measure as a bar entry and resets state for the next one.

This is where the running stream of compiled note words (the `not` array) is partitioned into bars, and where `nl` (the note-array write index), `lmb` (the start of the current measure within `not`), and `bc`/`tbc` (bar counters) get advanced. The bar-line word `600000` and the `not`/`bar` arrays produced here are exactly the structures consumed by *PDP-1 Music 13*; see [`../../pdp1m13/docs/05-data-formats.md`](../../pdp1m13/docs/05-data-formats.md) for the reading end of the contract.

Core instruction semantics (`lac`/`dac`/`idx`/`sub`/`sad`/`jmp`/`jda`/`dap`, ones-complement, the skip group) are not re-taught here -- see [`../../pdp1m13/docs/02-pdp1-primer.md`](../../pdp1m13/docs/02-pdp1-primer.md). The macro layer (`load`, `store`, `call`, `goto`, `test0`, `tles`, `grow`, `putback`, `complaint`, `sett`, `zero`, `move`) is expanded inline below; for the full macro glossary and the `answer`/`exit` calling convention see the primer/macros appendix.

> Reminder: this MACRO assembler is significant to six characters and folds case to upper, so `complaint` in the body resolves to the defined macro `compla` and `complement` resolves to `comple`. The musical interpretation of some fields below is inferred from the variable comments in the source and is flagged as such.

## `te` -- the terminator handler (1193-1210)

`s1` (scan-1) calls into `te` once it has tokenized a complete field and hit a terminator. The terminator character itself has already been classified upstream and recorded in `trm` (`/s1: terminator`, line 1499) and counted into `tc` (`/s1: terminator count within measure`, line 1503). `te` first asks: was this terminator the end of the measure, or just the separator between notes within it?

```
te,	test0 trm, s1
```

`test0 trm, s1` expands to `lac trm; sza i; jmp s1`: load the terminator code, and **if `trm` = 0, jump to `s1`** (`sza i` skips on non-zero, so the `jmp` is taken when AC is zero). A zero `trm` evidently means "more to come in this measure" -- an ordinary intra-measure separator -- so control loops straight back to scan-1 to read the next note. Everything below `te` runs only when `trm` is non-zero, i.e. the terminator actually closed a measure (the bar character). (The exact terminator-code encoding is inferred from the branch sense and the `trm` comment.)

### Measure-end housekeeping (1194-1196)

```
	sett sid, 1
	zero tc
	testel mm, 3u, te1
```

- `sett sid, 1` -> `lac (1; dac sid`: store the literal `1` into `sid` (`/s2: si delayed`, line 1539). This sets the delayed slur/legato indicator so the *first* note of the next measure is treated correctly with respect to ties across the bar line. (`sid` is the cross-bar carrier of `si`, the slur state; its precise musical effect is inferred from the variable comment.)
- `zero tc` -> `dzm tc`: clear the per-measure terminator count, starting the next measure's tally fresh.
- `testel mm, 3u, te1` -> `lac mm; sad 3u; jmp te1`: load `mm` (`/s2: units*3 used in measure to date`, line 1526) and **jump to `te1` if `mm` equals `3u`** (`sad` skips on AC != C(3u), so the `jmp` fires only when they are equal). `3u` is `/ps: 3*units` (line 1529) -- three times the declared units-per-beat, i.e. the *correct* total duration of one full measure expressed in the program's internal "units*3" timebase. If the measure's accumulated time `mm` exactly matches the expected `3u`, the measure is the right length and we skip the complaint logic, going to `te1`.

The `units*3` scaling is why both `mm` and the target are kept pre-multiplied by 3 (`3u`): it lets a measure be divided into thirds (triplets) without fractions (inferred from the `mm`/`3u` comments). The comparison is exact -- the measure must come out to precisely the declared length.

### Too-long / too-short complaints (1197-1202)

If `mm != 3u`, the measure is the wrong length and we determine which way:

```
	zero tjp
	load mm
	tles 3u, te9
	complaint flexo mtl
	goto te1
te9,	complaint flexo mts
```

- `zero tjp` -> `dzm tjp`: clear `tjp` (`/er: termin. count in meas. for last error`, line 1568), part of the error-reporter's bookkeeping so the diagnostic about to be issued is attributed to this measure.
- `load mm` -> `lac mm`: AC := the measure's actual duration.
- `tles 3u, te9` -> `sub 3u; spa; jmp te9`: compute `AC - C(3u)` and **jump to `te9` if the result is negative** (`spa` skips on positive-or-zero, so the `jmp` fires when `mm < 3u`). So if the measure is *shorter* than expected we branch to `te9`; otherwise we fall through, meaning `mm > 3u` -- the measure is *too long*.
- `complaint flexo mtl` (the too-long path) -> `lac (<flexo string mtl>; jda er`: load the literal 3-character FIODEC error code `mtl` ("measure too long", inferred from the mnemonic) and call the non-fatal error/complaint routine `er`. The `flexo` pseudo-op assembles the three FIODEC characters of `mtl` packed into one word. *(The `flexo` pseudo-op and the `er`/Flexowriter typeout it drives are not emulator-verified; the emulator does not implement `tyo`.)* This is a **complaint**, not a fatal `error` -- the program reports the timing mistake on the Flexowriter and keeps compiling.
- `goto te1` -> `jmp te1`: after complaining, rejoin the common path.
- `te9,  complaint flexo mts` -> `lac (<flexo mts>; jda er`: the too-short path issues the "measure too short" complaint (`mts`, inferred), then falls through to `te1`.

Either complaint records a diagnostic but does not abort: `hc1d` continues so the operator can find *all* the length errors in one pass rather than one at a time. `mtl`/`mts` are the 3-FIODEC-char names typed in the diagnostic.

### Grace-note time flush (1204-1209)

```
te1,	test0 rob, te0
	complaint flexo itg
	zero rob
	zero gi
	zero gis
	move nls, nl
```

`rob` is the time "desired by grace notes" (`/s2: time desired by grace notes`, line 1543) -- time that grace notes attempted to *rob* from a following principal note. At measure end any such robbery that was never resolved is evidently an error: there is no following note left in the measure to take the time from.

- `test0 rob, te0` -> `lac rob; sza i; jmp te0`: load `rob`, and **if `rob` = 0 jump to `te0`** -- nothing pending, skip the flush. The block below runs only when `rob != 0` (grace-note time left dangling at the bar).
- `complaint flexo itg` -> `lac (<flexo itg>; jda er`: issue the `itg` complaint (inferred "incomplete trailing grace[-note]" -- the same `itg` code is also raised at line 932 in scan-2's grace handling, confirming it is the grace-note-time diagnostic). *(Flexowriter typeout via `er` -- not emulator-verified.)*
- `zero rob`, `zero gi`, `zero gis` -> three `dzm`s clearing the grace-note state: the requested time `rob`, the grace-note indicator `gi` (`/s2: grace note indicator`, line 1544), and its saved copy `gis` (`/s2: gi saved`, line 1545). The grace machinery is forcibly reset so it cannot leak into the next measure.
- `move nls, nl` -> `lac nls; dac nl`: restore the **saved** note index `nls` (`/s2: nl saved`, line 1542) into the live note pointer `nl` (`/s2: note location in not`, line 1521). When grace notes ran, scan-2 had stashed a backed-up note index in `nls` (e.g. `grow nl, -1, nls` at line 1126 stores `nl-1` into `nls`, and the parallel `move nls, nl` restore appears in scan-2's grace logic at line 930). Aborting the unresolved robbery winds `nl` back to that saved position, so the partially-built grace material is discarded and the note-array pointer is consistent before the bar line is written. (The grace-note bookkeeping semantics are inferred from the variable comments.)

### Emit the bar-line word (1210-1211)

```
te0,	load (600000
	call cn
```

- `load (600000` -> `lac (600000`: load the literal constant `600000` (octal) into AC. This is the **bar-line note word**.
- `call cn` -> `jda cn`: call `cn`, the note-emitter, passing `600000` as the argument in AC.

`cn` (lines 1109-1113) is the routine that appends one word to the `not` array:

```
cn,	answer cnx
	store nf
	call snl
	putback not, nf
cnx,	exit cn
```

`answer cnx` is the subroutine prologue (`0 / dap cnx / lac .-2`): the literal `0` cell holds the AC the `jda` deposited (here `600000`), `dap cnx` patches the exit `jmp` at `cnx` to the caller's return, and `lac .-2` reloads `600000` into AC. Then `store nf` (`dac nf`) stashes the word in `nf` (`/cn: note forming`, line 1516); `call snl` (`jda snl`) advances the note index and overflow-checks it (`snl` at 466-471 does `step1 nl` -> `idx nl`, then `addi bc` -> `add bc`, `tgrec all, s3x` -- if `nl + bc` exceeds the table capacity `all` it jumps to `s3x`, "Table overflow.  Subdivide source program.", lines 654-656; `snl` then returns `nl` in AC via `load nl`); finally `putback not, nf` -> `add (not; dap .+2; lac nf; dac` -- an indexed store that writes `nf` (the `600000`) into `not[AC]`, i.e. into the note array at the freshly-advanced `nl` offset. `exit cn` returns.

So `600000` lands in the `not` stream exactly like any real note word, marking the measure boundary inside the per-voice note list. The reading end recognizes a whole word equal to `600000` as the bar line (see [`../../pdp1m13/docs/05-data-formats.md`](../../pdp1m13/docs/05-data-formats.md): "`whole word == 600000` ... **bar line**", and `c9c`'s `sas (600000)` test). Because the bar line goes through the same `cn`/`snl` path as notes, it consumes a slot and is overflow-checked just like a note.

Control falls through from `te0` directly into `teb`.

## `teb` -- commit the measure as a bar entry (1213-1221)

```
teb,	call sbc
	putback bar, lmb
	grow nl, 1, lmb
	zero mm
	call rcw
	store mbh
	zero ao
	sett pfu, s1
	goto pue
```

Now that the bar-line word has been written, `teb` records *where this measure started* in the `bar` index array, advances the bookkeeping so the next measure starts after it, and resets the per-measure accumulators.

- `call sbc` -> `jda sbc`: call `sbc` (lines 456-463), "step bar count":

  ```
  sbc,	answer sbx
  	step1 tbc
  	step1 bc
  	addi nl
  	tgrec all, s3x
  	load bc
  	complement
  sbx,	exit sbc
  ```

  `step1 tbc` -> `idx tbc` and `step1 bc` -> `idx bc` increment the two bar counters: `tbc` (`/sbc: bar count within tape`, line 1502) and `bc` (`/te: bar count`, line 1501). After `step1 bc` AC holds the incremented `bc`; `addi nl` -> `add nl` adds the note index, leaving `AC = bc + nl`, and `tgrec all, s3x` -> `sub (all; sma+sza-skp; jmp s3x` checks whether `bc + nl` has exceeded the table capacity `all` (`all=bar-not-1`, line 1597 -- the space between the `not` array and the `bar` array growing down from `7750`); if so it jumps to the overflow handler `s3x`. Then `load bc; complement` -> `lac bc; cma` leaves AC = the ones-complement (negation, `-bc`) of the new bar count, which `sbx, exit sbc` returns. The negated `bc` is the value `teb` will use as an index into the `bar` array.

- `putback bar, lmb` -> `add (bar; dap .+2; lac lmb; dac`: an indexed store. AC holds `-bc` from `sbc`; `add (bar` forms `bar - bc` (the `bar` array grows *downward* from `7750`, so successive bars sit at `bar-1`, `bar-2`, ... -- negating `bc` and adding `bar` indexes into that descending table). `dap .+2` patches the `dac` two words ahead with that computed address, `lac lmb` loads `lmb` (`/te: last measure starting index in not`, line 1531), and the patched `dac` stores it. **Result: `bar[-bc] := lmb`** -- the `bar` array now holds, at this measure's slot, the index in `not` where this measure's note words begin. This is the per-measure pointer the player uses to find each bar's notes (see [`../../pdp1m13/docs/05-data-formats.md`](../../pdp1m13/docs/05-data-formats.md), where `600000` also appears as the "end-of-voice bar pointer").

- `grow nl, 1, lmb` -> `lac nl; add (1; dac lmb`: compute `nl + 1` and store it in `lmb`. This sets the *next* measure's starting index to one past the current note pointer -- i.e. immediately after the bar-line word we just emitted. So `lmb` now marks where the upcoming measure's notes will go, and the cycle (`putback bar, lmb` ... `grow nl, 1, lmb`) keeps `bar[]` and `lmb` in step with `nl` as measures accumulate.

- `zero mm` -> `dzm mm`: clear the measure's accumulated time. The next measure starts its `mm`-vs-`3u` length tally from zero.

- `call rcw` -> `jda rcw`: call `rcw` (lines 473-475), which is `answer rwx / load fi / rwx, exit rcw` -- it simply returns `fi`, the current source-character index (`/rch: f index`, line 1556), in AC. (`rcw` reports where in the input buffer `f` the scan currently is.)

- `store mbh` -> `dac mbh`: save that source position into `mbh` (`/rch: pointer to beginning of measure in f`, line 1530). This records where in the *source text* the new measure begins, so the error reporter (`er`, which copies `mbh` into `emp`, e.g. line 580) can quote the offending measure's characters when it prints a diagnostic.

- `zero ao` -> `dzm ao`: clear `ao` (`/ps: arguments outstanding`, line 1500), the pseudo-command argument counter, so no stale pending-argument state carries into the next line.

- `sett pfu, s1` -> `lac (s1; dac pfu`: store the *address* `s1` into `pfu` (`/pf, key: identity check for title; switch`, line 1547). `pfu` is used as a `govia`-style return switch; loading `s1` into it arms the dispatch so that after the upcoming `pue` step, control returns to scan-1 to read the next measure. (Compare `pue,  copy kt, mt, 44 / govia pfu` at 1363-1364: `pue` ends with `jmp i pfu`, an indirect jump through `pfu` -- so by setting `pfu = s1`, `teb` makes `pue` fall back into `s1`.)

- `goto pue` -> `jmp pue`: jump to `pue` (line 1363), which begins `copy kt, mt, 44` -- a block copy of the keyed-tone table `kt` over the momentary-tone table `mt`. This appears to **reset the momentary accidental table to the prevailing key signature** at the bar line: any accidental that applied only "for the rest of this measure" is wiped, so the next measure starts from the key-signature tones (musical effect inferred from the `kt`/`mt` comments). `pue` then does `govia pfu` (`jmp i pfu`), returning to `s1` to scan the next measure.

## What this accomplishes

`te`/`teb` are the boundary machinery that turns a flat stream of compiled note words into a *bar-indexed* score. On a terminator, `te` distinguishes intra-measure separators (loop back to `s1`) from a true measure end; at measure end it validates the measure's duration against `3u` (issuing the non-fatal `mtl`/`mts` complaints on mismatch), flushes any dangling grace-note time (the `itg` complaint, resetting `rob`/`gi`/`gis` and rewinding `nl` from `nls`), and emits the `600000` bar-line word into the `not` array via `cn`. `teb` then commits the finished measure: `sbc` bumps the bar counters (`bc`, `tbc`) and overflow-checks the tables, `putback bar, lmb` records this measure's starting `not` index into the descending `bar` pointer array, `grow nl, 1, lmb` advances `lmb` to the next measure's start, the per-measure accumulators (`mm`, `ao`) are cleared, `mbh` captures the source-text position of the new measure for diagnostics, the momentary-tone table is reset to the key signature at `pue` (`copy kt, mt`), and `pfu` is armed so control returns to `s1`. The `not` array (note words plus `600000` bar lines) and the `bar` array (per-measure start indices) built here are precisely the per-voice structures *PDP-1 Music 13* reads back -- see [`../../pdp1m13/docs/05-data-formats.md`](../../pdp1m13/docs/05-data-formats.md).

Next: the pseudo-command dispatcher `pc`/`pcd` and its handlers `pv1`..`pvh` (lines 1224-1253), which process the `s`, `l`, `e`, `end`, `bass`, `key`, `tempo`, ... directives that configure the compile.
