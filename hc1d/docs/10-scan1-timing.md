# Scan 1: fraction, triplet and rest timing (`s1e`-`s1o`)

> Assumes you have read the [PDP-1 primer](../../pdp1m13/docs/02-pdp1-primer.md) and the [intermediate-tape format](../../pdp1m13/docs/05-data-formats.md). All numbers are **octal**. Macro calls are expanded to their bare PDP-1 instructions; see the macro glossary for the full table. Per the assembler note, sections are headlined by **symbolic label + `hc1d.mac` line range**, not octal address.

This is the back half of **Scan 1** (`s1`), the lexical/timing pass over one Flexowriter "word" (a run of characters terminated by a separator). The front half (`s10`-`s18`, lines 688-748) has already walked the characters of the word, counting:

- `ucd` -- number of numeric fields seen, with their values landing in `n1` (first) and `n2` (last);
- `psi` -- total character count, `chi` -- non-numeric character count;
- `g`, `r`, `cm` -- counts of the characters `g` (FIODEC `67`, grounded by the `ftrel (67, s1c` dispatch -> `step1 g`), `r` (`51`) and `,` (comma, `33`);
- `fc` (fraction status, seeded `40`) and `fu` (fraction used, seeded `100`); each `.` (period, FIODEC `73`) or `x` (`27`) -- the duration-fraction marks -- halves `fc` (a `.` first copies `fc` into `fu`). (That halving lives at `s19`/`s1a`, lines 727-729.)

By the time we reach `s1e`, `s18` (lines 738-748) has stored the terminator (`trm`), bumped the in-measure terminator count `tc`, and routed empty words (`psi=0`) to `te`, pseudo-commands (`ucd+cm=0` test, `trze pc`) to `pc`, and argument-bearing words (`ao != 0`) to `ps`. The path that **falls through to `s1e`** is a *note* (or rest): `chi != 0` (`test1 chi, s1e`, line 744). From here the routine turns the parsed letter/number/comma counts into a single **duration value** `fc` and two positional indicators `rt`/`lt`, then jumps to Scan 2 (`s2`).

> **RISK REGION.** This is the timing engine. The arithmetic below is one's-complement (negate = bitwise NOT; a distinct `-0 = 777777` exists) -- see the primer's [machine model](../../pdp1m13/docs/02-pdp1-primer.md#the-machine-model). The mapping from these counts to *musical* durations (whole/half/quarter, triplets, dotted notes) is **inferred** from variable names and the resulting note-word fields; it is flagged as such throughout. What is *certain* is the bit arithmetic and which cells are written.

---

## `s1e`/`s1f`/`s1g` -- "too many" guards on `r`, `g`, `,` (lines 750-762)

```
s1e,	zero ao
	load r
	tlesc 2, s1f
	complaint flexo tmr
	sett r, 1
s1f,	load g
	tlesc 2, s1g
	complaint flexo tmg
	sett g, 1
s1g,	load cm
	tlesc 2, s1h
	complaint flexo tmc
	sett cm, 1
```

`zero ao` expands to `dzm ao` -- clear *arguments outstanding* (`ao` is the pseudo-command argument counter, owned by `ps`; a note word leaves no arguments pending). Then three identical guards clamp the three character counts to at most 1:

- `load r` = `lac r`; `tlesc 2, s1f` expands to `sub (2`; `spa`; `jmp s1f` -- subtract the **literal** `2` and jump to `s1f` if the result is *minus*, i.e. **if `r < 2`**. So a legal note has at most one `r`.
- If `r >= 2` we fall through to `complaint flexo tmr` = `lac (flexo tmr; jda er`. The `flexo tmr` operand is the assembler's **`flexo` pseudo-op** (not emulator-verified -- a MACRO text feature the macro/macro1 reimplementation lacks): it packs the three FIODEC characters `t`,`m`,`r` into one 18-bit word that `er` later types via `print arg` (three `rcl 6s; tyo`, at `ec1`, line 618 -- not emulator-verified). The mnemonic reads **"too many r"** (inferred from the pattern of `tm*` codes: `tmr`/`tmg`/`tmc`/`tmf`/`tme`/`tms`).
- `compla`/`complaint` is the **complaint** path (`jda er`): `er` types the message and **returns** -- there is no halt. As opposed to `error`/`er1`, a complaint types in normal (black) ribbon and the code then recovers inline. After complaining, `sett r, 1` (`lac (1; dac r`) **clamps `r` to 1** and execution continues -- the compiler recovers and keeps going.

`s1f` and `s1g` do the same for `g` (complaint `tmg`, "too many g") and `cm` (complaint `tmc`, "too many commas"). After this block, each of `r`, `g`, `cm` is `0` or `1`.

> *Musical roles (now confirmed by the spec, [*MusicCompiler-a.pdf*](../prs-docs/MusicCompiler-a.pdf)):* `r` is the **rest** token — "a rest may be expressed by the letter `r` and a duration number" (p. 2 §I.B.2); `g` is the **grace note** marker — "the letter `g` … marks it as a grace note … if a time is not specified, a thirty-second note will be compiled" (p. 7 §I.B.8), which is why `rt==1` forces a small fixed `tim` at `s1l`; and `,` is the **copy-previous-note** comma — "a comma … to copy the previous note exactly … [or, with `r`/a pitch number] copy only the duration from the previous note" (p. 2 §I.B.3). The three "too many" caps `tmr`/`tmg`/`tmc` below are the spec's "one `r`/`g`/comma per note" rules. The clamps to ≤1 and the codes are the error table's `tmr`/`tmg`/`tmc` ([*MusicCompiler-b.pdf*](../prs-docs/MusicCompiler-b.pdf), p. 11).

---

## `s1h` -- classify the right side; set `rt` (lines 764-782, plus `s1s`/`s1t`/`sli`)

```
s1h,	load cm
	addi r
	addi ucd
	tgrec 2, s1y
	test1 cm,s1s
	load r
	addi g
	addi ucd
	subt (2
	trmi s1x
	trnz s1t
	test0 g, s1t
	sett rt, 1
	goto sli
```

First, a sanity ceiling on the whole word:

- `load cm; addi r; addi ucd` = `lac cm; add r; add ucd` -- AC := `cm + r + ucd` (commas + r's + number-of-numeric-fields).
- `tgrec 2, s1y` expands to `sub (2`; `sma+sza-skp`; `jmp s1y`. The combined skip `sma+sza-skp` fires on **minus OR zero** of `(AC - 2)`, so the jump is taken when `AC - 2 > 0`, i.e. **`cm+r+ucd > 2`**. That goes to `s1y`/`s1z` -> `error flexo tmf` ("too many fields", inferred), which types in **red** (severe) and then `goto te` -- the malformed word is **abandoned**, but the machine does not halt. A note may carry at most two such tokens.

Then it decides the **right indicator** `rt` (per the source comment at line 1496: `0/num, 1/g, 2/cm`):

- `test1 cm, s1s` = `lac cm; sza; jmp s1s` -- if `cm != 0` jump to `s1s`, which does `sett rt, 2` (`rt := 2`, "right side is a comma") and falls into `sli`.
- Otherwise compute `r + g + ucd - 2`: `load r; addi g; addi ucd; subt (2` -> AC := `r + g + ucd - 2`.
  - `trmi s1x` = `spa; jmp s1x` -- jump if AC is **minus**, i.e. `r+g+ucd < 2`: too few tokens, route to `s1x` (`error flexo tff`, "too few fields", inferred -- red ribbon, then `goto te`).
  - `trnz s1t` = `sza; jmp s1t` -- jump if AC **!= 0**, i.e. `r+g+ucd > 2`: that case is handled as "no right indicator" at `s1t`.
  - `test0 g, s1t` = `lac g; sza i; jmp s1t` -- jump if `g == 0` (also "no right indicator").
  - Falling through (AC was exactly `0` *and* `g != 0`): `sett rt, 1` (`rt := 1`, "right side is a `g`"), then `goto sli`.

```
s1s,	sett rt, 2
	goto sli
s1t,	zero rt
sli,	...
```

`s1t` sets `rt := 0` ("right side is a plain number"). All three branches converge at `sli`. So after `s1h`: `rt` is `2` (comma on the right), `1` (a `g` and exactly the right token count), or `0` (a number).

> *Inferred:* `rt` records what kind of token terminates the *right* of the note's duration spec -- a bare number, a grace/embellishment letter `g`, or a comma introducing a second number. Scan 2 uses `rt`/`lt` to interpret the duration. The exact musical reading (e.g. dotted vs. tied) is inferred and is resolved downstream.

---

## `sli`/`s1k`/`sk1`/`s1j` -- left indicator `lt`, and the rest patch (lines 783-797)

```
sli,	test1 r, s1k
	test1 ucd, s1j
	load (2
	goto s1l
s1j,	clear
	goto s1l
s1k,	test1 sid, sk1
	load nld	/from nl, 2006/02/26  --prs.
	lookup not
	band (117777
	addi (400000
	store t1
	load nld	/from nl, 2006/02/26  --prs.
	putback not, t1
sk1,	load (1
s1l,	store lt
```

`sli` decides the **left indicator** `lt` and handles the rest special case. The value destined for `lt` is staged in AC across the branches and finally stored at `s1l` (`dac lt`).

- `test1 r, s1k` = `lac r; sza; jmp s1k` -- if `r != 0`, this word is a **rest** (the `r` token), jump to `s1k`.
- No `r`: `test1 ucd, s1j` = `lac ucd; sza; jmp s1j` -- if there were any numeric fields, jump to `s1j` which does `clear` (`cla`, AC := 0) so `lt := 0` ("left = number"). With no numbers, fall through to `load (2` so `lt := 2` ("left = comma", per the `lt` comment at line 1497: `0/num, 1/r, 2/cm`). Both reach `s1l`.

The **rest patch** at `s1k` edits the *previous* note word in place:

- `test1 sid, sk1` = `lac sid; sza; jmp sk1` -- `sid` is "si delayed" (the prior note's sustained-note indicator, owned by Scan 2; comment line 1539). If `sid != 0`, **skip the patch** and go straight to `sk1`; the prior note was already sustained, so there is nothing to convert.
- Otherwise patch the note at `nld` ("nl delayed" -- the *previous* note's index into the `not` array; the comment notes it was changed from `nl` in 2006):
  - `load nld; lookup not` -- `lac nld` then `lookup not` = `add (not; dap .+1; lac` (indexed load): AC := `not[nld]`, the previously-emitted note word. This is self-modifying: `lookup` writes the composed address `nld+not` into the very next `lac`.
  - `band (117777` = `and (117777` -- mask. Octal `117777` is `001 001 111 111 111 111`, i.e. it **clears bits 0, 1, 3, 4** (the four articulation bits, per the note-word layout) while keeping bit 2 (triplet) and all of pitch (bits 5-10) and duration (bits 11-17).
  - `addi (400000` = `add (400000` -- set **bit 0**. Bit 0 is the *top* of the 4-bit articulation index (note bits `{0,1,3,4}`, split across the consumer's two `rcl 2s` extractions). With bits 1, 3, 4 just cleared, the articulation index becomes `1000` binary = `8`, which selects the `cla`/**legato** entry of the consumer's `cxt` table (full duration sounds, no release) -- see the note-word layout and articulation dispatch in [05-data-formats.md §2](../../pdp1m13/docs/05-data-formats.md#2-the-per-voice-note-word). (The articulation-bit split is the *inferred* part of that layout; the bit-clear/set here is exact.) Note that bit 0 alone (`4xxxxx`) is **not** a top-three-bits tag like the bar-line word `600000` (`te0`, line 1210) or a tempo word `700000` (`pha`, line 1348) -- the consumer classifies those by their top 3 bits and treats a `4xxxxx` word as an ordinary note.
  - `store t1; load nld; putback not, t1` -- `putback not, t1` = `add (not; dap .+2; lac t1; dac` (indexed store, again self-modifying via `dap .+2`): write the modified word back to `not[nld]`. (`nld` is reloaded because `lookup`/the intervening ops clobbered AC.)
- `sk1, load (1` -- `lt := 1` ("left = r", the rest case).

So a rest reaches back and rewrites the **previous** `not` word's articulation to legato (no release), leaving its pitch, triplet flag and duration intact.

> *Inferred:* a rest in this DSL evidently attaches to the trailing duration of the preceding note slot; forcing the previous note to legato lets it sound through to where the rest begins (the consumer never splits a real note into sound+release when the articulation index selects `cla`; see [05 §2](../../pdp1m13/docs/05-data-formats.md#2-the-per-voice-note-word)). The precise pitch handling of the rest itself is decided in Scan 2; here only the *previous* duration-bearing word is touched.

---

## `s1l`/`s1m`/`s1n` -- seed the running time `tim` (lines 798-811)

```
s1l,	store lt
	test0 rt, s1n
	tgrec 1, s1m
	sett tim, 2
	goto s1o
s1m,	testm tim, s1w
	goto s1o
s1n,	sett tim, 100
	sett t2, 1
	move n2, t1
	trze s1v
	tgrec 100, s1v
```

`s1l` stores `lt` (AC still holds the left-indicator value chosen above) and branches on `rt`:

- `test0 rt, s1n` = `lac rt; sza i; jmp s1n` -- if `rt == 0` (right side is a plain number) jump to `s1n`, the normal numeric-duration path.
- Otherwise (`rt` is `1` or `2`, a `g` or comma on the right): AC currently holds `rt`. `tgrec 1, s1m` = `sub (1`; `sma+sza-skp`; `jmp s1m` -- jump to `s1m` if `rt - 1 > 0`, i.e. **`rt == 2`** (comma). For `rt == 1` (`g`) fall through to `sett tim, 2` (`tim := 2`) and `goto s1o`.
  - `s1m, testm tim, s1w` = `lac tim; spa; jmp s1w` -- if the *current* `tim` is **minus**, route to `s1w` (`error flexo unc` — **`unc` = "unprepared comma (no note before it) → note ignored"** per Samson's error table, [*MusicCompiler-b.pdf*](../prs-docs/MusicCompiler-b.pdf), p. 11 — red ribbon, then `goto te`); otherwise `goto s1o` keeping the existing `tim`. (This branch handles a comma-terminated note: a comma copies the previous note's duration, so a comma with no valid prior time `tim` is an "unprepared comma".)

`s1n` is the **normal triplet/fraction setup**:

- `sett tim, 100` -- `tim := 100` (octal `100` = `64` decimal). This is the **base time unit**: a whole denominator of `100` (64) sixty-fourths, matching the consumer's "duration in 64ths" field. (Inferred: `100`/octal = a whole note measured in 64ths; the `40` seed of `fc` in `s1` is half of that.)
- `sett t2, 1` -- `t2 := 1` (the power-of-two accumulator for the halving loop below).
- `move n2, t1` = `lac n2; dac t1` -- copy the **last numeric field** `n2` into `t1` (the requested denominator, e.g. the `4` in a quarter note). AC is left holding `n2`.
- `trze s1v` = `sza i; jmp s1v` -- if `n2 == 0`, route to `s1v` (`error flexo ert`, inferred): a zero denominator is illegal.
- `tgrec 100, s1v` = `sub (100`; `sma+sza-skp`; `jmp s1v` -- error if `n2 - 100 > 0`, i.e. **`n2 > 64`** (`100` octal): the denominator must not exceed the `100`/64 base. (AC is left as `n2-100` here but is reloaded in the loop.)

> *Inferred musical model:* `tim` is the **numerator of the note's duration as a fraction of `100`/64ths**. For a plain number `n2` the loop below divides `100` down to `100/n2` (so `n2=4` -> a quarter note = `100/4 = 20` = 16/64). A `g` (grace) forces `tim := 2` (a very short fixed grace duration). The `fc`/`fu` fraction status (halved by `.` and `x`) folds in as a multiplier. These mappings are inferred from the names and the resulting note-word duration field; the bit math is exact.

---

## `s1q`/`s1p` -- the halving loop (lines 813-822)

```
s1q,	halfof t1
	trze s1p
	halfof tim
	halfof fu
	double t2
	goto s1q

s1p,	testnl n2, t2, s1v
	test1 fu, s1o
	complaint flexo dtu
```

This is a **bit-by-bit division of the base time by the denominator** `t1` (= `n2`), accumulating a power-of-two scale in `t2` and dividing `tim`/`fu` in step:

- `halfof t1` = `lac t1; sar 1s; dac t1` -- `t1 := t1 >> 1` (arithmetic shift right by 1; sign-preserving). Each pass strips one low bit from the denominator.
- `trze s1p` = `sza i; jmp s1p` -- when `t1` reaches `0`, the division has consumed all the denominator's bits; exit to `s1p`. (AC holds the just-shifted `t1`.)
- `halfof tim` -- `tim := tim >> 1`: halve the numerator's time once per halving of the denominator.
- `halfof fu` -- `fu := fu >> 1`: halve the fraction-used scale in lock step (so a `.` or `x` in the source, which pre-halved `fc`/`fu`, composes correctly).
- `double t2` = `lac t2; ral 1s; dac t2` -- `t2 := t2 << 1` (rotate AC left by 1; for a positive small value this is x2). `t2` accumulates the power of two corresponding to the number of halvings.
- `goto s1q` -- repeat.

The loop assumes `t1` (the denominator) is a **power of two**: each iteration both halves `t1` and halves `tim`, so after `k` iterations `t1 = n2 >> k` and `tim = 100 >> k`. When `t1` hits `0`, `t2 = 2^k`. The post-check verifies the denominator really *was* a clean power of two:

- `s1p, testnl n2, t2, s1v` = `lac n2; sas t2; jmp s1v` -- `sas` skips iff `AC == C(t2)`; the macro therefore jumps when **`n2 != t2`**. If the reconstructed power of two `t2` does not equal the original `n2`, the denominator was not a power of two -> error `s1v` (`ert`, red ribbon, `goto te`).
- `test1 fu, s1o` = `lac fu; sza; jmp s1o` -- if `fu != 0` (the fraction scale did not underflow to zero during the halving), the result is valid: `goto s1o`.
- Otherwise fall through to `complaint flexo dtu` = `lac (flexo dtu; jda er` -- the **`dtu` = "dot underflow → time truncated to 64th"** complaint (Samson's error table, [*MusicCompiler-b.pdf*](../prs-docs/MusicCompiler-b.pdf), p. 11): a dot/`x` requested a subdivision finer than a 64th note (the halving drove `fu` to `0`), matching the spec's "A dot whose duration is less than that of a sixty-fourth note is ignored" ([*MusicCompiler-a.pdf*](../prs-docs/MusicCompiler-a.pdf), p. 3 §I.B.4.a). This is a complaint (`er`, black ribbon, returns), so after typing it the routine continues into `s1o` with whatever `tim` survived.

> *One's-complement note:* the `sar 1s` halving is sign-preserving, so a `-0` (`777777`) input would stay negative; the `n2 > 0` and `n2 <= 100` guards in `s1n` keep `t1` a small positive value, and `double t2` starting from `1` stays positive, so the loop terminates with `t1` reaching `+0`.

> *Inferred:* the loop computes `tim = 100 / n2` exactly when `n2` is a power of two (so `tim` is the note's length in 64ths: 1->`100`/whole, 2->`40`/half, 4->`20`/quarter, ...), and the `fc`/`fu` halves layer in dotted/fractional adjustments. The "power-of-two only" restriction and the `fu` underflow guard are exact; the musical reading (whole/half/quarter/eighth/...) is inferred from the `100`-base and the names.

---

## `s1o` -- finalize `fc` and hand off to Scan 2 (lines 824-827)

```
s1o,	load tim
	halve
	store fc
	goto s2
```

- `load tim; halve` = `lac tim; sar 1s` -- AC := `tim >> 1` (one more halving).
- `store fc` = `dac fc` -- the finished **duration value lands in `fc`** (fraction status), overwriting the `40`-seed and any `.`/`x` halvings folded in earlier. (Inferred: the final /2 converts the internal `tim` numerator into the `fc` unit Scan 2 expects.)
- `goto s2` = `jmp s2` -- enter **Scan 2** (line 832), which begins by zeroing its own state (`zero fu; zero sr; zero 3i; zero si; ...`) and proceeds to build the actual note word (tone + articulation + this duration) via `cn` (line 1109), eventually writing it into `not`.

`fc` and `fu` are the two cells that cross the boundary from Scan 1 into Scan 2 (both carry the `s1, s2` ownership comment at lines 1491-1492); the indicators `rt`/`lt` and the counts likewise persist for Scan 2 to interpret.

---

## What this accomplishes

`s1e`-`s1o` is Scan 1's **timing engine**. Given the per-word tallies the front half collected (`ucd`, `n1`/`n2`, `g`/`r`/`cm`, `fc`/`fu`), it:

1. Clamps the rest/grace/comma counts to legal ranges with recoverable **complaints** (`tmr` "too many r"s, `tmg` "too many g"s, `tmc` "more than one comma", each → forced to 1, typed in black, then continue inline) and abandons malformed words with **errors** (`tmf` "too many fields", `tff` "too few fields", `unc` "unprepared comma", `ert` "erroneous time", each → note ignored, typed in red, then `goto te`). All meanings are Samson's error table ([*MusicCompiler-b.pdf*](../prs-docs/MusicCompiler-b.pdf), p. 11). Neither path halts the machine.
2. Derives the right/left position indicators `rt`/`lt` (number vs. `g` vs. comma) that tell Scan 2 how to read the note.
3. Handles a **rest** by reaching back and forcing the *previous* `not` word's articulation index to legato (`cla`) -- clearing articulation bits `{1,3,4}` and setting bit 0 -- so the prior note sounds through the rest ([05 §2](../../pdp1m13/docs/05-data-formats.md#2-the-per-voice-note-word)).
4. Computes the note's **duration** by dividing the `100`/64th base by the (power-of-two) denominator `n2` in the `s1q` halving loop, composing in the `.`/`x` fraction halves, guarding against non-power-of-two denominators (`ert`) and over-fine subdivisions (`dtu`), and depositing the result in `fc`.

The duration in `fc` and the fraction scale in `fu` are exactly the values Scan 2 packs into the 7-bit duration field of the per-voice note word that *PDP-1 Music 13* later unpacks.

Continue to **Scan 2 (`s2`)** at line 832, where the tone, articulation and this duration are assembled into the actual `not` note word.

*(I/O specifics of `tyo`/`jda er`/`flexo` literal packing remain not emulator-verified. The error-code *meanings* (`tmr`/`tmg`/`tmc`/`dtu`/`tmf`/`tff`/`unc`/`ert`) are now sourced from Samson's error table ([*MusicCompiler-b.pdf*](../prs-docs/MusicCompiler-b.pdf), p. 11); the musical interpretation of `tim`/`fc`/`rt`/`lt` and the duration ladder are confirmed by the language spec ([*MusicCompiler-a.pdf*](../prs-docs/MusicCompiler-a.pdf), §I.B), with the bit arithmetic exact as flagged inline.)*
