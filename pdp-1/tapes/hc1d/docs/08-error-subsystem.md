# The error subsystem (`er`, `er1`, `red`, `blk`) and the measure replay

This section walks the diagnostic machinery of Harmony Compiler phase 1: the two error entry points (`er` for *complaints*, `er1` for *errors*), the measure-replay printer that re-types the offending bar from the source buffer and marks where it went wrong, the red/black ribbon-shift helpers, and the cluster of error "landing pads" at the bottom of the I/O block. These routines are what the compiler's scanners (`s1`, `s2`, `pc`, `te`, `rch`) call whenever the score text is malformed; together they produce the Flexowriter diagnostics that a 1963 user would have read off the typewriter.

Everything here is octal and ones-complement. For core instruction semantics (`lac`/`dac`/`add`/`sub`/`sad`/`sas`/`sza`/`sma`/`spa`/`idx`/`jmp`/`jda`/`dap`/`rcl`/`law`, the skip group, the `Ns` shift count notation, and ones-complement negation) see the [PDP-1 primer](../../pdp1m13/docs/02-pdp1-primer.md); this file does not re-teach them. Recall also the macro layer: nearly every body line is a macro call, and this assembler is significant to **six characters, folded to upper case** (documented once in the primer/appendix), so `complaint`→`COMPLA`=`compla`, `diswith`→`DISWIT`=`diswit`, `dispatch`→`DISPAT`=`dispat`, and so on resolve fine.

The reader is assumed to have read the [`pdp1m13` docs](../../pdp1m13/docs/05-data-formats.md): hc1d is the *producer* of the note/bar tape those docs describe being consumed.

#### I/O caveat (read once)

The error subsystem types and shifts the ribbon through PDP-1 Flexowriter IOTs — `tyo` (type out one FIODEC char from `IO`) inside the `type` and `print` macros, and the `wr`/`fee`/`ppp` helpers. **None of these IOTs are implemented in the TypeScript emulator** (`src/pdp1/cpu.ts` has no `tyo`/`rrb`/`rpa`/`cks`/`ppa`/`ppb`), so every concrete claim about what bytes reach the typewriter is *historical/inferred from standard PDP-1 I/O and the in-source comments*, not emulator-verified. Likewise the FIODEC character-code meanings come from the `s2z` table and the `pn*` name strings; codes not pinned by a comment are flagged inferred. These are flagged again at each point of use below.

---

## The error convention: `compla`/`error` macros and the `er`/`er1` entries (lines 139–147, 560–566)

A scanner reports trouble through one of two body macros:

```
compla U  =>  lac (U ; jda er      (a non-fatal "complaint")
error  U  =>  lac (U ; jda er1     (an "error")
```

In both, `U` is a three-character **FIODEC error code** (e.g. `tmf`, `nor`, `mtl`). The body writes it with the `flexo` pseudo-op, e.g. `error flexo tmf` — `flexo xyz` packs the three 6-bit FIODEC characters of `xyz` into one 18-bit word, which `lac (U` loads as a literal into AC. (`flexo` is an *original-assembler* pseudo-op; the modern `macro1` reimplementation does not have it, which is one source of the `.err` noise — see the text-block note below.)

> **The error codes are authoritative, not inferred.** Every three-letter code below is defined in Peter Samson's error table — [*MusicCompiler-b.pdf*](../prs-docs/MusicCompiler-b.pdf), p. 11 ("Figure 4 ERRORS"), with `code — meaning — effect` columns; the bracketed `[xyz]` markers throughout the language spec ([*MusicCompiler-a.pdf*](../prs-docs/MusicCompiler-a.pdf)) cross-reference them. The full catalog (used to de-hedge the glosses below and to fill the [appendix](23-appendix.md)):
>
> | code | meaning | effect | | code | meaning | effect |
> |---|---|---|---|---|---|---|
> | `air` | accidental in rest | accidental ignored | | `mts` | measure too short | short measure compiled |
> | `aor` | accidental out of range | note replaced by rest | | `nor` | mixed accidentals | natural assumed |
> | `bbl` | bad bar label | bar label ignored | | `nps` | no such pseudoinstruction | word ignored |
> | `blc` | bad left argument to "copy" | "copy" ignored | | `tff` | too few fields in note | note ignored |
> | `brc` | bad right argument to "copy" | "copy" ignored | | `tic` | time in comma note | comma ignored |
> | `dtu` | dot underflow | time truncated to 64th | | `tmc` | more than one comma in note | one comma assumed |
> | `eit` | embellishment on illegal time | embellishment ignored | | `tme` | too many embellishments in note | last embellishment taken |
> | `eor` | embellishment out of range | embellishment ignored | | `tmf` | too many fields in note | note ignored |
> | `ert` | erroneous time | note ignored | | `tmg` | too many "g"s in note | one "g" assumed |
> | `etr` | embellishment in triplet | embellishment ignored | | `tmr` | too many "r"s in note | one "r" assumed |
> | `ilc` | illegally located "copy" | "copy" ignored | | `tms` | too many "s","l","e" in note | last occurrence rules |
> | `ilr` | illegally located "rest" | "rest" ignored | | `uat` | unavailable tone | note replaced by rest |
> | `itg` | insufficient time for grace notes | grace note(s) ignored | | `unc` | unprepared comma (no note before it) | note ignored |
> | `mtl` | measure too long | long measure compiled | | | | |
>
> Only the **byte-level Flexowriter typing** of these codes remains "not emulator-verified"; their meanings are now sourced.

The macro then does `jda er` / `jda er1`: **jump-and-deposit-AC**. `jda S` stores AC into cell `S` and begins executing at `S+1`. So the packed code arrives in the first word of the error routine. The two entries differ only in a sign flag:

```
er,   answer erx        ( 0 / dap erx / lac .-2 )
      store arg         dac arg
      sett uin, 1       lac (1 ; dac uin
      goto erc          jmp erc
er1,  answer ery        ( 0 / dap ery / lac .-2 )
      store arg         dac arg
      sett uin, -1      lac (-1 ; dac uin
```

`answer erx` is hc1d's subroutine prologue (the analogue of pdp1m13's `jsp`/`jda`+`dap` idiom): it expands to the literal `0` cell that `jda` wrote AC into, then `dap erx` (patch the low 12 address bits of the eventual exit `jmp` at `erx` with the caller's return address), then `lac .-2` (reload that deposited word — the packed error code — back into AC). So after the prologue, **AC holds the 3-char code**; `store arg` (`dac arg`) saves it in `arg` (`/er: flexo name of error`).

The only difference between the two entries is `uin` (`/er: internal switch`): a complaint sets `uin = +1`, an error sets `uin = -1`. As we will see, `uin`'s sign decides whether the error code is printed *in red* and whether control returns to the caller (complaint, continue scanning) or instead exits through `er1`'s patched return (error). `er` reaches `erc` by an explicit `goto erc` (`jmp erc`); `er1` falls through *into* `erc` (it is the next physical code), so both paths converge.

```
erc,  sett pfu, ec3     lac (ec3 ; dac pfu
```

`erc` plants `ec3` as the return target in `pfu` (`/pf, key: identity check for title; switch...` — reused here as the error subsystem's computed-return cell). The replay code below ends with `ec, govia pfu` (`jmp i pfu`), so this is how `er`/`er1` arrange to continue at `ec3` after replaying the measure. Then it falls into `ert`.

---

## The measure-replay printer: `ert`/`erq`/`erk`/`erf`/`err` (lines 569–608)

The clever part of the subsystem: rather than print a bare code, hc1d **re-types the entire offending measure** from the source-character buffer `f`, character by character, and splices an error marker in at the terminator count where the fault occurred. The result reads like the user's own line with the error pointed out in red.

### `ert` — the header, printed only for the *first* error (lines 569–577)

```
ert,  load mjp          lac mjp
      tgrec -2, erq      sub (-2 ; sma+sza-skp ; jmp erq    (jump erq if mjp > -2)
      call red           jda red
      write erq          law erq ; jda wr
      text /
To err is human---to forgive, divine.

/
erq,  call blk          jda blk
```

`mjp` (`/er: last measure having error`) is initialized to `-2` at cold start (`ap`: `sett mjp, -2`, line 411). `tgrec -2, erq` is the "jump if AC > literal C" test: it computes `AC - (-2) = mjp + 2`, and the combined skip `sma+sza-skp` fires on *minus OR zero*, so the `jmp erq` is taken exactly when the result is positive — i.e. **jump to `erq` if `mjp > -2`**. On the very first error `mjp` is still the sentinel `-2`, so `mjp > -2` is false: the test does *not* jump, and control falls through to `call red` + `write erq`, printing the banner once. On every later error `mjp` is some real bar count `>= 0` (set by `move bc, mjp` at `ec2`, below), so `mjp > -2` is true and the test *jumps* to `erq`, skipping the banner.

When it *is* the first error, `call red` shifts the ribbon to red (see `red` below) and `write erq` types the banner. `write P` = `law P; jda wr`; `wr` (lines 329–336) is the string-typer that prints the `text` block via the `print` macro (its exact pointer arithmetic is covered in the I/O section). The banner is the famous:

> **To err is human---to forgive, divine.**

stored as a `text /.../ ` block (lines 573–576). Note: `text` (and `flexo`) are pseudo-ops of the *original* PDP-1 MACRO assembler. The modern `macro/macro1` reimplementation does **not** support `text`/`flexo` and is stricter about blanks, so re-assembling hc1d emits 171 diagnostics; the text blocks emit the wrong word count, which is exactly why the `.lst` octal addresses drift and **we headline by symbolic label + line number, not address**. `erq` is the label on the line *after* the block (line 577).

`erq,  call blk` shifts the ribbon back to black after the (red) banner.

### `erk` — decide whether this is the same measure/terminator as last time (lines 578–580)

```
      testnl mjp, bc, erk     lac mjp ; sas bc ; jmp erk      (jump erk if mjp != bc)
      testel tjp, tc, ec      lac tjp ; sad tc ; jmp ec       (jump ec if tjp == tc)
erk,  move mbh, emp           lac mbh ; dac emp
```

`bc` is the current bar count, `tc` the terminator count within the measure; `mjp`/`tjp` hold those values *as of the last reported error* (set at `ec2` below). `testnl mjp, bc, erk` jumps to `erk` unless this error is in the *same* measure as the previous one. If it *is* the same measure, `testel tjp, tc, ec` checks whether it is also at the *same terminator position*; if so it jumps straight to `ec` (skip the whole replay — the line was already retyped, just emit the new code). Otherwise it falls to `erk`.

`erk,  move mbh, emp` sets the replay index `emp` (`/er: internal index on f`) to `mbh` (`/rch: pointer to beginning of measure in f`) — i.e. start re-reading from the beginning of the current measure in the `f` buffer. (When the test above falls through to `erk` for a same-measure-different-spot error this is the same start.)

### `erf` — replay loop setup (lines 582–584)

```
erf,  zero blc          dzm blc           (line-position count := 0)
      sett etc, 1       lac (1 ; dac etc  (terminator counter := 1)
      load emp          lac emp           (AC := current f index)
```

`blc` (`/er: bell count`) counts characters printed on the current output line, used below to wrap lines; `etc` (`/er: internal terminator count`) counts terminators seen so far during replay, compared against `tc` to know when to insert the marker. AC is loaded with `emp` ready for the first `lookup`.

### `err` — the character-replay loop (lines 586–608)

```
err,  lookup f          add (f ; dap .+1 ; lac     (AC := f[emp]; indexed load)
      store chy         dac chy
      trze et1          sza i ; jmp et1            (jump et1 if char == 0)
      trel (21, ec0     sad (21 ; jmp ec0          (jump ec0 if char == '|' (21))
      type chy          lio chy ; tyo              (type the char)  [not emulator-verified]
      goto etr          jmp etr
```

`lookup f` is the indexed-load idiom: AC currently holds the index, `add (f` makes it `f+index`, `dap .+1` patches the address field of the following `lac`, and `lac` fetches `f[index]` into AC. `store chy` saves the fetched character (`/er: charac. from f to be printed`).

Two characters are special. **FIODEC `0`** marks the end of a field — `trze et1` (`jump if AC == 0`) branches to the terminator handling at `et1`. **FIODEC `21`** is the measure-separator bar `|` (confirmed by the `s2z` comment at line 1164, `// |`) — `trel (21, ec0` (`jump if AC == literal 21`) branches to `ec0`, which closes the retyped line (see `ec0`). Any ordinary character is typed with `type chy` (= `lio chy; tyo` — load IO with the char and type it out; **not emulator-verified**) and the loop continues via `etr`.

```
et1,  setp1 etc         idx etc      (likely retype slip for "step1 etc": increment etc)
      subt tc           sub tc
      trze et2          sza i ; jmp et2     (jump et2 if etc-tc == 0, i.e. etc == tc)
      trnl (1, et4      sas (1 ; jmp et4    (jump et4 unless etc-tc == 1)
      call blk          jda blk
      goto et4          jmp et4
et2,  call red          jda red
```

`et1` is reached on a **field terminator** (a FIODEC `0`) within the buffer; `etc` is bumped on each. `setp1 etc` is a **likely retype slip for `step1 etc`** (the symbol `setp1` is undefined in the symbol dump with a `?`; `step1 J` = `idx J`); read as "increment the terminator counter `etc`." Then `subt tc` forms `etc - tc`:

- If `etc == tc` (`trze et2`) we are *at the faulty terminator* — jump to `et2`, which does `call red` to shift to red so the upcoming inserted marker prints in red.
- If `etc - tc == 1` exactly we fall through `trnl (1, et4` (which jumps to `et4` *unless* the difference is 1): the difference being 1, control does `call blk` to shift back to black, then `goto et4`.
- Otherwise (difference neither 0 nor 1) `trnl (1, et4` jumps straight to `et4` with no ribbon change.

This is how the red ribbon brackets exactly the spot in the replayed line where the error occurred: red is switched on at the offending terminator and off one terminator later.

```
et4,  load blc          lac blc
      tlesc 100, ets     sub (100 ; spa ; jmp ets   (jump ets if blc < literal 100)
      call cr           jda cr
      zero blc          dzm blc
      goto eti          jmp eti
ets,  type (0           lio (0 ; tyo                 (type FIODEC 0 / space)  [not emulator-verified]
etr,  step1 blc         idx blc
eti,  step1 emp         idx emp
      goto err          jmp err
```

`et4` handles line wrapping. `tlesc 100, ets` is "jump if AC < literal C": if the current line position `blc` is below `100` (octal; 64 decimal) characters, jump to `ets` and emit a space separator; otherwise the line is full, so `call cr` (carriage return, see `cr` at line 452) starts a new line and `zero blc` resets the count, then `goto eti`. `ets` types a `(0` (FIODEC `0` = space per the `s2z` comment at line 1165; **not emulator-verified**), evidently a separating space between fields in the replay. `etr` and `eti` increment the line-position count `blc` and the replay index `emp` respectively, then loop back to `err`.

Note the two ways through the tail. An ordinary character takes `type chy; goto etr`, which advances `blc` (`etr`) then `emp` (`eti`). A field terminator takes the `et1`→…→`et4` path and there either emits a space via `ets` (which then advances both `blc` and `emp`) or, when the line is full, does `call cr; zero blc; goto eti` (advancing only `emp`, since `blc` was just zeroed and `etr` is skipped).

The net effect: hc1d re-types the whole measure, field by field, breaking lines at ~64 columns, tracking position in `blc`, and switching the ribbon to red around the single terminator (`tc`) where the fault was detected.

---

## Printing the code and returning: `ec0`/`ec`/`ec3`/`ec1`/`ec2` (lines 610–625)

```
ec0,  call blk          jda blk            (force ribbon black before the marker)
      type (21          lio (21 ; tyo      (type '|' the measure-end bar)  [not emulator-verified]
      call cr           jda cr             (new line)

ec,   govia pfu         jmp i pfu          (computed return: -> ec3, planted by erc)
ec3,  type (36          lio (36 ; tyo      (type FIODEC 36 -- glyph unknown)  [not emulator-verified]
      testp uin, ec1    lac uin ; sma ; jmp ec1   (jump ec1 if uin >= 0, i.e. complaint)
      call red          jda red            (error: print the code in RED)
ec1,  print arg         lac arg ; rcl 6s ; tyo ; rcl 6s ; tyo ; rcl 6s ; tyo
      call blk          jda blk            (back to black)
ec2,  call cr           jda cr
      move bc, mjp      lac bc ; dac mjp   (remember: this measure now has an error)
      move tc, tjp      lac tc ; dac tjp   (remember: at this terminator)
      testp uin, erx    lac uin ; sma ; jmp erx   (jump erx if uin >= 0, i.e. complaint)
ery,  exit er1          jmp                (error: return through er1's patched exit)
erx,  exit er           jmp                (complaint: return through er's patched exit -> caller)
```

`ec0` is the branch taken when the replay loop hit the closing `|` (`trel (21, ec0` in `err`): it forces black, types the closing bar `21`, and does a carriage return — finishing the retyped line. It then falls into `ec`.

`ec, govia pfu` = `jmp i pfu`, an indirect jump through `pfu`. `erc` planted `ec3` there, so this routes to `ec3` — the actual code-printing tail. (`pfu`/`govia` is reused as a general computed-return cell across hc1d; here it is simply "after replay, print the code.")

`ec3` types FIODEC `36` (its exact glyph is **unknown** from the in-source comments — it does not appear in the `s2z` table). Then `testp uin, ec1`: `uin >= 0` means a *complaint* (`uin = +1`), so jump straight to `ec1` and print in black; otherwise (`uin = -1`, a real *error*) fall through to `call red` so the code prints **in red**. `ec1, print arg` types the three packed FIODEC chars of the error code (the `print` macro: `lac arg`, then three times `rcl 6s; tyo` — rotate-combined-left by 6 to bring each 6-bit char into the low IO bits and type it; **not emulator-verified**). `call blk` restores black, `ec2, call cr` ends the line.

`move bc, mjp` and `move tc, tjp` record the current bar and terminator counts as "where the last error was," so the `erk` logic above will recognize a *repeated* error in the same measure/spot and not re-type the whole line again. (This is also what advances `mjp` off its `-2` sentinel, suppressing the banner on every later error.)

Finally `testp uin, erx`: if `uin >= 0` (complaint) jump to `erx`, whose `exit er` (`jmp` patched by `er`'s `answer erx` prologue) **returns to the calling scanner** so compilation continues. If `uin < 0` (error) control falls into `ery`, whose `exit er1` returns through `er1`'s patched exit. (Note: both exits return to the respective caller's continuation; what differs is *which* caller — the `error ...` landing pads, by convention, follow their `er1` call with `goto te`, abandoning the bad measure, whereas `compla` call sites resume scanning in place. The `exit` macro's address operand is ignored; the return address was set by the matching `answer`'s `dap`.)

---

## Ribbon control: `red` (line 630) and `blk` (line 637)

```
red,  answer rex        ( 0 / dap rex / lac .-2 )
      testm rb, rex     lac rb ; spa ; jmp rex    (jump rex if rb < 0 -- already red)
      type (35          lio (35 ; tyo             (FIODEC 35 = RED ribbon shift)  [not emulator-verified]
      sett rb, -1       lac (-1 ; dac rb
rex,  exit red          jmp

blk,  answer blx        ( 0 / dap blx / lac .-2 )
      testp rb, blx     lac rb ; sma ; jmp blx    (jump blx if rb >= 0 -- already black)
      type (34          lio (34 ; tyo             (FIODEC 34 = BLACK ribbon shift)  [not emulator-verified]
      sett rb, +1       lac (1 ; dac rb
blx,  exit blk          jmp
```

These switch the Flexowriter's two-color ribbon. The PDP-1 typewriter prints in black or red; FIODEC **`35` = red-ribbon shift, `34` = black-ribbon shift** (inferred from the preamble's FIODEC table; not pinned by an in-source comment, and the actual shift behavior is **not emulator-verified**). `rb` (`/red, blk: +1 blac, -1 red`) caches the current ribbon state so a redundant shift is never typed: `red` does nothing if `rb` is already negative (`testm rb, rex` = jump if `rb < 0`); `blk` does nothing if `rb` is already non-negative (`testp rb, blx`). When a shift *is* emitted, the cache is updated (`sett rb, -1` / `sett rb, +1`). Both are `answer`/`exit` subroutines called as `call red` / `call blk` (i.e. `jda`). `rb` is initialized to `+1` (black) during the `pfr` reset (`sett rb, 1`, line 445). This caching is why the replay code can pepper `call red`/`call blk` freely without worrying about double shifts.

---

## Error landing pads below the I/O block

These are the entry points the scanners jump to on specific malformed input. Each is a thin wrapper that names a code and funnels into the common machinery. (The musical/syntactic meaning of each code is partly inferred — flagged below.)

### `s1y`/`s1z`/`s1x`/`s1w`/`s1v` — the `s1`-scanner errors (lines 644–652)

```
s1y,
s1z,  error flexo tmf    lac (flexo tmf ; jda er1
      goto te            jmp te
s1x,  error flexo tff
      goto te
s1w,  error flexo unc
      goto te
s1v,  error flexo ert
      goto te
```

`s1y` and `s1z` share the same code (`s1y,` is a bare label aliasing the line at `s1z`). Each calls `error` (the `er1` path, `uin = -1`, code prints in red), then `goto te` — `te` (line 1193) is the terminator/scan-restart routine, so these abandon the current measure and resume scanning there. The four codes are now sourced (error table, [*MusicCompiler-b.pdf*](../prs-docs/MusicCompiler-b.pdf), p. 11): **`tmf`** = "too many fields in note" (note ignored), **`tff`** = "too few fields in note" (note ignored), **`unc`** = "unprepared comma — no note before it" (note ignored), **`ert`** = "erroneous time" (note ignored). All four "ignore the note and resume," consistent with the `goto te`. (Note `ert` here is a *code* mnemonic, distinct from the `ert` *label* at line 569 — a name collision worth flagging for the reader.)

### `s3x` — table overflow (lines 654–658)

```
s3x,  call cr           jda cr
      write eha          law eha ; jda wr
      text /Table overflow.  Subdivide source program./
eha,  call cr           jda cr
      goto u            jmp u            (halt entry: u, halt at line 406)
```

`s3x` is the **fatal** overflow handler, reached from `sbc`/`snl` (lines 460, 469: `tgrec all, s3x`) when the note buffer `not` runs past capacity `all = bar-not-1`. It does *not* use the replay machinery — it just `cr`s, types the plain-English line **"Table overflow.  Subdivide source program."** via `write`/`text`, `cr`s again, and `goto u`. `u` is the program's halt (`u, halt` at line 406), so this stops the machine; the operator must split the score into smaller pieces. The `text` block again confounds the modern assembler (see the banner note) — headline by label, not address.

### `rrz` — measure too long (lines 660–663)

```
rrz,  call cr           jda cr
      write rry          law rry ; jda wr
      text /Measure has too many characters.  Rearrange tape./
rry,  goto eha          jmp eha
```

`rrz` is reached from `rch` (line 516, `goto rrz`) when buffering a measure overflows the `f` character buffer (`ft` past `fl`). It types **"Measure has too many characters.  Rearrange tape."** and then `goto eha` — i.e. it shares `s3x`'s tail (`eha`: `call cr; goto u`), so it too halts the machine. Again no replay (there is no well-formed measure to retype yet).

### `pcz` — no such pseudo-command (lines 665–672)

```
pcz,  error flexo nps    lac (flexo nps ; jda er1   (nps = "no such pseudoinstruction" -> word ignored)
      test0 chr, te      lac chr ; sza i ; jmp te     (jump te if chr == 0)
pz2,  call rch           jda rch
      store chr          dac chr
      trze pz3           sza i ; jmp pz3              (jump pz3 if chr == 0)
      trnl (21, pz2      sas (21 ; jmp pz2            (loop unless chr == '|')
pz3,  move chr, trm      lac chr ; dac trm
      goto te            jmp te
```

`pcz` (reached from the pseudo-command dispatcher `pc` at line 1227, `tgrec npi, pcz`, when the typed keyword index runs past the `pn1..pnh` table) reports code **`nps`** — "no such pseudoinstruction → word ignored" (error table, [*MusicCompiler-b.pdf*](../prs-docs/MusicCompiler-b.pdf), p. 11) — via `error`, then **flushes the rest of the bad pseudo-command line** so scanning can resync: it reads characters with `call rch` until it hits a `0` (`test0`/`trze pz3`) or the measure bar `|` (FIODEC `21`), saves the terminating char into `trm`, and `goto te`. This recovery loop is why a typo in a pseudo-command does not derail the whole compile — hc1d skips to the next measure boundary and continues.

---

## What this accomplishes

The error subsystem turns the compiler from a silent failure into a *teaching* tool. A single `compla`/`error` macro call from any scanner (passing a 3-char FIODEC code in AC via `jda`) triggers: the once-only "To err is human---to forgive, divine." banner; a full **replay of the offending measure from the `f` buffer**, line-wrapped at ~64 columns, with the **red ribbon bracketing the exact terminator** where the fault was caught; and the **error code printed (red for `error`, black for `compla`)**. `uin`'s sign then decides whether the routine returns to a `compla` caller that resumes scanning in place, or to an `error` caller that (by convention) `goto te`s to abandon the measure. The `red`/`blk` helpers keep the ribbon state in `rb` so shifts are never doubled. Separately, the plain-text fatal handlers `s3x`/`rrz` type a one-line message and **halt** when a buffer overflows, and `pcz` recovers gracefully from an unknown pseudo-command by flushing to the next bar. Because the IOTs (`tyo`, `wr`/`fee`/`ppp`) and the `text`/`flexo` pseudo-ops are not modeled by the emulator/modern assembler, all the byte-level typing behavior here is documented as historical/inferred.

The three-character FIODEC codes seen here (`tmf`, `tff`, `unc`, `ert`, `nps`) and those raised elsewhere (`bbl`, `tmr`, `tmg`, `tmc`, `dtu`, `nor`, `tme`, `tms`, `itg`, `tic`, `uat`, `aor`, `etr`, `eit`, `eor`, `mtl`, `mts`, `ilr`, `ilc`, `blc`, `brc`) are exactly the entries of Peter Samson's error table ([*MusicCompiler-b.pdf*](../prs-docs/MusicCompiler-b.pdf), p. 11), reproduced in full in the callout above and in the [appendix error-code catalog](23-appendix.md). The set of `compla`/`error` call sites in `hc1d.mac` is the producer of those very codes.
