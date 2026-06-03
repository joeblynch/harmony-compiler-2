# Scan 2: forming and emitting a note (`s2r`-`s33`, `cn`)

This section walks the **note-forming core** of Scan 2: the code that runs once a complete musical token has been scanned and classified, turns it into one (or several) packed *note words*, and appends each to the `not` buffer that *PDP-1 Music 13* later reads. It is the part of `hc1d` most worth reading carefully, because it (a) implements the **grace-note "robbery"** time-stealing logic, (b) computes the **pitch** through the three-table tone model, (c) expands **embellishments** (trills, mordents, grace figures) into multiple emitted notes, and (d) finally assembles the 18-bit note word whose bit layout is the contract with the player.

Source: `hc1d/hc1d.mac` lines 906-1144 (`cn` itself is at 1109-1113, `s39` at 1116). All numbers are octal. This file assumes you have read the [PDP-1 primer](../../pdp1m13/docs/02-pdp1-primer.md) (for `lac`/`dac`/`add`/`sub`/`idx`/`sad`/`sas`/`spa`/`sma`/`sza`/`ral`/`sar`/`dap`/`jmp i`/ones-complement) and the [data-format notes](../../pdp1m13/docs/05-data-formats.md) for the *consumer* side of the note word. Almost every body line is a **macro call**; expansions follow the macro table established in the primer/appendix (and the assembler's 6-character, case-folding name rule — so e.g. `complaint` resolves to the macro `compla`, `complement` to `comple`, `dispatch` to `dispat`).

Recall too that `sad` skips when AC **differs** from the operand and `sas` skips when they are the **same** (the opposite of what the names suggest) — that is why `trel`/`testel` (built on `sad`) jump on *equality* and `trnl`/`testnl` (built on `sas`) jump on *inequality*.

Throughout, recall the calling convention: `call S` = `jda S` (deposit AC into cell `S`, run at `S+1`); a routine opens with `answer foox` (the `0` cell that receives the arg, `dap foox`, `lac .-2` to reload the arg), and returns via `foox, exit foo` (a `jmp` patched by `dap`). `lookup V` / `dispat U` / `putback U,Q` are the self-modifying indexed-table idioms; watch the `.+1`/`.+2` cells they patch.

---

## Context: what is true on entry to `s2r`

`s2r` (line 906) is one of the dispatch targets in table `s2y` (lines 1170-1173): Scan 2's character loop (`s20`/`s21`, lines 842-849) reads characters, looks them up in `s2z`, and `dispatch s2y`es each token to a handler. `s2r` is the handler reached for a measure-terminator token, after the per-note variables have been accumulated by the other handlers. By the time control reaches `s2r` the relevant state is:

- `tim` = the note's nominal time (set up by Scan 1; the running time), `fu`/`fc` = fraction-used / fraction-status (a dotted-note half-time).
- `sr` = staff relocation count (octave shifts of ±14 from `s2e`/`s2f`, lines 862-865), `st` = staff location (`0` = subbass).
- `n1` = the note's scale-degree number on the staff (first number from Scan 1).
- `aci` = accidental indicator (`0` none, `1` sharp/flat present, `-1` natural), `acc` = the **signed** accidental count (`+1` per sharp via `s2h`'s `idx acc`, `-1` per flat via `s2i`'s `istepa`).
- `3i` = triplet indicator (`0` or `100000`), `ete` = embellishment terminal (`0` none, else an embellishment code 1..6), `si` = "this note contains an `sle` (slur/articulation) marker" (`0`/`1`), `lt` = left indicator (`0`/num, `1`/r, `2`/cm).
- `cm`/`g`/`rob`/`gi`/`gis`/`nls`/`ccc` = the comma / grace-note / robbery bookkeeping (see below).

The variable comments at lines 1506-1546 are the authority for these meanings; the *musical* reading of several is inferred and flagged as such.

---

## `s2r` / `s51` / `s52` (906-912) — finalize the `sle` status `ss`/`sv`

```
s2r,	test0 si, s51
	trel (1, s52
	complaint flexo tms
s51,	move ss, sv
s52,	test1 cm, s69
	move 3i, ccc
```

- `test0 si, s51` → `lac si; sza i; jmp s51`: if `si == 0` (no `sle` marker in this token) jump to `s51`.
- `trel (1, s52` → `sad (1; jmp s52`: AC still holds `si`; `sad (1` skips the `jmp` when AC differs from 1, so the jump to `s52` is taken when `si == 1` (the legal "one `sle`" case).
- Falling through means `si > 1`: `complaint flexo tms` → `lac (flexo tms; jda er` types the non-fatal complaint **`tms`** ("too many `sle`s", inferred from the code) and continues. (`er` and the `flexo`-packed 3-char code are I/O / Flexowriter mechanisms — not emulator-verified.)
- `s51, move ss, sv` → `lac ss; dac sv`: when there is **no** explicit per-note `sle`, copy the **running default** status `ss` into the per-note value `sv`. `ss` ("running status of sle indicator", line 1506) is set by the *pseudo-command* handlers `pv1`/`pv2`/`pv3`/`pvf`/`pvg` (the `s`/`l`/`e`/`h`/`q` pseudos, lines 1275-1283). The **per-token** articulation markers `s2b`/`s2c`/`2sr`/`2ss`/`s2d` (lines 851-859) instead set `sv` *directly* and set `si = 1` (via `s2a`). So if `si` was set, `sv` was already loaded by those token handlers and `s51` is skipped; otherwise the carried-over default `ss` becomes `sv`.
- `s52, test1 cm, s69` → `lac cm; sza; jmp s69`: if the comma count `cm != 0` jump to `s69` (the comma path — a comma means "continue the previous note's triplet grouping"). Otherwise (`cm == 0`) fall through:
- `move 3i, ccc` → `lac 3i; dac ccc`: record this (non-comma) note's triplet status into `ccc` ("triplet status of last non-comma note", line 1541), so a later comma note can inherit it at `s69`. Control then falls into `2s3`.

`sv` now holds the four-bit articulation/`sle` status that will become the high bits of the note word.

---

## Grace-note "robbery": `2s3` / `2s1` / `2s2` / `22s` / `s69` / `s2t` / `2s4` (914-948)

This is the risk region. A **grace note** (flagged by `g != 0`) has no duration of its own; it *steals* time (`rob`) from the note it precedes. `nft` is "note formed, time part" (line 1522) and `nfp` is `nft` "preserved from robbery" (line 1523).

### `2s3` (914-926) — establish `nft`/`nfp`, then settle the robbery

```
2s3,	load tim
	addi fu
	store nft
	store nfp
	test1 g, 2s1
	zero gi
	test0 rob, s2s
	load nft
	subt rob
	store nft
	tlesc 2, 2s2
22s,	zero rob
	goto s2s
```

- `load tim; addi fu` → `lac tim; add fu`: the note's time is the running time **plus** the fraction-used (`fu`) — i.e. base duration plus any dotted-note extension.
- `store nft; store nfp` → `dac nft; dac nfp`: stash it in both `nft` (the working time, which robbery may reduce) and `nfp` (the pristine copy, used to restore on the comma path at `s69`).
- `test1 g, 2s1` → `lac g; sza; jmp 2s1`: if `g != 0` this **is itself** a grace note → jump to `2s1` (accumulate robbery). Otherwise this is a normal note that may be a *victim* of preceding grace notes:
- `zero gi` → `dzm gi`: clear the grace indicator (we are a normal note).
- `test0 rob, s2s` → `lac rob; sza i; jmp s2s`: if no time is owed to grace notes (`rob == 0`), skip straight to `s2s` (tone formation).
- `load nft; subt rob; store nft` → `lac nft; sub rob; dac nft`: subtract the stolen time `rob` from this note's `nft` (the grace notes will be given that time).
- `tlesc 2, 2s2` → `sub (2; spa; jmp 2s2`: AC still holds the reduced `nft`; subtract 2, and `spa` skips when the result is non-negative — so jump to `2s2` when the *remaining* `nft` is **< 2**. This guards against grace notes stealing so much that the host note has essentially no time left.
- `22s, zero rob; goto s2s`: the normal exit — robbery satisfied, clear `rob`, go form the tone.

### `2s2` (928-933) — insufficient time for grace ("itg")

```
2s2,	load nft
	tgrel rob, 22s
	move nls, nl
	zero rob
	complaint flexo itg
	goto 2s3
```

Reached when the (already reduced) `nft` came out too small. `load nft; tgrel rob, 22s` → `lac nft; sub rob; sma; jmp 22s`: if the reduced `nft >= rob` after all, the situation is recoverable — go clear `rob` at `22s`. Otherwise the grace notes genuinely don't fit:

- `move nls, nl` → `lac nls; dac nl`: restore the saved note location `nls` into `nl`, **rewinding** the `not` buffer pointer so the grace notes already appended get discarded.
- `zero rob` → `dzm rob`.
- `complaint flexo itg` → `lac (flexo itg; jda er`: types the **`itg`** complaint ("insufficient time for grace", per the assignment brief and the matching use at `te`). (Not emulator-verified.)
- `goto 2s3`: re-enter `2s3` to reform this note now with `rob == 0` (so it keeps its full time). This is the recovery path.

### `2s1` (935-937) — this token *is* a grace note: accrue robbery

```
2s1,	step rob, tim
	sett gi, 1
	goto s2s
```

- `step rob, tim` → `lac rob; add tim; dac rob`: add this grace note's nominal `tim` onto the running robbery total `rob`. (Note it adds `tim`, the grace's *nominal* time.)
- `sett gi, 1` → `lac (1; dac gi`: set the grace indicator `gi = 1` so the emission tail (`s70`) knows to fold this into the host note's accounting and **not** advance measure-units for it.
- `goto s2s`: go form the tone for the grace note itself (it still produces note words; the robbery just controls timing).

### `s69` (939-947) — the comma path (inherit triplet, restore `nft`)

```
s69,	move nfp, nft
	test1 3i, s2t
	move ccc, 3i
s2t,	test0 fu, 2s4
	complaint flexo tic
2s4,	test1 g, 2s1
	zero gi
```

Reached from `s52` when `cm != 0` (a comma). A comma continues the previous note within a triplet/tuplet group.

- `move nfp, nft` → `lac nfp; dac nft`: restore the **pristine** time (robbery is not re-subtracted on a comma continuation here).
- `test1 3i, s2t` → `lac 3i; sza; jmp s2t`: if this comma note already has its own triplet flag set, keep it (`s2t`). Otherwise:
- `move ccc, 3i` → `lac ccc; dac 3i`: inherit the triplet status of the **last non-comma note** (`ccc`, set at `s52`). This is how a comma-separated continuation stays inside the same triplet grouping.
- `s2t, test0 fu, 2s4` → `lac fu; sza i; jmp 2s4`: if the fraction-used `fu == 0` (no dotted fraction pending), proceed to `2s4`. Otherwise:
- `complaint flexo tic` → types the **`tic`** complaint (inferred "time/comma" inconsistency — a fraction across a comma; not emulator-verified).
- `2s4, test1 g, 2s1` / `zero gi`: same grace-vs-normal fork as in `2s3` (a comma can itself be a grace), then clear `gi` on the normal path. Note this rejoins the **shared** tone-formation entry `s2s`.

---

## Tone formation: `s2s` / `s2u` / `s2w` / `sv2` / `s2v` (949-980)

This block decides **rest vs. tone**, computes the staff-to-table pointer `ton`, and applies any accidental.

### `s2s` (949-956) — rest detection, and the `sle`-only "air" case

```
s2s,	test0 lt, s2u
	tgrec 1, sv2
	load aci
	addi ete
	trze s2w
	complaint flex air
s2w,	sett tne, 200
	goto s70
```

- `test0 lt, s2u` → `lac lt; sza i; jmp s2u`: if the **left indicator** `lt == 0` (a normal pitched note begins with a number), jump to `s2u` to form a real tone. A non-zero `lt` means the token began with `r` (rest) or a comma (`lt`: `0`/num, `1`/r, `2`/cm — line 1497), so this is a **rest**:
- `tgrec 1, sv2` → `sub (1; sma+sza-skp; jmp sv2`: `tgrec C` jumps if AC **>** literal C; here it jumps to `sv2` if `lt > 1` (i.e. `lt == 2`, a comma-rest), where `sv2` re-checks the `sle` status. Falling through means `lt == 1` (an explicit rest `r`).
- `load aci; addi ete` → `lac aci; add ete`: a rest must carry neither an accidental nor an embellishment. `trze s2w` → `sza i; jmp s2w`: if `aci + ete == 0` (clean rest), jump to `s2w`. Otherwise:
- `complaint flex air` — **`flex` is a likely retype slip for `flexo`** (the original pseudo-op); types the **`air`** complaint (inferred: an accidental/embellishment illegally applied to a rest — "air" = a rest position has no pitch; not emulator-verified).
- `s2w, sett tne, 200` → `lac (200; dac tne`: a rest is encoded by setting the pitch pointer `tne` to the sentinel **`200`** (octal). `goto s70`: jump straight to emission — a rest is never split into note + release and **does not** pass through the `x2to7` at `s31` (see the cross-check at the end for how `200` lands as pitch index `1`).

### `s2u` (958-965) — compute `ton` (staff → table pointer) with range guard

```
s2u,	load n1
	addi sr
	addi st
	store ton
	trmi s40
	tlesc 44, s2v
s40,	complaint flexo uat
	goto s2w
```

- `load n1; addi sr; addi st` → `lac n1; add sr; add st`: the staff position is the note's number `n1` plus the staff relocation `sr` (octave shifts) plus the staff location `st` (base, `0` = subbass). The sum is the index into the **momentary tone table `mt`**.
- `store ton` → `dac ton`: `ton` is the "tone pointer to staff (`mt`); not changing" (line 1517). It indexes the per-staff `mt` table.
- `trmi s40` → `spa; jmp s40`: if `ton < 0`, jump to the **`uat`** ("unavailable tone" / out of staff range, inferred) complaint at `s40`.
- `tlesc 44, s2v` → `sub (44; spa; jmp s2v`: if `ton < 44` (octal — `kt = mt+44`, line 1579, so the `mt` table occupies positions `mt`..`mt+43`, i.e. 44 octal entries) jump to `s2v` to proceed. Otherwise it falls into `s40`.
- `s40, complaint flexo uat; goto s2w`: out-of-range → complain (not emulator-verified) and emit a rest (`s2w` sets `tne=200`). So an out-of-range pitch degrades gracefully to a rest rather than indexing outside the tables.

### `sv2` (967) and `s2v` (968-980) — `sle`-on-comma-rest, then apply the accidental

```
sv2,	testel tne, (200, s70
s2v,	test0 aci, s31
	load ton
	lookup nt
	addi acc
	store t1
	tlesc 2, s41
	load t1
	tlesc 77, s42
s41,	compalint flexo aor
	goto s2w
s42,	load ton
	putback mt, t1
```

- `sv2, testel tne, (200, s70` → `lac tne; sad (200; jmp s70`: the comma-rest re-entry. `sad (200` skips the `jmp` when `tne` differs from `200`, so if `tne` already equals the rest sentinel `200` the jump to `s70` (emit) is taken. Otherwise fall into `s2v`.
- `s2v, test0 aci, s31` → `lac aci; sza i; jmp s31`: if there is **no accidental** (`aci == 0`), skip the accidental machinery and go to `s31` (use the table as-is). Otherwise apply the accidental, which *modifies the `mt` table entry in place*:
- `load ton; lookup nt` → `lac ton; add (nt; dap .+1; lac .`: `lookup nt` is the indexed load — AC := `ton`, patch the next `lac` with address `nt + ton`, then load `nt[ton]`. `nt` is the **canonical tone table** (the chromatic semitone values at lines 1582-1587: `2 4 6 7 11 13 …`). So this fetches the canonical semitone for this staff position.
- `addi acc` → `add acc`: add the **signed** accidental `acc` (positive semitones for sharps, negative for flats — set together with `aci` by `s2h`/`s2i`/`s2j` at lines 868-883; `aci` only flags presence vs. natural). `store t1` → `dac t1`: the adjusted semitone value.
- `tlesc 2, s41` → `sub (2; spa; jmp s41`: range-check low end — jump to `s41` (error) if `t1 < 2`.
- `load t1; tlesc 77, s42` → `lac t1; sub (77; spa; jmp s42`: jump to `s42` (commit) if `t1 < 77`. (So the valid adjusted semitone is `2 <= t1 < 77`.)
- `s41, compalint flexo aor` — **`compalint` is a likely retype slip for `complaint`** (the symbol dump shows it undefined; the intended macro is `compla`). Types the **`aor`** complaint ("accidental out of range", inferred; not emulator-verified) and emits a rest via `goto s2w`.
- `s42, load ton; putback mt, t1` → `lac ton; add (mt; dap .+2; lac t1; dac .`: `putback U,Q` is the indexed **store** — compute address `mt + ton`, then store `t1` there. This writes the accidental-adjusted semitone back into the **momentary tone table `mt`** at the staff position, so the accidental persists for the rest of the measure (the "momentary" semantics — `mt` is reset elsewhere). Then falls into `s31`.

The three-table model is now visible: **`nt`** (canonical scale, never modified) → **`kt`** (after key signature, set by the `key` pseudo) → **`mt`** (after a momentary accidental, written here). `s2v` reads `nt`, adjusts, and writes `mt`; the actual pitch comes out of `mt` next.

---

## `s31` / `s30` (981-994) — read the tone from `mt`, position it, branch on embellishment

```
s31,	load ton
	lookup mt
	addi tll
	store tne
	tlesc 2, s40
	load tne
	tgrec 76, s40
	load tne
	x2to7
	store tne
s30,	test0 ete, s70
	test0 3i, s71
s72,	complaint flexo etr
	goto s70
```

- `load ton; lookup mt` → `lac ton; add (mt; dap .+1; lac .`: fetch the (possibly accidental-adjusted) semitone from `mt[ton]`. This is the **actual pitch** for the note's principal tone.
- `addi tll` → `add tll`: add the transposition `tll` (transposition semitone count, set by the `pvd`/`pve` "up"/"down" pseudos, line 1546). Whole-piece transposition is applied here, at the last moment.
- `store tne` → `dac tne`: `tne` is the "tone pointer to table; letter changing" (line 1518) — the pitch index, *before* it is shifted into note-word position.
- `tlesc 2, s40` → `sub (2; spa; jmp s40`: low-range guard, jump to `s40` (out-of-range → rest) if `tne < 2`.
- `load tne; tgrec 76, s40` → `lac tne; sub (76; sma+sza-skp; jmp s40`: high-range guard — `tgrec` jumps if AC **>** 76, so a pitch index **> 76** goes to `s40`. So the valid pitch index is `2..76` octal; `77` and up are rejected.
- `load tne; x2to7; store tne` → `lac tne; ral 7s; dac tne`: rotate the pitch left by 7 (`ral 7s`) into its note-word position. A 6-bit value shifted left 7 lands in **bits 5-10** (MSB-indexed) — exactly the player's pitch field (e.g. pitch `77` → `017600`). `tne` now holds the pitch *pre-positioned* for the final OR.
- `s30, test0 ete, s70` → `lac ete; sza i; jmp s70`: if there is **no embellishment** (`ete == 0`), jump straight to the emission tail `s70` — a plain note. Otherwise this note has an embellishment (1..6):
- `test0 3i, s71` → `lac 3i; sza i; jmp s71`: an embellishment is only legal on a **non-triplet** note here; if `3i == 0` jump to `s71` to expand it. If `3i != 0` (triplet + embellishment):
- `s72, complaint flexo etr; goto s70` → types the **`etr`** complaint ("embellishment + triplet", inferred conflict; not emulator-verified) and emits the plain note. (Note the flexo code `etr` is unrelated to the `etr` *label* at line 606 in the error routine — it is just the FIODEC packing of the three characters.)

---

## Embellishment expansion: `s71` / `s79` / `s73` and the `ebl`/`ebd`/`ebe` tables (995-1107)

A non-triplet embellished note expands into **several** emitted note words (the trill/mordent/turn figure). This is driven by three parallel tables indexed by `ete-1` (lines 1176-1188):

| Index | `ete` value | `ebl` (time budget) | `ebd` dispatch | `ebe` dispatch | `ebl` source letter |
|---|---|---|---|---|---|
| 0 | 1 | `6` | `s81` | `s32` | `d` |
| 1 | 2 | `4` | `s82` | `s32` | `m` |
| 2 | 3 | `10` | `s83` | `s93` | `n` |
| 3 | 4 | `10` | `s84` | `s32` | `u` |
| 4 | 5 | `4` | `s85` | `s95` | `w` |
| 5 | 6 | `5` | `s86` | `s32` | `p` |

(The single-letter names `d m n u w p` come directly from the `ebl` source comments at lines 1176-1181. The musical meaning of each figure — trill, mordent, turn, grace — is **inferred** and is *not* asserted here.)

### `s71` (995-1005) — compute the sustained time `ex`

```
s71,	load ete
	lookup ebl-1
	subt nft
	trze s99
	complement
s99,	store ex
	trpl s73
s79,	complaint flexo eit
	goto s70
```

- `load ete; lookup ebl-1` → `lac ete; add (ebl-1; dap .+1; lac .`: load `ebl[ete-1]` (the `-1` because `ete` is 1-based). This is the embellishment's intrinsic time budget (`6`, `4`, `10`, `10`, `4`, `5`).
- `subt nft` → `sub nft`: AC := `ebl[ete-1] − nft`. `trze s99` → `sza i; jmp s99`: if the difference is exactly 0, skip the negate and go to `s99`. Otherwise `complement` (= `cma`, ones-complement) negates AC, so it now holds `nft − ebl[ete-1]`.
- `s99, store ex` → `dac ex`: `ex` = "time for sustained note" (line 1524). On the difference-nonzero path `ex = nft − ebl[ete-1]`; on the equal path `ex = 0`. (`store` does not touch AC.)
- `trpl s73` → `sma; jmp s73`: tests AC, which now holds the (possibly negated) value just stored in `ex`. Jump to `s73` to expand when AC **>= 0**, i.e. when `nft >= ebl[ete-1]` — the note has at least as much time as the embellishment figure needs, and `ex` is the non-negative leftover sustain. Otherwise (the note is too short):
- `s79, complaint flexo eit; goto s70` → types the **`eit`** complaint ("embellishment insufficient time", inferred; not emulator-verified) and emits the plain note.

### `s73` (1007-1030) — build the neighbor tones `tnf`/`tnd`, then dispatch

```
s73,	load ton
	addi (1
	lookup mt
	addi tll
	store tnf
	tlesc 2, s39
	…
	x2to7
	store tnf
	load ton
	subt (1
	lookup mt
	addi tll
	store tnd
	…
	x2to7
	store tnd
	load ete
	dispatch ebd-1
```

This computes the **upper neighbor** `tnf` (= `tne+1` semantically, line 1520) and **lower neighbor** `tnd` (= `tne-1`, line 1519):

- `load ton; addi (1; lookup mt` → fetch `mt[ton+1]` (the next staff position up), `addi tll` (transpose), `store tnf`, range-guard (`tlesc 2,s39` / `tgrec 76,s39` to the **`eor`** complaint at `s39`, "embellishment out of range", inferred), then `x2to7` to position it as a pitch field. `tnf` is the upper auxiliary.
- The symmetric block with `subt (1` builds `tnd` from `mt[ton-1]` (lower auxiliary).
- `load ete; dispatch ebd-1` → `lac ete; add (ebd-1; dap .+1; jmp i .`: computed jump through `ebd[ete-1]` — i.e. to one of `s81`/`s82`/`s83`/`s84`/`s85`/`s86`, the "first half" of the figure for this embellishment.

### `s81`-`s86` and `s77` (1032-1107) — the figure bodies

Each body issues a sequence of `call cn` calls, every one of which **appends one note word**. The accumulator is built as `<time-prefix> + <pitch>` for each call. Representative patterns:

```
s81,	load (2
	addi tne
	call cn          / emit: time-field 2 + principal pitch
	load (2
	addi tnd
	call cn          / emit: time-field 2 + lower neighbor
	goto s75
```

- `load (2; addi tne; call cn` → `lac (2; add tne; jda cn`: build the note word as **time `2`** (the smallest sounding unit) **OR'd with** the pre-positioned pitch `tne`, then call `cn` to append it. Successive calls alternate `tne`/`tnf`/`tnd` to trace the figure shape.

`s82`/`s83`/`s85` enter the **trill loop** at `s76`/`s77`. `s82` sets `cut = 0` (`zero cut; goto s76`), `s83` sets `cut = 4` (`sett cut, 4`), and `s85` first emits one `(2 + tne)` note then `goto s83`. `cut` is the "time not available to trill loop" (line 1525):

```
s83,	sett cut, 4
s76,	load nft
	band (3
	trnz s79
s77,	load nft
	subt cut
	trze s78
	load (2
	addi tnf
	call cn
	load (2
	addi tne
	call cn
	stepa cut, 4
	goto s77
```

- `s76, load nft; band (3; trnz s79` → `lac nft; and (3; sza; jmp s79`: if `nft & 3 != 0` (the time isn't a multiple of 4, so it can't be evenly divided into trill pairs) → `s79` ("eit" complaint, plain note).
- `s77, load nft; subt cut; trze s78` → `lac nft; sub cut; sza i; jmp s78`: when the remaining time (`nft − cut`) reaches 0, exit to `s78` (the second-half dispatch).
- `load (2; addi tnf; call cn` then `load (2; addi tne; call cn`: emit one **trill pair** — upper neighbor then principal, each with time field `2`.
- `stepa cut, 4` → `law 4; add cut; dac cut`: advance `cut` by the literal `4` (two `2`-unit notes consumed) and loop. So the trill emits as many alternating `tnf`/`tne` pairs as fit in `nft`, with the initial `cut` time held back from the loop.

`s84` uses a `400002` time prefix (a longer/sustained unit) for its three closing notes (`tnf`/`tne`/`tnd`), then `goto s75`; `s86` emits a three-note `tnf`/`tne`/`tnf` figure with time prefix `1`, then falls into `s75`.

### `s75` (1086-1091) — the sustained closing note

```
s75,	load ex
	addi (2
	addi tne
	addi sv
	call cn
	goto s32
```

- `load ex; addi (2; addi tne; addi sv` → `lac ex; add (2; add tne; add sv`: build the **final, sustained** note word: time = `ex + 2` (the leftover sustain computed at `s71`), OR'd with the principal pitch `tne` and the articulation status `sv`. `call cn` appends it. `goto s32` finishes the units bookkeeping.

### `s78` / `s93` / `s95` (1093-1107) — second-half dispatch

```
s78,	load ete
	dispatch ebe-1
```

`s78` (entered only when the trill loop empties, i.e. from `s82`/`s83`/`s85`) does a **second** computed jump through `ebe[ete-1]` → `s32`/`s93`/`s95`. `s93` emits a closing two-note `tnd`/`tne` turn; `s95` emits a single closing `tnf`; the rest go directly to `s32`. The figures that go through `s75` (from `s81`/`s84`/`s86`) reach `s32` directly and never visit `s78`/`ebe`.

---

## `cn` (1109-1113) — append one note word

```
cn,	answer cnx
	store nf
	call snl
	putback not, nf
cnx,	exit cn
```

This is the single point where a note word is committed to the buffer.

- `answer cnx` expands to `0 / dap cnx / lac .-2`: the leading `0` cell receives the AC argument (the assembled note word) from the caller's `jda cn`; `dap cnx` patches the return `jmp`; `lac .-2` reloads the note word into AC.
- `store nf` → `dac nf`: save the note word in `nf` ("note forming", line 1516).
- `call snl` → `jda snl`: call `snl` (lines 466-471) which does `step1 nl` (`idx nl`, advance the note-location pointer), `addi bc`, and `tgrec all, s3x` (a table-overflow guard — if `nl + bc > all` capacity, jump to `s3x`, "Table overflow.  Subdivide source program.", line 654). It returns the new `nl` in AC. So `snl` **advances `nl` to the next free slot** and bounds-checks.
- `putback not, nf` → `add (not; dap .+2; lac nf; dac .`: indexed store — compute address `not + nl` (AC holds `nl` from `snl`), then store `nf` (the note word) there. This **appends the note word** to the `not` array at the freshly-advanced slot.
- `cnx, exit cn` → the patched `jmp` back to the caller.

Each `call cn` therefore writes exactly one 18-bit note word into `not` and advances `nl`.

---

## The emission tail: `s70` / `2sa` / `2sb` / `s32` / `s33` (1118-1144)

`s70` is the join point for a **plain** (non-embellished, non-split) note; embellishment bodies instead route through `s32` after their multiple `cn` calls.

### `s70` (1118-1127) — assemble the note word and handle grace bookkeeping

```
s70,	load nft
	addi tne
	addi sv
	addi 3i
	call cn
	test0 gi, 2sa
	test1 gis, 2sb
	sett gis, 1
	grow nl, -1, nls
	goto 2sb
```

- `load nft; addi tne; addi sv; addi 3i` → `lac nft; add tne; add sv; add 3i`: **this is where the note word is built.** The four fields are combined by addition (they occupy disjoint bit positions, so `add` acts as bitwise OR here):
  - `nft` = the **time/duration** (low 7 bits, bits 11-17),
  - `tne` = the **pitch** already shifted into bits 5-10 by `x2to7` (or the rest sentinel `200`, which lands as pitch index `1` — see the cross-check),
  - `sv` = the **articulation/`sle` status** in bits {0,1,3,4} (values `400000`/`200000`/`40000`/`20000`),
  - `3i` = the **triplet** flag in bit 2 (`100000`).
- `call cn`: append it.
- `test0 gi, 2sa` → `lac gi; sza i; jmp 2sa`: if this is **not** a grace note (`gi == 0`) jump to `2sa`. Otherwise (it is a grace note):
- `test1 gis, 2sb` → `lac gis; sza; jmp 2sb`: if `gis` (gi-saved) is already set, jump to `2sb`. Otherwise this is the **first** grace note of a run:
- `sett gis, 1` → `lac (1; dac gis`: mark that we've saved the location.
- `grow nl, -1, nls` → `lac nl; add (-1; dac nls`: `nls` (nl-saved) := `nl − 1`, recording the buffer position **just before** the grace notes so the victim-note recovery (`2s2`) can rewind here.
- `2sa, zero gis` → `dzm gis` (the non-grace path resets the saved-flag).

### `2sb` / `s32` / `s33` (1130-1144) — measure-units bookkeeping

```
2sb,	test0 3i, s32
	load nft
	x2to1
	store tu
	goto s33
s32,	load nft
	store tu
	x2to1
	addi tu
	store tu
s33,	step mm, tu
	move si, sid
	move nl, nld
	goto te
```

This computes `tu` ("units*3 used by current note", line 1527) and accumulates it into `mm` ("units*3 used in measure to date", line 1526). The factor differs for triplets:

- `2sb, test0 3i, s32` → `lac 3i; sza i; jmp s32`: if **not** a triplet (`3i == 0`), jump to `s32` (the ×3 path). If it **is** a triplet:
  - `load nft; x2to1; store tu` → `lac nft; ral 1s; dac tu`: `tu := nft × 2`. A triplet note contributes `2` "units*3" (three triplet notes = 6 = two normal-note units worth — the ×2 keeps the common denominator).
- `s32, load nft; store tu; x2to1; addi tu; store tu` → `lac nft; dac tu; ral 1s; add tu; dac tu`: `tu := nft + (nft×2) = nft × 3`. A normal note contributes `3`. (`x2to1` is `ral 1s` = ×2; adding the saved `tu` gives ×3.)
- `s33, step mm, tu` → `lac mm; add tu; dac mm`: add this note's units into the measure total `mm`. (The terminator routine `te` at line 1196 checks `mm` against `3u` = `3 × units` to detect over/under-full measures.)
- `move si, sid` → `lac si; dac sid`: save `si` into `sid` ("si delayed", line 1539) for the next token's use.
- `move nl, nld` → `lac nl; dac nld` ("nl delayed", line 1540; comment notes "added 2006/02/26 --prs", a retype-era fix).
- `goto te` → `jmp te`: control transfers to the **terminator** routine (next section), which decides whether the measure/token sequence continues, ends a bar (`teb`/`sbc`), or starts a pseudo-command.

---

## The note word: bit layout and cross-check with the consumer

The note word combined at `s70` is:

| Bits (MSB = 0) | Width | Field | Built from | Constant(s) |
|---|---|---|---|---|
| 0 | 1 | articulation hi-A | `sv` | `400000` (`s2c`) |
| 1 | 1 | articulation hi-B | `sv` | `200000` (`s2b`) |
| 2 | 1 | **triplet** | `3i` | `100000` (`s2g`) |
| 3 | 1 | articulation lo-A | `sv` | `40000` (`2ss`) |
| 4 | 1 | articulation lo-B | `sv` | `20000` (`2sr`) |
| 5-10 | 6 | **pitch** | `tne` after `x2to7` | index `2..76` octal |
| 11-17 | 7 | **time / duration** | `nft` | in time units |

This **reconciles exactly** with the consumer's decode in [pdp1m13/docs/05-data-formats.md §2](../../pdp1m13/docs/05-data-formats.md): there `cc3` extracts articulation from bits {0,1} (first `rcl 2s`), the triplet from bit 2 (`spi`→`stf 6`), articulation bits {3,4} (second `rcl 2s` after `ril 1s`), **pitch** from bits 5-10 (`rcl 6s`), and **duration** from bits 11-17 (`rcl 7s`). The producer here:

- writes the **two** high articulation bits and **two** low articulation bits via the disjoint `sv` constants `400000`/`200000`/`40000`/`20000` — matching the consumer's split of the 4-bit `cxt` index across bits {0,1} and {3,4},
- writes the triplet bit `100000` (bit 2) via `3i` — matching the consumer's `spi`/`stf 6` triplet detection,
- positions a 6-bit pitch into bits 5-10 via `x2to7` (e.g. `77` → `017600`) — matching `rcl 6s`,
- leaves the low 7 bits as the time/duration `nft` — matching `rcl 7s` (7-bit duration).

Bit budget: 2 + 1 + 2 + 6 + 7 = 18. **Full reconciliation; no unresolved field.**

Two points worth spelling out:

1. **The low field's unit interpretation differs between producer and consumer view.** On the producer side the low 7 bits are `nft` (this program's internal "note formed time"); the consumer reads them as a "duration in 64ths" and then rescales (`×3`/`×2` for triplet, then `×8`). The *bit positions* agree; the *unit interpretation* is the consumer's, documented there.
2. **The rest encoding reconciles cleanly.** A rest sets `tne = 200` at `s2w` and jumps to `s70` *without* the `x2to7` shift. `200` octal is `2^7`, which is the **low bit of the 6-bit pitch field** (bits 5-10): adding it at `s70` makes the pitch field read as index **`1`**. The consumer's `cc3` does `sad (1; cla` (and treats `0`/`1` as rests), so a pitch index of `1` is exactly a rest. So the producer's rest sentinel `200` and the consumer's "pitch `0`/`1` = rest" are the same agreement, with the rest still carrying its duration in `nft`. (The `cc3` decode detail is grounded in 05-data-formats.md §2.)

---

## What this accomplishes

Lines 906-1144 are `hc1d`'s note factory. Starting from the per-note state left by Scan 2's character loop, this code: settles the slur/articulation status into `sv`; runs the grace-note **robbery** protocol (`rob`/`gi`/`gis`/`nls`, with `itg` recovery) so grace notes steal time from their host without overrunning the buffer; resolves **pitch** through the `nt`→`kt`→`mt` three-table model, applying signed accidentals (`putback mt`) and whole-piece transposition (`tll`); expands **embellishments** into multi-note trill/mordent/turn figures via the `ebl`/`ebd`/`ebe` tables and the `s77` trill loop; and finally combines each 18-bit note word (`nft + tne + sv + 3i`) and appends it with `cn`/`snl`/`putback not`. The note-word bit layout it produces is the exact contract that *PDP-1 Music 13* decodes in `cc3` — which this section cross-checks field-by-field against [05-data-formats.md §2](../../pdp1m13/docs/05-data-formats.md), including the rest encoding.

Forward pointer: control falls through to `te` (the **terminator and pseudo-command** dispatcher, lines 1193+), documented next — where measures are closed, bar pointers emitted via `sbc`, and pseudo-commands (`key`, `tempo`, `copy`, …) are decoded.
