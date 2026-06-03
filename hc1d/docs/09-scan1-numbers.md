# Scan 1: lexing and number accumulation (`s1`-`s1d`)

Scan 1 is the Harmony Compiler's first pass over a single measure of one voice. It is a hand-written lexer: it consumes characters one at a time from the buffered measure text (via `rch`, the read-character routine), recognizes runs of decimal digits as *numbers*, counts the punctuation that decorates a note (`r`, `g`, comma, the fraction dot `.`), and on each token boundary dispatches to one of the higher-level handlers — `te` (terminator / end of measure-line), `pc` (a pseudo-command), `ps` (units still outstanding), or the bar-length check. The compiled note words this all eventually produces are the per-voice note stream consumed by *PDP-1 Music 13* (see [`../../pdp1m13/docs/05-data-formats.md`](../../pdp1m13/docs/05-data-formats.md)).

This file covers the lexer's *front* — state reset, the digit accumulator, the number-filing logic, and the punctuation classifier (`s1` through `s1d`, hc1d.mac lines 677-736), plus the token-boundary dispatcher `s18` (lines 738-748). The arithmetic that turns the lexed counts into a note's *time* (the `s1e`/`sli`/`te` machinery from line 750 on) is the subject of the next file.

This walkthrough assumes you have read the pdp1m13 docs and the hc1d primer. Core PDP-1 instruction semantics (`lac`/`dac`/`add`/`sub`/`idx`/`sad`/`sas`/`sma`/`spa`/`sza`/`ral`/`sar`, ones-complement, the `Ns` shift notation) are not re-taught here — see [`../../pdp1m13/docs/02-pdp1-primer.md`](../../pdp1m13/docs/02-pdp1-primer.md). All numbers are octal. The macro layer (`define ... termin`) is the Rosetta Stone for reading any line; the primer documents it in full, and expansions are repeated inline below as needed.

## The number model and fraction counters

Before the code, the data model that Scan 1 builds:

- A note's textual form carries up to **two decimal numbers**. The first is filed into **`n1`**, the second (if any) into **`n2`**. `ucd` ("number of numeric fields read") counts how many numbers the token contained; the lexer uses `ucd` to decide whether the *next* number it completes is the first or the last. The comments at lines 1487-1488 name them: `n1` = "first number", `n2` = "last number of 1 or 2".
- **`num`** is the value of the number currently being accumulated, digit by digit. **`dig`** holds the single digit value just read (line 1505, "digit read").
- **`fc`/`fu`** are the fraction status / fraction-used pair (lines 1491-1492). `s1` seeds `fc=40`, `fu=100`; the fraction dot `.` and the letter `x` halve/copy these to scale a note's duration by powers of two. (The musical meaning — that these are binary fractions of a beat — is inferred from the names and the halving operation; the time arithmetic that consumes them lives in the next section.)
- **`ldl`** ("preceding char. numeric? 1/yes, 0/no", line 1484) is the lexer's one-bit memory of whether the previous character was a digit, so it can detect the digit→non-digit edge that ends a number.
- **`psi`** counts every character in the token; **`chi`** counts the non-numeric characters; **`g`/`r`/`cm`** count the articulation letters `g`, `r`, and commas.

These are all per-measure-line scratch cells in the temp block (lines 1484-1503), and `s1` is precisely where they are cleared.

## `s1` — reset the per-line lexer state (lines 677-686)

```
s1,	zero ldl
	zero ucd
	zero num
	zero psi
	zero chi
	zero g
	zero r
	zero cm
	sett fc, 40
	sett fu, 100
```

`zero X` expands to `dzm X` (deposit zero into memory) — see the primer. So the first eight lines clear, in order: the previous-char-numeric flag (`ldl`), the numeric-field count (`ucd`), the running number value (`num`), the total char count (`psi`), the non-numeric char count (`chi`), and the three punctuation counters `g`/`r`/`cm`.

`sett fc, 40` expands to `lac (40` / `dac fc` — load the **literal** `40` and store it into `fc`; likewise `sett fu, 100` stores the literal `100` into `fu`. (`sett A,B` loads constant `B` into `A`; note this is *not* `move`, which copies a cell.) These two are the initial fraction state from which `.` and `x` derive scaled durations.

`s1` is also the place control returns to after a complete measure-line has been processed: `te` ends with paths that fall back through `s1` to start the next line (line 1193, `te, test0 trm, s1`), so this reset runs once per line.

## `s10`-`s14` — read a char and accumulate digits (lines 688-702)

```
s10,	call rch
	store chr
	trze s11
	tgrec 20, s11
```

`call rch` expands to `jda rch` — jump-and-deposit-AC into `rch`, which is hc1d's "get next character" subroutine. `rch` (line 483, `rch, answer rcx`) returns the next character of the buffered measure text in AC (it also handles tape reading, comment stripping, and the `end`-counter logic; see its own walkthrough). `store chr` (`dac chr`) saves the returned character.

`trze s11` expands to `sza i` / `jmp s11`: jump to `s11` **if AC = 0**. A returned character of `00` is the FIODEC `space` (per the `s2z` table comment at line 1165), so a space immediately ends the current token and falls through to the non-numeric path at `s11`.

`tgrec 20, s11` is the digit test. The macro expands to:

```
	sub (20		/ AC := AC - literal 20
	sma+sza-skp	/ combined skip: fires on (AC<0) OR (AC=0)
	jmp s11
```

`tgrec C,T` means "jump to `T` if AC **>** literal `C`" (the why: the combined `sma+sza-skp` skip-microcode fires on minus-OR-zero, so the `jmp` is taken only when neither holds, i.e. AC > C). Here `C = 20`. The FIODEC encodings of the decimal digits occupy a low range (in FIODEC, digit `0` is code `20` and digits `1`-`9` are codes `01`-`11`), so a character code **≤ 20** is treated as a digit and a code **> 20** as something else. Thus: if `chr > 20` it is not a digit → go to `s11`; otherwise fall through and treat it as a digit. (That the digit glyphs sit at codes ≤ 20 is inferred from this test plus the letter/punctuation codes being ≥ 21; the supplied character table marks the exact digit codes as not pinned down in source comments.)

```
s12,	step1 psi
	test1 ldl, s13
	sett ldl, 1
s13,	testnl chr, (20, s14
	clear
s14,	store dig
	load num
	x10dec
	addi dig
	store num
	goto s10
```

`step1 psi` (`idx psi`) bumps the character count — every character, digit or not, increments `psi` here in the digit path (the non-numeric path bumps it separately at `s15`).

`test1 ldl, s13` expands to `lac ldl` / `sza` / `jmp s13`: load `ldl`, jump to `s13` **if `ldl ≠ 0`**, i.e. if the previous character was already a digit. If `ldl` was 0 (this is the *first* digit of a number) we fall through to `sett ldl, 1` (`lac (1` / `dac ldl`) to record "we are now inside a number," then continue at `s13`.

`testnl chr, (20, s14` expands to `lac chr` / `sas (20` / `jmp s14`: load `chr`, **skip if AC = literal 20**, otherwise `jmp s14`. So the `jmp s14` is taken whenever `chr ≠ 20` (the macro `testnl Y,Z,A` = "jump if Y ≠ C(Z)"; with `(20` the comparand is the literal 20). The single character whose code equals `20` is treated specially: when `chr = 20` the skip fires, the `jmp` is *not* taken, and control reaches `clear` (`cla`) which zeroes AC before storing it as the digit. In effect code `20` contributes digit value 0, while every other digit code `< 20` contributes its own low value. (Inferred: this maps the FIODEC encoding of the printed digit glyphs onto numeric values, with FIODEC `20` — the glyph `0` — standing in for digit value 0.)

`s14, store dig` (`dac dig`) saves the digit value (either `chr` itself, falling through from `s13`, or 0 from the `clear` path). Then the running decimal accumulate:

```
	load num	/ lac num
	x10dec
	addi dig	/ add dig
	store num	/ dac num
```

`x10dec` is the decimal-shift helper. It expands to:

```
	ral 1s		/ rotate AC left 1  (≈ ×2)
	dac t1		/ stash ×2 copy
	ral 2s		/ rotate left 2 more (the ×2 copy is now ≈ ×8)
	add t1		/ ×8 + ×2 = ×10
```

so it multiplies the running `num` by ten (the `ral`/rotate stands in for a true shift; for the small positive magnitudes of a music field this realizes `num × 10`). `addi dig` (`add dig`) adds the new low-order digit, and `store num` writes the accumulated value back. Then `goto s10` (`jmp s10`) loops to read the next character. This is the classic "`num = num*10 + digit`" decimal-input loop, built entirely from rotates and one add.

## `s11`-`s16` — file a completed number into `n1` or `n2` (lines 704-713)

Reached when `rch` returned a non-digit (space, terminator, or punctuation) after we may have been accumulating digits.

```
s11,	test0 ldl, s15
	zero ldl
	test0 ucd, s17
	tgrec 1, s16
	move num, n2
	goto s16
s17,	move num, n1
	store n2
	zero num
s16,	step1 ucd
```

`test0 ldl, s15` expands to `lac ldl` / `sza i` / `jmp s15`: jump to `s15` **if `ldl = 0`**. If the previous character was *not* a digit, there is no pending number to file, so skip straight to the punctuation classifier `s15`. Otherwise we just crossed a digit→non-digit edge and a number in `num` must be filed.

`zero ldl` (`dzm ldl`) clears the "inside a number" flag.

`test0 ucd, s17` jumps to `s17` if `ucd = 0` (no numbers filed yet — this is the **first** number). `tgrec 1, s16` then jumps to `s16` if `ucd > 1` (more than one number already filed — extra numbers are silently dropped, only their count bumps). The middle case (`ucd = 1`, exactly one number already filed) falls through to `move num, n2` (`lac num` / `dac n2`; i.e. copy `num` into `n2`), filing this as the **second** number, then `goto s16`.

`s17` (first number): `move num, n1` copies `num` into `n1`, then `store n2` (`dac n2`) *also* stores the same value into `n2` (AC still holds `num` after the `dac n1`) — so when there is only one number, `n1` and `n2` are equal. `zero num` resets the accumulator for any following number.

`s16, step1 ucd` (`idx ucd`) increments the numeric-field count. Control falls through into `s15`.

The why: a note with one number ends up with `n1 = n2`; a note with two numbers ends up with `n1` = first, `n2` = second. `ucd` records how many fields appeared, and `n1`/`n2` give the lexer a uniform two-slot view regardless. The exact musical interpretation of the two numbers (pitch-degree vs. duration-units, etc.) is resolved later in Scan 2; here they are purely lexical slots.

## `s15`-`s1d` — classify the non-numeric character (lines 715-736)

```
s15,	test0 chr, s18
	trel (21, s18
	step1 chi
	step1 psi
	load chr
	ftrel (73, s19
	ftrel (27, s1a
	ftrel (51, s1b
	ftrel (67, s1c
	trel (33, s1d
	goto s10
```

`test0 chr, s18` jumps to `s18` (the token-boundary dispatcher) **if `chr = 0`** — a `space` (code `00`) ends the token. `trel (21, s18` expands to `sad (21` / `jmp s18`: jump to `s18` **if AC = literal 21**; code `21` is the FIODEC vertical bar `|`, the measure separator (confirmed by the `s2z` comment at line 1164), which likewise ends a token. Both of these tests read AC directly: `test0 chr` performs `lac chr`, so if it does not jump AC still holds `chr`, and the `trel (21` then compares that against the literal 21.

If the character is neither space nor bar, it is punctuation *inside* a note. `step1 chi` (`idx chi`) counts it as a non-numeric character and `step1 psi` (`idx psi`) counts it in the total. `load chr` (`lac chr`) then reloads the character into AC for the cascade of equality tests — this reload is **necessary**, not cosmetic: `idx` is a read-modify-write that leaves the *incremented* memory value in AC (verified in the emulator, `src/pdp1/cpu.ts` `idx` case sets `AC := C(ma) + 1`), so the two preceding `step1` operations have clobbered AC with the new value of `psi`.

The cascade uses `ftrel A,T` (an alias of `trel A,T` = `sad A` / `jmp T`, "jump if AC = C(A)") and one bare `trel`:

| Source line | Test | Code | Branch | Meaning |
|---|---|---|---|---|
| `ftrel (73, s19` | AC = `73` | `73` | `s19` | `.` period → fraction marker |
| `ftrel (27, s1a` | AC = `27` | `27` | `s1a` | `x` |
| `ftrel (51, s1b` | AC = `51` | `51` | `s1b` | `r` → count in `r` |
| `ftrel (67, s1c` | AC = `67` | `67` | `s1c` | (FIODEC `67`, glyph not pinned down) → count in `g` |
| `trel (33, s1d`  | AC = `33` | `33` | `s1d` | (FIODEC `33`, glyph not pinned down) → count comma in `cm` |
| `goto s10`       | — | — | `s10` | unrecognized punctuation: ignore, read next char |

Code `73` (period), `51` (`r`), and `27` (`x`) are confirmed: `73` and `27` appear with those glosses in the `s2z` table (lines 1162-1163), and `51` decodes as `r` in the pseudo-name strings (e.g. `pnb` = "rest" = `51 65 22 23`, line 1265). Codes `67`→`g` and `33`→comma are **inferred** purely from the counters they feed (`g` and `cm`); neither glyph is pinned down in the source comments, so treat the glyph identification as inferred. Any character not matching falls through to `goto s10`, re-entering the read loop (the punctuation is counted in `chi`/`psi` but otherwise ignored).

## `s19`/`s1a` — fraction handling (lines 727-729)

```
s19,	move fc, fu
s1a,	halfof fc
	goto s10
```

`s19` (the period `.`): `move fc, fu` expands to `lac fc` / `dac fu` — copy the current fraction-status `fc` into `fu` ("fraction used"). It then **falls through** into `s1a`.

`s1a` (the letter `x`, and the fall-through target of `s19`): `halfof fc` expands to `lac fc` / `sar 1s` / `dac fc` — load `fc`, arithmetic-shift right by 1 (halve it, sign-preserving), store back. So each `.` records the current fraction level into `fu` *and* halves `fc`, while each `x` only halves `fc`. `goto s10` returns to the read loop.

The why (inferred from the names and the halving): `fc` is a binary fraction that starts at `40` and is repeatedly halved, modeling successive dotting / subdivision of a note's value; `fu` snapshots the level at which the dot occurred so the time computation can add the dotted increment. The precise duration arithmetic is in the next section; here Scan 1 only maintains the two counters.

## `s1b`/`s1c`/`s1d` — punctuation counters (lines 731-736)

```
s1b,	step1 r
	goto s10
s1c,	step1 g
	goto s10
s1d,	step1 cm
	goto s10
```

Three one-line counters: `step1 r`/`step1 g`/`step1 cm` each expand to `idx` of the respective cell (`r` counts `r`'s, `g` counts `g`'s, `cm` counts commas), then `goto s10` (`jmp s10`) returns to the read loop. These counts are consumed at `s1e`/`sli` (next section) to set the note's left/right articulation indicators (`lt`/`rt`) and to flag over-count complaints (`tmr`/`tmg`/`tmc` at lines 753/757/761).

## `s18` — token-boundary dispatch (lines 738-748)

Reached when a space or bar ended a token (from `s10`'s `trze s11` → … or directly from `s15`).

```
s18,	step1 tc
	move chr, trm
	test0 psi, te
	load ucd
	addi cm
	trze pc
	test1 chi, s1e
	test1 ao, ps
	testel n1, tbc, te
	complaint flexo bbl
	goto te
```

`step1 tc` (`idx tc`) increments the terminator count within the measure (`tc`, line 1503). `move chr, trm` (`lac chr` / `dac trm`) saves the terminating character into `trm` so downstream code knows *which* terminator (space vs. `|`) closed the token.

`test0 psi, te` expands to `lac psi` / `sza i` / `jmp te`: if `psi = 0` (the token was **empty** — no characters at all between terminators) jump to `te`, the terminator handler. An empty token is just a separator with nothing in it, so there is no note to form.

The pseudo-command test:

```
	load ucd	/ lac ucd
	addi cm		/ add cm
	trze pc		/ sza i ; jmp pc  → jump if (ucd + cm) = 0
```

`load ucd` / `addi cm` forms `ucd + cm` (numbers seen + commas seen). `trze pc` jumps to `pc` **if that sum is zero** — i.e. the token contained **no numbers and no commas**, which is the signature of a *pseudo-command* (a word like `bass`, `key`, `tempo`, `rest`; the pseudo-command names live in the `pn1`..`pnh` strings at lines 1255-1271 and dispatch through `pc`/`pcd`). The why: a real note always carries at least a number or a comma, so a purely alphabetic token must be a pseudo.

```
	test1 chi, s1e	/ lac chi ; sza ; jmp s1e  → jump if chi != 0
```

`test1 chi, s1e` jumps to `s1e` **if `chi ≠ 0`** — the token had non-numeric characters (articulation letters / punctuation), so it is a decorated note: hand off to the articulation/time logic at `s1e` (next section). Otherwise the token was purely numeric.

```
	test1 ao, ps	/ lac ao ; sza ; jmp ps  → jump if ao != 0
```

`test1 ao, ps` jumps to `ps` **if `ao ≠ 0`** — `ao` is "arguments outstanding" (line 1500), the count of numeric arguments a pseudo-command is still waiting to consume. If a prior pseudo set up outstanding arguments, this bare number is one of them, so route to `ps`.

```
	testel n1, tbc, te	/ lac n1 ; sad tbc ; jmp te  → jump if n1 = C(tbc)
	complaint flexo bbl
	goto te
```

`testel n1, tbc, te` expands to `lac n1` / `sad tbc` / `jmp te`: jump to `te` **if `n1 = C(tbc)`**. `tbc` is the running "bar count within tape" (line 1502). A bare number standing alone (no letters, no outstanding pseudo args) is interpreted as a **bar-number annotation**; if it matches the expected bar count it is correct and we proceed to `te`. If it does *not* match, control falls to `complaint flexo bbl`. (The bar-number interpretation is inferred from the `tbc` comment and the test structure.)

`complaint flexo bbl` is the `compla U` macro applied to the argument `flexo bbl`. (`complaint` folds to the 6-char macro name `compla`; see the primer's case/length rule.) `flexo` is one of the original assembler's pseudo-ops the modern macro/macro1 reassembly lacks — it packs the 3-character FIODEC code `bbl` into a single literal word. The macro therefore expands to `lac (flexo bbl` / `jda er`: load that packed error-code constant and call the non-fatal error typer `er`. **(Not emulator-verified: `er` calls `red` (line 599) and emits `tyo`/ribbon-shift IOTs to type the diagnostic on the Flexowriter — `red` types FIODEC `35`, the red-ribbon shift, so the message prints in red. The TS emulator implements none of these I/O IOTs, and the FIODEC ribbon-shift behavior is historical/inferred.)** `goto te` (`jmp te`) then proceeds to the terminator handler anyway — a wrong bar number is a warning, not fatal. The `bbl` mnemonic ("bad bar line" / bar-number mismatch) is inferred from context.

## What this accomplishes

Scan 1's front end (`s1`-`s1d`, plus the `s18` dispatcher) is a complete character-driven lexer for one measure-line of one voice. It resets per-line state (`s1`), pulls characters from `rch`, accumulates decimal numbers with a rotate-based ×10 loop into `num` and files them into the two-slot model `n1`/`n2` keyed by `ucd` (`s10`-`s16`), classifies and counts the articulation punctuation `.`/`x`/`r`/`g`/comma while maintaining the binary fraction counters `fc`/`fu` (`s15`-`s1d`), and at every token boundary (`s18`) decides what kind of token it just read: an empty separator or terminator (`te`), a pseudo-command (`pc`, when no numbers and no commas), a pseudo argument (`ps`, when arguments are outstanding), a decorated note (`s1e`), or a bare bar-number that it checks against `tbc` and warns about with a `bbl` complaint on mismatch.

What it deliberately leaves undone is the *meaning*: it has gathered raw counts (`n1`, `n2`, `g`, `r`, `cm`, `fc`, `fu`, `psi`, `chi`, `tc`) but has not yet computed a note's time value or articulation indicators. That timing arithmetic — `s1e` resolving the `r`/`g`/comma counts into `lt`/`rt` and feeding `tim`, and the path through `sli`/`te` into note formation — is the subject of the next file, [`10-scan1-timing.md`](10-scan1-timing.md).
