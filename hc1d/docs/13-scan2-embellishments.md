# Scan 2: embellishments — trills, mordents, turns (`s71`-`s95`)

This is the **embellishment generator**: the part of Scan 2 that takes a note already
parsed and pitched (its principal tone derived from `ton`, its formed time in `nft`, its
`sle`/articulation status in `sv`) and, if the note carries an embellishment letter (`ete`),
*replaces* the single note with a short rapid figure — a trill, mordent, turn, or grace
pattern — by emitting several `cn` ("compose note") calls instead of one. Every note word it
produces goes through `cn` → `snl` → `putback not`, i.e. straight into the `not` NOTE-WORD
array that *PDP-1 Music 13* later reads (the producer side of
[`05-data-formats.md`](../../pdp1m13/docs/05-data-formats.md)).

This is the **highest-risk region** of the whole file to interpret: the code is
table-driven (`ebl`/`ebd`/`ebe`), heavily self-modifying, and arithmetic on tone pointers
is mixed with arithmetic on *time* values inside the same words. The *mechanics* below are
read directly from the source; the *musical figure* each generator produces is **inferred**
from the FIODEC letters, the ordering of `tnf`/`tne`/`tnd`, and the time constants, and is
flagged as such throughout.

Core PDP-1 op semantics (`lac`, `dac`, `add`, `sub`, `idx`, `ral`/`sar`, the skip group,
ones-complement) are not re-taught here — see
[`02-pdp1-primer.md`](../../pdp1m13/docs/02-pdp1-primer.md). The macro layer (`load`,
`store`, `lookup`, `dispatch`/`diswith`, `call`/`answer`/`exit`, the `tr*`/`test*`/`t*es*`
skip-jumps) and the 6-character/uppercase folding rule are explained once in the
primer/appendix; here they are used as established vocabulary. The variable cells (`ton`,
`tne`, `tnf`, `tnd`, `nft`, `ex`, `cut`, `sv`, `3i`, `ete`, `nl`, `nf`) are catalogued in
[`14-scan2-tables.md`](14-scan2-tables.md) — cross-reference it heavily; this file walks
the *control flow* that consumes those cells.

## Where we enter: `s31` and the tone pointers `ton`/`tne` (recap, lines 981-990)

By the time control reaches `s31`, the principal-note machinery has already run. Four
cells matter (full definitions in [`14-scan2-tables.md`](14-scan2-tables.md)):

- `ton` — *tone pointer to staff* (the index into the momentary-tone table `mt`): the
  principal scale degree, **not** changing within this note (source comment: "not
  changing").
- `tne` — *tone pointer to table*: the principal pitch the embellishment varies *around*
  (source comment: "letter changing").
- `nft` — *note formed, time part*: the total time budget for this note.
- `sv` — *value of `ss` for this particular note* (the `sle`/articulation indicator). The
  source spells it "`sle`"; its musical sense (slur/legato/staccato class) is **inferred**
  from the `pv1`..`pvg` handlers that set `ss`/`sv` to articulation codes like `200000`
  (s), `400000` (l), `0` (e), `40000` (h), `20000` (q) — i.e. the articulation bits the
  consumer unpacks in [`05-data-formats.md`](../../pdp1m13/docs/05-data-formats.md).

`s31` (lines 981-990) computes `tne` from `ton`:

```
s31,	load ton
	lookup mt          / AC := mt[ton]   (momentary-tone table entry)
	addi tll           / + transposition semitones (tll)
	store tne
	tlesc 2, s40       / if tne < 2  -> s40 "uat" (under range)
	load tne
	tgrec 76, s40      / if tne > 76 -> s40 "uat" (over range)
	load tne
	x2to7              / ral 7s : rotate AC left 7 -- shift the pitch index
	store tne          /          into the note-word's pitch field
```

`lookup mt` expands to `add (mt; dap .+1; lac` — an indexed load of `mt[ton]`. `addi tll`
adds the transposition-semitone count `tll`. The two guards `tlesc 2`/`tgrec 76`
(= `sub (2; spa; jmp s40` and `sub (76; sma+sza-skp; jmp s40`) bound the raw tone to the
legal range `2..76` octal before it is shifted into position by `x2to7` (`ral 7s`). The
result in `tne` is the pre-shifted **principal tone field** that every `cn` call below adds
a time constant into. (Exact bit position of the pitch field belongs to
[`05-data-formats.md`](../../pdp1m13/docs/05-data-formats.md); a `ral 7s` on a low-order
index lands it in the consumer's pitch field — inferred.)

The two range-guard targets are `s40` (= `complaint flexo uat`, line 964) for `tne`, and
`s39` (= `complaint flexo eor`, line 1116) for the neighbor tones in `s73`.

## `s30` — is there an embellishment at all? (lines 991-994)

```
s30,	test0 ete, s70     / if ete = 0  -> s70  (plain note, no embellishment)
	test0 3i, s71      / if 3i  = 0  -> s71  (embellishment allowed)
s72,	complaint flexo etr
	goto s70
```

`test0 ete, s70` expands to `lac ete; sza i; jmp s70`: load the embellishment-terminal
cell `ete`, and if it is zero jump to `s70` — the plain single-note path that emits one
`cn` (plus the grace-note bookkeeping at `2sa`/`2sb`) and reaches `s32`. So **no
embellishment letter ⇒ no figure**.

`test0 3i, s71`: `3i` is the *triplet indicator* (`0`/`100000`). If `3i = 0` (this note is
not part of a triplet) the embellishment is legal and we proceed to `s71`. Otherwise we
fall into `s72`, which issues `complaint flexo etr` — a non-fatal complaint that expands to
`lac (flexo etr; jda er` (the `flexo` pseudo-op packs the three FIODEC characters `e t r`
into one literal word; the `er` routine then types it — **not emulator-verified**, and
`flexo` is one of the original pseudo-ops the modern macro1 lacks). The three-letter code
`etr` evidently reads *"embellishment in triplet"* — inferred. (Note: `etr` is *also*,
coincidentally, an unrelated label inside the `err` typing routine at line 606; that label
has nothing to do with this complaint — `flexo` consumes "etr" as literal text, not as a
symbol reference.) After the complaint, `goto s70` falls back to the plain note. The intent:
**you may not embellish a triplet note**; the program warns and degrades gracefully rather
than halting.

## `s71` — embellishment length lookup and the sustained-time budget `ex` (lines 996-1005)

```
s71,	load ete
	lookup ebl-1       / AC := ebl[ete-1]  (figure length in time units)
	subt nft           / AC := length - nft
	trze s99           / if AC = 0 -> jump to s99 (ex stays 0)
	complement         / cma : AC := ~AC  -> AC := nft - length (ones-complement negate)
s99,	store ex           / ex := (nft - length), or 0
	trpl s73           / if ex >= 0 -> s73  (enough time: build the figure)

s79,	complaint flexo eit
	goto s70
```

`ete` holds the embellishment letter index (`1..6`, indexing the six-entry tables below;
set up in the letter-scanning code elsewhere in Scan 2). `lookup ebl-1`
(= `add (ebl-1; dap .+1; lac`) reads the **embellishment length table** indexed 1-origin —
see `ebl` below — yielding the *number of time units the fast figure consumes*.

`subt nft` forms `length - nft`. Then comes a small ones-complement dance to compute
`ex = nft - length` (the **time left over to sustain** after the figure):

- `trze s99` = `sza i; jmp s99`: `sza i` skips the `jmp` only when AC ≠ 0, so when
  `length - nft == 0` (AC already zero) the `jmp s99` runs, storing `ex = 0` (the figure
  exactly fills the note).
- otherwise `complement` (`cma`) is the ones-complement (bitwise NOT), which on this machine
  is negation: `~(length - nft) = nft - length`. Control then falls into `s99`.

`s99` stores that into `ex` (*time for sustained note*, per the cell comment). The guard
`trpl s73` (`sma; jmp s73`) takes the figure-building path **only when `ex >= 0`**, i.e.
the note is long enough to hold the whole embellishment.

If `ex < 0` we fall into `s79`: `complaint flexo eit` (`lac (flexo eit; jda er`, typing the
FIODEC code `eit` — **not emulator-verified**), evidently *"embellishment — insufficient
time"* (inferred). The figure won't fit, so the program complains and `goto s70` to emit
the note plain. This is the central feasibility test: a trill on a sixteenth note is
rejected here.

## `s73` — neighbor tones `tnf` (above) and `tnd` (below), then dispatch (lines 1007-1030)

The figure alternates the principal tone with its scale neighbors. `s73` builds both:

```
s73,	load ton
	addi (1            / ton + 1  (next scale degree up)
	lookup mt          / mt[ton+1]
	addi tll           / + transposition
	store tnf
	tlesc 2, s39       / range guard low  -> s39 "eor"
	load tnf
	tgrec 76, s39      / range guard high -> s39 "eor"
	load tnf
	x2to7              / shift into pitch field
	store tnf          / tnf = "tne+1" upper neighbor
	load ton
	subt (1            / ton - 1  (next scale degree down)
	lookup mt
	addi tll
	store tnd
	tlesc 2, s39
	load tnd
	tgrec 76, s39
	load tnd
	x2to7
	store tnd          / tnd = "tne-1" lower neighbor
	load ete
	dispatch ebd-1     / jump to ebd[ete-1] : the per-type generator
```

This is the same `lookup mt; addi tll; range-check; x2to7` sequence used for `tne` in
`s31`, but applied to `ton+1` and `ton-1`. (`addi (1` = `add (1`, adding the *literal* 1 to
`ton`; `subt (1` = `sub (1`.) The cell comments confirm the roles: `tnf` = *"tne+1 for
embell."* (the upper neighbor), `tnd` = *"tne-1 for embell."* (the lower neighbor). Note
these step by **scale degree** (`ton ± 1` indexing the momentary-tone table `mt`), not by
semitone — so the neighbor is the correct diatonic/keyed pitch, the musically right behavior
for an ornament. (Inferred from the `mt` indexing.)

The four `s39` exits are the **"embellishment out of range"** guards: any neighbor that
falls outside `2..76` jumps to `s39` (`complaint flexo eor`, line 1116) and abandons the
figure. A trill on the top or bottom note of the table is rejected here.

Finally `dispatch ebd-1` (= `add (ebd-1; dap .+1; jmp i`) is a **computed jump** through the
**generator dispatch table** `ebd`, 1-origin on `ete`. This selects one of `s81`..`s86`.
(`dispatch` folds to the `dispat` macro by the assembler's 6-character/uppercase rule.)

### The embellishment tables `ebl` / `ebd` / `ebe` (lines 1176-1188)

These three parallel tables, all indexed `ete-1`, are the heart of the embellishment model.
The FIODEC letters in the `ebl` comments (`d m n u w p`) are the embellishment command
letters; their lengths are the time the fast figure consumes.

| `ete` | letter (comment) | `ebl` length (octal) | `ebd` (phase-1 gen) | `ebe` (phase-2 gen) | inferred figure |
|------:|:---------------:|:--------------------:|:-------------------:|:-------------------:|:----------------|
| 1 | `d` | `6`  | `s81` | `s32` | trill-type, two-tone start |
| 2 | `m` | `4`  | `s82` | `s32` | mordent (single quick neighbor) |
| 3 | `n` | `10` | `s83` | `s93` | longer trill with terminating turn |
| 4 | `u` | `10` | `s84` | `s32` | turn (upper-principal-lower) |
| 5 | `w` | `4`  | `s85` | `s95` | short trill + terminating note |
| 6 | `p` | `5`  | `s86` | `s32` | three-note (upper) figure |

The letter→figure mapping is **inferred**: the source gives only the one-letter `ebl`
comments and the generator code. `ebe` is the **second-phase dispatch** (line 1186) that
runs *after* the trill loop exhausts its time — most entries are `s32` ("nothing more"),
but `n` and `w` route to `s93`/`s95` to append a closing figure (a *turned* trill, i.e. a
trill that resolves with a two- or one-note tail). See "What this accomplishes."

## The per-type generators `s81`-`s86` (lines 1032-1084)

Each generator emits a short sequence of `cn` calls. **The pattern in every call is the
same:** `load (<time-constant>; addi <tone-cell>; call cn`. Because `tne`/`tnf`/`tnd`
already hold the pitch *pre-shifted into the pitch field* (the `x2to7` above), `addi`-ing a
small time constant into them simply fills in the **time/duration field** of the note word,
and `call cn` deposits the finished word. The three time constants used are:

| constant | meaning (inferred) |
|---------:|:-------------------|
| `(2`       | a 2-unit fast note (the normal trill/turn grain) |
| `(1`       | a 1-unit fastest note |
| `(400002`  | `400002` octal = bit `400000` + 2 units; the `400000` bit is an articulation/flag bit in the note word; evidently marks the turn notes specially (e.g. slurred/legato) |

The exact meaning of bit `400000` belongs to the consumed note-word layout in
[`05-data-formats.md`](../../pdp1m13/docs/05-data-formats.md) (where the top bits are the
articulation/triplet field); here it is simply OR-ed in by adding it to the pre-shifted
tone (the pitch field never sets that bit, so `addi` acts as a bit-set). Inferred.

### `s81` — letter `d` trill start (lines 1032-1038)

```
s81,	load (2; addi tne; call cn     / principal, 2 units
	load (2; addi tnd; call cn     / lower neighbor, 2 units
	goto s75
```

Two fast notes — principal (`tne`) then lower neighbor (`tnd`) — then straight to `s75`
(emit the sustained remainder). With `ebl=6` for `d` this is the opening of a short trill
figure. (Figure inferred.)

### `s82` — letter `m` mordent (lines 1040-1041)

```
s82,	zero cut
	goto s76
```

`m` clears `cut` (the *time not available to the trill loop*, see below) and joins the
**trill loop** at `s76`. With `cut = 0` the loop runs across the whole `nft` budget — a
mordent here is realized as the degenerate/short case of the trill loop. (Inferred.)

### `s83` — letter `n` long trill, and the trill loop `s76`/`s77` (lines 1043-1057)

```
s83,	sett cut, 4        / cut := 4  (withhold 4 units for the closing turn)
s76,	load nft
	band (3            / nft AND 3  (low two bits)
	trnz s79           / if nonzero -> s79 "eit"  (time not a multiple of 4)
s77,	load nft
	subt cut           / remaining = nft - cut
	trze s78           / if remaining = 0 -> s78  (phase 2: ebe dispatch)
	load (2; addi tnf; call cn     / upper neighbor, 2 units
	load (2; addi tne; call cn     / principal,      2 units
	stepa cut, 4       / cut := cut + 4  (account 4 units this pass)
	goto s77
```

`sett cut, 4` (= `lac (4; dac cut`) reserves 4 time units that the loop will *not* fill —
they are left for the closing turn that `ebe` (`s93`) appends. `s76` then checks
`nft band (3` (`and (3`, masking the low two bits): if the formed time is **not a multiple
of 4** the loop can't divide cleanly, so `trnz s79` (`sza; jmp s79`, jump if AC ≠ 0) bails
to the `eit` complaint. (The `(3` test enforces a whole-beat trill — interpretation
inferred.)

`s77` is the **trill loop body**. Each pass:
1. `load nft; subt cut; trze s78` — if `nft - cut == 0` we have filled all the loopable
   time; jump to `s78` (the second-phase `ebe` dispatch).
2. otherwise emit *upper neighbor* (`tnf`) then *principal* (`tne`), each 2 units — one
   full trill oscillation (4 units total).
3. `stepa cut, 4` (= `law 4; add cut; dac cut`) advances `cut` by 4 (accounting for the
   4 units just emitted), and loops.

So `cut` does double duty: it starts as the *reserved* tail time (`4` for `n`, `0` for `m`),
and the loop *adds* `4` per oscillation, so the termination test `nft - cut == 0` fires
exactly when the loop has filled `nft - initial-cut` units. The cell comment ("time not
available to trill loop") matches: the reserved 4 units are withheld so the figure has room
for its terminating turn (emitted later by `s93`).

### `s84` — letter `u` turn (lines 1059-1069)

```
s84,	load (400002; addi tnf; call cn   / upper neighbor, flag+2 units
	load (400002; addi tne; call cn   / principal,      flag+2 units
	load (400002; addi tnd; call cn   / lower neighbor, flag+2 units
	goto s75
```

Three notes — **upper, principal, lower** — each with the `400002` constant (articulation
bit set, 2 units), then `goto s75`. Upper-principal-lower is the classic *turn* shape, and
the set flag bit evidently slurs the three together. (Figure inferred.)

### `s85` — letter `w` short trill (lines 1071-1074)

```
s85,	load (2; addi tne; call cn        / principal, 2 units
	goto s83                          / then run the trill loop (which sets cut := 4)
```

`w` emits one principal note then jumps into `s83` — i.e. it borrows the full `n` trill loop
(which sets `cut := 4` and reserves the tail). Its `ebe` entry is `s95` (a single closing
note), making `w` a *short trill that resolves with one terminating note*. (Inferred.)

### `s86` — letter `p` three-note figure (lines 1076-1084)

```
s86,	load (1; addi tnf; call cn        / upper neighbor, 1 unit
	load (1; addi tne; call cn        / principal,      1 unit
	load (1; addi tnf; call cn        / upper neighbor, 1 unit
	(falls through to s75)
```

Three *fastest* (1-unit) notes — upper, principal, upper — falling through into `s75`. With
`ebl=5` this is a quick three-note ornament (an inverted-mordent-like flick). (Figure
inferred.) Note `s86` does **not** `goto s75`; the last `call cn` (line 1084) is followed by
a blank line 1085 and then `s75` at 1086, so it relies on falling through — a deliberate
fall-through.

## `s75` — emit the sustained remainder (lines 1086-1091)

```
s75,	load ex            / leftover time (nft - figure length), from s99
	addi (2            / + 2  (a base time grain)
	addi tne           / + principal tone field
	addi sv            / + sle/articulation value for this note
	call cn            / emit the sustained principal note
	goto s32           / -> note-finishing common code
```

After the fast figure, `s75` emits **one long note on the principal tone** holding for the
remaining time. The single `cn` word accumulates four addends into the AC:

- `ex` — the surplus time computed in `s71`/`s99`.
- `(2` — a constant grain added to the leftover (so even a zero-surplus note gets a
  minimum-length sustain; inferred).
- `tne` — the pre-shifted principal tone field.
- `sv` — the note's `sle`/articulation value, OR-ing in the articulation bits so the
  sustain carries the note's class. (Musical sense inferred.)

Then `goto s32`, the common note-finishing path (lines 1136+, shared with the plain-note
route through `s70`) that updates `tu`/`mm` and proceeds to the terminator handler `te`.
This is where the embellished note rejoins normal Scan-2 flow.

## `s78` → second-phase dispatch `ebe`, and `s93`/`s95` (lines 1093-1107)

The trill loop (`s77`) does **not** fall into `s75`; when it exhausts its time it jumps to
`s78`:

```
s78,	load ete
	dispatch ebe-1     / jump to ebe[ete-1] : the closing-figure generator
```

`dispatch ebe-1` (`add (ebe-1; dap .+1; jmp i`) is the **phase-2 computed jump**. For most
letters `ebe[ete-1]` is `s32` (finish, no tail). For `n` it is `s93`; for `w` it is `s95`.
These append the **closing turn** that the reserved `cut` time was held back for:

```
s93,	load (2; addi tnd; call cn     / lower neighbor, 2 units
	load (2; addi tne; call cn     / principal,      2 units
	goto s32

s95,	load (2; addi tnf; call cn     / upper neighbor, 2 units
	goto s32
```

`s93` (for the long trill `n`) emits a two-note tail — **lower neighbor then principal** —
the resolution that turns a plain trill into a *turned* trill. `s95` (for the short trill
`w`) emits a single **upper-neighbor** closing note. Both then `goto s32` to finish. Note
neither phase-2 path passes through `s75`: trills emit their body *inside* the loop, so they
go straight from loop-exhaustion to the closing turn to `s32`. (Musical reading inferred
from note ordering.)

## The note-emit primitive `cn` (lines 1109-1113)

Every generator above funnels through one tiny subroutine:

```
cn,	answer cnx         / 0 / dap cnx / lac .-2  -- prologue: arg (the note word) in AC
	store nf           / nf := the assembled note word
	call snl           / advance nl to the next free slot in not[]
	putback not, nf    / not[nl] := nf   (the indexed store)
cnx,	exit cn            / patched jmp back to caller
```

`cn` takes the assembled note word in AC (the `answer`/`exit` calling convention — see
primer/appendix). It stores it in `nf` (*note forming*), calls `snl` to bump the note-array
index `nl` (with an overflow guard `tgrec all, s3x`, lines 466-471 — `snl` returns the new
`nl` in AC), and `putback not, nf` (`add (not; dap .+2; lac nf; dac`) stores the word into
`not[nl]`. So **each `call cn` is exactly one note word appended to the compiled output
array** — which is what [`05-data-formats.md`](../../pdp1m13/docs/05-data-formats.md)
describes Music 13 reading. A six-note turn therefore writes six consecutive `not` words;
the playback program has no idea an "embellishment" ever existed — it just plays the note
stream.

## Note on retype slips and folding in this region

- **`compalint`** at line 976 (`s41, compalint flexo aor`) is a **likely retype slip for
  `complaint`** — it falls just before `s71`-`s95` proper, on the `s2v` setup path that
  precedes `s31`. Documented as-written; the symbol dump shows it does not resolve cleanly.
- **`flex`** at line 954 (`complaint flex air`, in the `s2s`/`s2w` lead-in) is a **likely
  retype slip for `flexo`**. Both are flagged, not corrected (editorial policy: document the
  artifact byte-for-byte).
- The macro names `complaint`/`complement`/`dispatch` resolve to the `compla`/`comple`/`dispat`
  macros (lines 139, 57, 256) by the assembler's 6-character / uppercase folding rule (see
  primer/appendix); they are the same token.

## What this accomplishes

This region is the compiler's **ornament expander**. Given a single parsed note (principal
pitch `tne`, neighbors derived as `tnf`/`tnd`, total time `nft`, articulation `sv`) and an
embellishment letter `ete`, it:

1. validates the ornament is legal here (`s30`: not on a triplet; `s71`: the figure fits in
   the available time via the `ex = nft - length` budget; `s73`: neighbors are in range),
   complaining (`etr`/`eit`/`eor`, typed via the `flexo`/`er` path — not emulator-verified)
   and degrading to a plain note when it isn't;
2. dispatches through `ebd` to a per-letter generator (`s81`-`s86`) that emits the fast
   figure as a burst of short `cn` note words — trills via the `s76`/`s77` loop with its
   whole-beat `band (3` guard and `cut` reservation, turns/mordents as fixed sequences;
3. emits the sustained remainder on the principal tone (`s75`);
4. for trills, dispatches a second time through `ebe` (`s93`/`s95`) to append the closing
   turn the loop reserved time for.

The net effect: **one DSL note becomes several note words in `not[]`**, so the downstream
*PDP-1 Music 13* program (consumer of [`05-data-formats.md`](../../pdp1m13/docs/05-data-formats.md))
plays a fully written-out ornament with no ornament logic of its own. The precise *musical*
identity of each figure (which letter is a trill vs. mordent vs. turn) is inferred from the
`ebl` letters, the `tnf`/`tne`/`tnd` ordering, and the time constants — treat those readings
as "appears to / evidently," not certainties.

Next: the common note-finishing path **`s32`/`s33`** and the terminator/bar handler **`te`**
(lines 1130-1219) — where every note, plain or embellished, accounts its time into the
measure and the bar tape is punched.
