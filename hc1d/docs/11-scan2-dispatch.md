# Scan 2: the character dispatcher and note modifiers (`s2`-`s38`)

Scan 1 (`s1`, the field/timing analyzer) has just finished a transcription word: it has parsed the numeric duration fields, set the running time `tim` and fraction `fc`/`fu`, and at `s1o` (lines 824-827) it computes `fc = tim/2` and falls through to `goto s2`. Scan 2 re-reads the *same* word, character by character, and interprets every non-numeric symbol as a **note modifier** -- slur/legato marks, staff-position shifts, triplet brackets, accidentals, and embellishment-terminal letters. It accumulates that state into a block of per-note variables, then (at `s2r`, just past this section) hands off to note formation `cn`.

This section covers Scan 2's initialization and its central character-dispatch loop (`s2`, `s20`/`s21`), plus all the one-line modifier handlers reached through that dispatch (`s2b`-`s38`, `s2p`/`s2q`). The note-forming continuation `s2r`/`s51`/`s52` onward is described in the next section.

Throughout, recall that this is a ones-complement, self-modifying PDP-1 program; see [the PDP-1 primer](../../pdp1m13/docs/02-pdp1-primer.md) for `lac`/`dac`/`add`/`sub`/`idx`/`sad`/`sas`/`jmp`/the skip group/the `Ns` shift notation, and [the macro vocabulary](20-macro-vocabulary.md) for the macro layer that every body line is written in. The dispatch tables `s2z`/`s2y` and the embellishment tables `ebl`/`ebd`/`ebe` are tabulated in [the Scan-2 tables doc](14-scan2-tables.md).

> Assembler reminder (documented once in the primer, applied silently here): this MACRO assembler is significant to six characters and folds case to upper, so `complaint` resolves to the macro `compla`, `dispatch` to `dispat`, and `diswith` to `diswit`. Genuine retype slips are flagged inline.

## `s2` -- Scan-2 initialization (lines 832-840)

```
s2,	zero fu
	zero sr
	zero 3i
	zero si
	zero aci
	zero acc
	zero et
	zero ete
	call rrc
```

`zero A` expands to `dzm A` (deposit zero, clearing the cell). Scan 2 begins by clearing its per-word state:

| Cell | Source comment | Role being reset |
|---|---|---|
| `fu` | fraction used | dotted/fractional-duration accumulator (shared with Scan 1) |
| `sr` | staff reloc. count | octave/staff-position shift applied to this note |
| `3i` | triplet ind.: 0/no, 100000/yes | "this note is part of a triplet" flag |
| `si` | 0/no sle in note; 1/sle | "a slur/legato mark was seen" flag |
| `aci` | accid. ind.: 0/none, 1/sharp or flat, -1/natural | accidental *kind* |
| `acc` | accid. count | accidental *magnitude* (number of sharps/flats) |
| `et` | embell. temp. | embellishment-terminal selector just chosen |
| `ete` | embell. terminal | embellishment-terminal selector committed for the note |

`call rrc` expands to `jda rrc` -- jump-and-deposit-AC into `rrc`, running the routine at `rrc+1`. `rrc` (lines 477-480) is the reset that rewinds the word-buffer read index:

```
rrc,	answer rrx
	move fl2, fi
	store fl1
rrx,	exit rrc
```

`answer rrx` expands via the subroutine-prologue macro to the three cells `0 / dap rrx / lac .-2`: the literal `0` receives the caller's deposited AC, `dap rrx` patches the low 12 address bits of the exit `jmp` at `rrx` to the return address, and `lac .-2` reloads the argument. `move fl2, fi` (`lac fl2; dac fi`) rewinds the f-buffer read index `fi` to `fl2` -- the location in the source buffer `f` of the last terminator *before* the new word (per the `fl2` comment, line 1561). `store fl1` (`dac fl1`) copies that same value into `fl1` ("location in f of last terminator", line 1560). The effect is to point the character reader `rch` back at the start of the word that Scan 1 just consumed, so Scan 2 can walk it again. `exit rrc` is a bare `jmp` whose address `dap rrx` patched -- the return.

This `call`/`answer`/`exit` triple is hc1d's subroutine convention (the analogue of pdp1m13's `jsp`/`jda`+`dap` idiom); see [the macro vocabulary](20-macro-vocabulary.md).

## `s20`/`s21` -- read a character, classify it, dispatch (lines 842-849)

```
s20,	call rch
	store chr
	trze s21
	tgrec 20, s21
	goto s20
s21,	load chr
	search s2z, 25, s20
	dispatch s2y
```

This is the heart of Scan 2: a loop that pulls one character from the rescanned word, decides whether it is a numeric digit (which Scan 2 ignores -- Scan 1 already handled durations) or a modifier symbol (which it dispatches), and repeats.

`call rch` (`jda rch`) reads one character from the source buffer `f`. `rch` (lines 483-555) is the buffered character reader: it returns the next FIODEC character of the current word in AC (and leaves it in `ch`). `store chr` (`dac chr`) saves it in `chr` ("character read", line 1504).

Now the numeric filter:

- `trze s21` expands to `sza i; jmp s21` -- jump to `s21` if **AC = 0**. (`sza i` skips on AC non-zero, so the `jmp` fires when AC is zero.)
- `tgrec 20, s21` expands (via `tgrec C,T => sub (C; sma+sza-skp; jmp T`) to: subtract the literal `20` from AC, then a combined skip that fires on **minus OR zero**, then `jmp s21`. The macro's stated sense is "jump if AC > literal C" -- i.e. jump to `s21` if `chr > 20` octal. (The skip fires when `AC - 20 <= 0`, so the `jmp` is taken only when `AC - 20 > 0`.)
- `goto s20` (`jmp s20`): if neither test fired (the character is `0 < chr <= 20`), loop back and read the next character without acting.

The FIODEC digit/letter boundary at `20` octal, and the resulting "skip values `1`-`20`, dispatch the rest" behavior, are inferred from the FIODEC code layout and the `s2z` table contents below; note that a true space (FIODEC `00`) is caught by the `trze` test and sent to the dispatcher (space is `s2z` index `0o22`, see below).

At `s21` the character is a modifier. `load chr` reloads it. Then:

`search s2z, 25, s20` is the linear-search macro (defined lines 302-315). It searches AC through the code table `s2z` for `N+1` entries, where `N` is the octal literal `25`; here that is the table base through `s2z+25` (the entries at indices `0`..`0o24`, i.e. 21 entries -- see the table below). If no match it jumps to the not-found target `s20` (loop back and ignore an unrecognized character); otherwise it returns in AC the **matched index** (the matched position minus the table base). Expanded, `search` stashes AC in `t1`, self-modifies a `sad` to walk `s2z`, and on a match computes `AC = (current pointer) + (-sad-W)` -- i.e. the zero-based offset into `s2z` (see the macro definition for the exact `lac .-6; add (-sad-W` arithmetic).

`s2z` is the modifier-character code table (lines 1147-1167); each entry is a FIODEC code with the source comment naming the glyph. There are 21 entries (indices `0`..`0o24`), one per `s2y` handler slot:

| Index | FIODEC | Glyph | | Index | FIODEC | Glyph |
|---|---|---|---|---|---|---|
| 0 | 22 | `s` | | 11 (0o13) | 45 | `n` |
| 1 | 43 | `l` | | 12 (0o14) | 47 | `p` |
| 2 | 65 | `e` | | 13 (0o15) | 24 | `u` |
| 3 | 61 | `a` | | 14 (0o16) | 26 | `w` |
| 4 | 62 | `b` | | 15 (0o17) | 73 | `.` (period) |
| 5 | 63 | `c` | | 16 (0o20) | 27 | `x` |
| 6 (0o6) | 57 | `(` / `+` | | 17 (0o21) | 21 | `\|` (bar) |
| 7 (0o7) | 54 | `-` (minus) | | 18 (0o22) | 00 | space |
| 8 (0o10) | 55 | `)` / `=` | | 19 (0o23) | 50 | `q` |
| 9 (0o11) | 64 | `d` | | 20 (0o24) | 70 | `h` |
| 10 (0o12) | 44 | `m` | | | | |

(The FIODEC codes are taken verbatim from the in-source comments at lines 1147-1167. The `s2z+25,` boundary label is at line 1169, so all 21 entries -- including the trailing space/`q`/`h` -- are part of `s2z`. The musical meaning of each handler is partly inferred; see [the Scan-2 tables doc](14-scan2-tables.md) for the full glyph→handler correspondence.)

`dispatch s2y` -- `dispatch` folds to the macro `dispat`, which expands to `add (s2y; dap .+1; jmp i`. With AC holding the matched index, this computes the address `s2y + index`, patches the very next word (`jmp i`) to that address, and jumps **indirectly** through table entry `s2y[index]`. `s2y` (lines 1170-1173) is the parallel jump table whose entries are the handler labels, in the same order as `s2z`:

```
s2y,	s2b	s2c	s2d	s2e	s2f	s2g
	s2h	s2i	s2j	s2k	s2l	s2m
	s38	s2n	s2o	s2p	s2q	s2r
	s2r	2sr	2ss
```

So the glyph→handler map is: `s`→`s2b`, `l`→`s2c`, `e`→`s2d`, `a`→`s2e`, `b`→`s2f`, `c`→`s2g`, `(`→`s2h`, `-`→`s2i`, `)`→`s2j`, `d`→`s2k`, `m`→`s2l`, `n`→`s2m`, `p`→`s38`, `u`→`s2n`, `w`→`s2o`, `.`→`s2p`, `x`→`s2q`, `|`→`s2r`, space→`s2r`, `q`→`2sr`, `h`→`2ss`. The handlers begin at line 851; the `s2r`/`2sr`/`2ss` slots (reached by the bar `|`, space, `q`, `h` glyphs) belong to note formation and are covered in the next section.

## `s2b`/`s2c`/`2sr`/`2ss`/`s2d`/`s2a` -- slur/legato value (lines 851-861)

```
s2b,	sett sv, 200000
	goto s2a
s2c,	sett sv, 400000
	goto s2a
2sr,	sett sv, 20000
	goto s2a
2ss,	sett sv, 40000
	goto s2a
s2d,	zero sv
s2a,	setpa si, 1
	goto s20
```

`sett A,B` loads the **literal** `B` into cell `A` (`lac (B; dac A`). Each of these handlers sets `sv` ("value of `ss` for particular note", line 1507) to a distinct bit pattern, then falls through to `s2a`. Note that `2sr` and `2ss` are *also* the `s2y` jump-table slots for the `q` and `h` glyphs (indices `0o23`/`0o24`); they share this code with the `s`/`l` dispatch but set the lower-order `sv` bits:

| Handler | Glyph(s) dispatching here | `sv` value (octal) | Interpretation (inferred) |
|---|---|---|---|
| `s2b` | `s` | `200000` | slur/legato status, variant 1 |
| `s2c` | `l` | `400000` | slur/legato status, variant 2 |
| `2sr` | `q` | `20000` | slur/legato status, variant 3 |
| `2ss` | `h` | `40000` | slur/legato status, variant 4 |
| `s2d` | `e` | `0` | clear (no slur/legato value) |

These are the `sle` (slur/legato/expression) status bits; `ss` holds the "running status of sle indicator" (line 1506) and `sv` its "value for particular note" (line 1507). The precise musical reading of each bit is inferred from the `sv`/`ss` comments and the consumed [note-word format](../../pdp1m13/docs/05-data-formats.md); document them as status flags rather than fixed musical meanings.

`s2a, setpa si, 1` -- **`setpa` is a likely retype slip for `stepa`** (the symbol dump shows `setpa` undefined; the intended macro is `stepa J,I => law I; add J; dac J`, adding the literal `I` to cell `J`). Read as `stepa si, 1`, it adds the literal `1` to `si` ("0/no sle in note; 1/sle", line 1548) -- recording that a slur/legato mark occurred in this note. `goto s20` returns to the dispatch loop for the next character.

## `s2e`/`s2f` -- staff relocation (lines 862-865)

```
s2e,	stepa sr, 14
	goto s20
s2f,	istepa sr, 14
	goto s20
```

`stepa sr, 14` (`law 14; add sr; dac sr`) adds the literal `14` octal (= 12 decimal) to the staff-relocation count `sr`. `istepa sr, 14` (`law i 14; add sr; dac sr`) adds the literal *negative* `14` -- i.e. subtracts `14` from `sr` (the `i` in `law i` loads the ones-complement of the operand). `sr` is "staff reloc. count" (line 1508). `s2e` is reached for the glyph `a` and `s2f` for the glyph `b` (per the `s2z`/`s2y` mapping above); the `14`-step magnitude and the direction (raise vs. lower the note's staff position by some interval) are inferred -- the comment does not pin the musical interval. `goto s20` loops.

## `s2g` -- triplet marker (lines 866-867)

```
s2g,	sett 3i, 100000
	goto s20
```

`s2g` is reached for the glyph `c`. `sett 3i, 100000` loads the literal `100000` octal into `3i` ("triplet ind.: 0/no, 100000/yes", line 1510). `100000` octal is the bit just below the sign bit set in an 18-bit word -- a high status bit copied later (at `s52`, next section: `move 3i, ccc`) into `ccc`, the "triplet status of last non-comma note" (line 1541). `goto s20` loops.

## `s2h`/`s2i`/`s24`/`s25` -- sharp / flat accidental (lines 868-876)

```
s2h,	testm aci, s24
	step1 acc
	goto s25
s2i,	testm aci, s24
	istepa acc, 1
s25,	sett aci, 1
	goto s20
s24,	complaint flexo nor
	goto s20
```

`s2h` (glyph `(`/`+`) and `s2i` (glyph `-`) handle the two accidental directions. `aci` is the accidental *indicator* (0 none, 1 sharp-or-flat, -1 natural; line 1511) and `acc` is the accidental *count* (line 1513).

`testm aci, s24` expands to `lac aci; spa; jmp s24` -- load `aci`, and jump to `s24` if `aci < 0` (the macro's stated sense; `spa` skips on positive-or-zero, so the `jmp` fires on minus). A negative `aci` means a *natural* was already seen for this note, which is contradictory with a sharp/flat, so it routes to the `s24` complaint.

If `aci` is non-negative:
- `s2h` does `step1 acc` (`idx acc`) -- increment the accidental count (one step in the `+`/`(` direction), then `goto s25`.
- `s2i` does `istepa acc, 1` (`law i 1; add acc; dac acc`) -- add literal `-1` to `acc` (one step in the `-` direction), then falls through to `s25`.

Both then reach `s25, sett aci, 1` -- record that a (signed) accidental of the sharp/flat kind is present (`aci = 1`). `goto s20` loops.

`s24, complaint flexo nor` -- `complaint` folds to the macro `compla`; the operand is `flexo nor`, the FIODEC-packed 3-character error mnemonic `nor`. `compla U => lac (U; jda er`: load the literal error-name word and call the error typer `er`. `nor` is plausibly a "not natural / natural conflict" mnemonic -- the diagnostic typed when a sharp/flat collides with an already-recorded natural. (The expansion of `flexo` into a packed FIODEC word, and the `er`/`tyo` typing path, are **not emulator-verified**: the emulator does not implement `tyo`, and `flexo`/`text` are original-assembler pseudo-ops the modern re-assembly lacks. `er` types in red ribbon via `call red` at line 571. The exact gloss of `nor` is inferred.)

## `s2j`/`s26`/`s27` -- natural accidental (lines 877-883)

```
s2j,	testel aci, (1, s26
s27,	sett aci, -1
	goto s20
s26,	complaint flexo nor
	zero acc
	goto s27
```

`s2j` (glyph `)`/`=`) handles the natural sign. `testel aci, (1, s26` expands to `lac aci; sad (1; jmp s26` -- load `aci`, and jump to `s26` if `aci = 1` (the literal `(1`). `aci = 1` means a sharp or flat was already recorded, which conflicts with a natural, so it routes to `s26`.

Otherwise `s27, sett aci, -1` loads the literal `-1` into `aci`, recording the **natural** indicator, then `goto s20` loops. (`sett A,B` assembles its literal as `lac (B`; the literal `-1` is the ones-complement of `1`, i.e. `777776` octal -- the distinct negative-magnitude value the `aci` comment calls "-1".)

`s26` is the conflict path: `complaint flexo nor` types the same `nor` diagnostic (sharp/flat-vs-natural conflict), `zero acc` (`dzm acc`) clears the accidental count, then `goto s27` falls into recording the natural anyway (`aci = -1`). So on conflict the program complains and lets the natural win. (Same not-emulator-verified caveats on the error path.)

## `s2k`..`s38` / `s28`/`s29` -- embellishment terminal letter (lines 885-900)

```
s2k,	load (1
	goto s28
s2l,	load (2
	goto s28
s2m,	load (3
	goto s28
s2n,	load (4
	goto s28
s2o,	load (5
	goto s28
s38,	load (6
s28,	store et
	test0 ete, s29
	complaint flexo tme
s29,	move et, ete
	goto s20
```

These six handlers select an **embellishment terminal** -- the kind of ornament and which neighbor tone it terminates on. Each `load (n` (`lac (n`) loads a literal selector into AC; the six selectors are reached from the embellishment-letter glyphs via the `s2z`/`s2y` dispatch. Mapping the glyphs to selectors:

| Glyph | `s2z` index | Handler | Selector loaded |
|---|---|---|---|
| `d` | 9 (0o11) | `s2k` | `1` |
| `m` | 10 (0o12) | `s2l` | `2` |
| `n` | 11 (0o13) | `s2m` | `3` |
| `p` | 12 (0o14) | `s38` | `6` |
| `u` | 13 (0o15) | `s2n` | `4` |
| `w` | 14 (0o16) | `s2o` | `5` |

Note `s38` (selector `6`, glyph `p`) is the `s2y` entry at index `0o14`, which is why it is named out-of-sequence among the `s2*` labels; it falls straight into `s28` without its own `goto`.

`s28, store et` (`dac et`) saves the selector in the embellishment-temp cell `et` (line 1514). `test0 ete, s29` expands to `lac ete; sza i; jmp s29` -- load the committed embellishment-terminal `ete`, and jump to `s29` if `ete = 0` (no embellishment committed yet). If `ete` is already non-zero, a second embellishment letter is being given for one note, so control falls through to `complaint flexo tme` -- the `tme` ("too many embellishments", gloss inferred) diagnostic (same not-emulator-verified error-path caveat). Whether or not it complained, `s29, move et, ete` (`lac et; dac ete`) copies the selector into `ete`, committing it, and `goto s20` loops.

The numeric selectors `1`-`6` index the parallel embellishment tables `ebl`/`ebd`/`ebe` (lines 1176-1186, listed in glyph order `d`,`m`,`n`,`u`,`w`,`p`) during note formation; see [the Scan-2 tables doc](14-scan2-tables.md).

## `s2p`/`s2q` -- fraction (dotted-note) adjustment (lines 902-904)

```
s2p,	step fu, fc
s2q,	halfof fc
	goto s20
```

`s2p` is reached for the period glyph `.` (`s2z` index `0o17` → `s2y[0o17]` = `s2p`). `step fu, fc` expands to `step J,I => lac fu; add fc; dac fu` -- add the current fraction increment `fc` into the accumulated fraction-used `fu`. (`fc` is "fraction status" and `fu` is "fraction used", lines 1491-1492; Scan 1 set `fc = tim/2` at `s1o`.) It then falls into `s2q, halfof fc` (`lac fc; sar 1s; dac fc`) -- halve `fc` (arithmetic shift right one place). This is the classic dotted-note arithmetic: each successive dot adds half of the previous addition (½, then ¼, ...), so `fu` accumulates `tim/2 + tim/4 + ...`. `goto s20` loops.

`s2q` is also a dispatch target in its own right: it is the `s2y` entry at index `0o20`, reached for the glyph `x` (`s2z` index `0o20`). Entered directly, it simply halves `fc` and loops, without first adding into `fu`. (The musical role of the bare-`x` halving is inferred.)

## What this accomplishes

Scan 2's dispatcher (`s2`-`s21`) rewinds the source-word reader, walks the word a second time, filters out the duration digits that Scan 1 already consumed, and routes every modifier glyph through the parallel `s2z`/`s2y` table pair to a one-line handler. Those handlers fold the symbolic ornamentation of the transcription DSL -- slur/legato bits (`sv`/`si`), staff relocation (`sr`), triplet membership (`3i`), accidentals (`aci`/`acc`, with the `nor` conflict diagnostic), embellishment-terminal selection (`et`/`ete`, with the `tme` guard), and dotted-note fractions (`fu`/`fc`) -- into a compact block of per-note state variables. No note word is emitted yet: this pass only *records intent*. The accumulated state is consumed by the note-forming continuation that begins at `s2r`, which combines the staff position, accidental, key signature (via the `nt`/`kt`/`mt` tone tables), and embellishment into the final pitch and timing of the compiled note.

Next: **note formation -- `s2r` through the tone-table lookups and embellishment expansion** (lines 906 onward), where `sv`/`si`/`aci`/`acc`/`ton`/`tne`/`ete` are turned into actual `not`-array note words.
