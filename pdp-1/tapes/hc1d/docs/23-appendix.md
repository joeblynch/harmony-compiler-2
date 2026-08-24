# Appendix: quick reference

This appendix collects the lookup tables you reach for while reading the other walkthroughs: the symbol/label map, the variable glossary, the macro-expansion table, the hc1d-only instruction delta, the FIODEC chart, the error-code catalog, the 6-character-significance versus retype-typo table, and a short statement of the assembler situation and the not-emulator-verified surface.

All numbers are **octal** unless flagged decimal. The machine is the 18-bit, ones-complement PDP-1; for core instruction semantics (`lac`/`dac`/`add`/`sub`/`idx`/`sad`/`sas`/`jmp`/`jsp`/`jda`/`law`/`cma`/`sar`/`ral`/the skip group/etc.) see [`../../pdp1m13/docs/02-pdp1-primer.md`](../../pdp1m13/docs/02-pdp1-primer.md). The intermediate note/bar tape that hc1d **punches** is the same format [`../../pdp1m13/docs/05-data-formats.md`](../../pdp1m13/docs/05-data-formats.md) documents *PDP-1 Music 13* **reading**.

> Throughout this doc set, sections are headlined by **symbolic label + `hc1d.mac` line range**, never by octal address. The octal addresses below come from the `-d` symbol dump in `hc1d.lst` and are marked **approx**; see [§H](#h-assembler-situation--not-emulator-verified-surface) for why.

---

## A. Symbol / label map (routine roles)

Addresses are **approx** (from the `hc1d.lst` symbol dump). They drift because the modern re-assembly lacks the `text`/`flexo` pseudo-ops and miscounts the text blocks (171 diagnostics; [§H](#h-assembler-situation--not-emulator-verified-surface)). Use them only to orient; trust labels + `.mac` line numbers.

### Entry, top-level control, I/O primitives

| Label | approx | `.mac` lines | Role |
|---|---|---|---|
| `u` | 0113 | 406 | **Start of run** (`start u` at the file end). `halt`, then falls into `ap`. The idle / between-songs halt. |
| `ap` | 0114 | 407–411 | Initialize a pass: clear `lmb`, prime the reader (`call rpr`), seed `bc=-1`, `nl=-1`, `mjp=-2`. |
| `pf` | 0123 | 413–429 | **Read title line** into the `f` buffer up to a `\|` (`21`); on overflow go `rrz`. |
| `pfr` | 0152 | 431–449 | Reset per-piece state, then `goto pum` (copy `nt`→`kt`→`mt`, then to `s1`). |
| `wr` | 0000 | 329–336 | Type a packed-FIODEC string (`write P` target); self-modifying `dap wre`. (not emulator-verified — uses `tyo` via `print`.) |
| `rpr` | 0016 | 338–342 | Strobe/clear the reader once (`rrb`/`rpa-i`). (not emulator-verified.) |
| `rp` | 0023 | 344–375 | **Read one source line** from tape: wait on `cks`, `rrb`/`rpa-i`, validate, fold ribbon-shifts. (not emulator-verified.) |
| `fee` | 0063 | 377–387 | **Punch N blank tape lines** (`feed N` target); honors a sense gate via `lat`+`(700`. (not emulator-verified — `ppa`.) |
| `ppp` | 0076 | 389–401 | **Punch one 18-bit word** as 3 binary lines (`ppb`×3); `lat`/`(700` pause gate. (not emulator-verified.) |
| `cr` | 0202 | 452–454 | Carriage return: `type (77`. (not emulator-verified.) |

### Bookkeeping helpers

| Label | approx | `.mac` lines | Role |
|---|---|---|---|
| `sbc` | 0210 | 456–463 | **Step bar count**: bump `tbc`,`bc`; overflow (`tgrec all`) → `s3x`; return `-bc`. |
| `snl` | 0224 | 466–471 | **Step note location** `nl`; overflow (`tgrec all`) → `s3x`; return `nl`. |
| `rcw` | 0235 | 473–475 | Return current `fi` (read-cursor word). |
| `rrc` | 0243 | 477–480 | Reset read cursor: `fi := fl2`, then `fl1 := fl2`. |
| `rch` | 0252 | 483–555 | **Read one character** from the `f` buffer, handling comments (`74`/`72`), the `bgs` "end" state machine (`rdt` table), and buffer refill from tape via `rp`. |
| `s3x` | 0633 | 654–658 | Table-overflow fatal: "Table overflow.  Subdivide source program." → `u`. |
| `rrz` | 0641 | 660–663 | Buffer-overflow fatal: "Measure has too many characters.  Rearrange tape." |

### Error / diagnostic machinery

| Label | approx | `.mac` lines | Role |
|---|---|---|---|
| `er` | 0427 | 560–563 | **Complaint** entry (`compla`/`complaint` → `jda er`): non-fatal; `uin=+1`. |
| `er1` | 0436 | 564–566 | **Error** entry (`error` → `jda er1`): `uin=-1`. |
| `erc`/`ert`/`erq`/`erk`/`erf`/`err` | 0444–0474 | 568–608 | Print the offending measure with the bad spot in **red**, the 3-letter code, and the "To err is human" header (once per measure). |
| `ec`/`ec0`/`ec1`/`ec2`/`ec3` | 0540–0557 | 610–625 | Common exit: emit code, bells, save `mjp`/`tjp`, return via patched `erx`/`ery`. |
| `red` | 0571 | 630–634 | Switch typewriter to **red** ribbon (`type (35`) if not already; `rb=-1`. (not emulator-verified.) |
| `blk` | 0604 | 637–641 | Switch to **black** ribbon (`type (34`); `rb=+1`. (not emulator-verified.) |

### Scan 1 — lexing numeric/letter fields

| Label | approx | `.mac` lines | Role |
|---|---|---|---|
| `s1` | 0664 | 677–687 | **Scan-1 entry**: zero the field counters, seed `fc=40`,`fu=100`. |
| `s10`/`s12`/`s13`/`s14` | 0700–0721 | 688–702 | Accumulate a decimal number (`x10dec`) digit by digit. |
| `s11`/`s15`–`s18` | 0732–01013 | 704–740 | Field terminator: store `n1`/`n2`, count `g`/`r`/`cm`, classify the terminator char. |
| `s19`/`s1a`/`s1b`/`s1c`/`s1d` | 0777–01011 | 727–736 | Per-char side-effects: fraction (`73`/`27`), `r`(`51`), `g`(`67`), comma(`33`). |
| `s1e`–`s1z`, `sli`,`sk1` | 01041–… | 744–828 | Validate counts, compute `tim`/`fc`/`fu`, raise `tmf`/`tff`/`unc`/`ert`/`bbl`/`tmr`/`tmg`/`tmc`/`dtu`. |

### Scan 2 — note assembly

| Label | approx | `.mac` lines | Role |
|---|---|---|---|
| `s2` | 01243 | 832–840 | **Scan-2 entry**: clear per-note state. |
| `s20`/`s21` | 01254 | 842–849 | Read a char, `search` the `s2z` glyph table, `dispatch s2y`. |
| `s2b`–`s2o`, `2sr`,`2ss`,`s38` | … | 851–896 | Glyph handlers: slur/legato status, staff reloc, triplet, accidentals, embellishment digits. |
| `s2r`–`s33`, `s51`,`s52`,`2s1`–`2s4` | … | 906–1144 | Build the note time/pitch, grace-note robbing, embellishments; raise `tms`/`itg`/`tic`/`air`/`uat`/`aor`/`etr`/`eit`/`eor`. |
| `cn` | 02040 | 1109–1113 | **Commit note**: `snl`, store the formed note word `nf` into `not[nl]`. |
| `s2z` | (approx) | 1147–1167 | The 21 FIODEC glyph values scan-2 searches (in a 25-word region; the call is `search s2z, 25`). |
| `s2y`/`pcd`/`pnm` | 01401 | 1170–1253 | Dispatch vectors: glyph→handler (`s2y`), pseudo→handler (`pcd`), pseudo→name-string (`pnm`). |

### Terminator & pseudo-command layer

| Label | approx | `.mac` lines | Role |
|---|---|---|---|
| `te` | 02223 | 1193–1221 | **Terminator / end-of-note**: advance measure time `mm`, check `3u`, raise `mtl`/`mts`/`itg`; emit the bar (`sbc`/`putback bar`). |
| `pc`/`pcr`/`pc2`–`pc9` | 02301 | 1224–1246 | **Pseudo-command recognizer**: match buffered chars against `pn1..pnh`, then `dispatch pcd-1`. |
| `pcz` | 0646 | 665–672 | "Not a pseudo-statement" path: raise `nps`. |
| `pn1..pnh` | 02407–02510 | 1255–1271 | FIODEC name strings for the 17 pseudos ([§E](#e-fiodec-flexowriter-chart) / project preamble). |
| `ps` | 02516 | 1273 | `govia psw` — the deferred-pseudo return switch. |
| `pv1..pvh` | 02517–02651 | 1275–1479 | **Pseudo handlers** (musical meaning partly inferred): see below. |
| `key`/`pva`/`pum`/`pue`/`pus`/`puf`/`puw` | 02662 | 1352–1399 | **Key-signature** handler: apply sharps/flats by rewriting `kt`/`mt`. |

### Pseudo handlers `pv*` (musical roles per [*MusicCompiler-a.pdf*](../prs-docs/MusicCompiler-a.pdf))

The five articulation pseudos set the running default articulation `ss` (the same letters also work per-note via `s2b`…); per the spec (p. 6 §I.B.6, p. 9 §I.D.5) `s`=staccato, `l`=legato, `e`=eighth (the default mode at the start of each line), `h`=half, `q`=quarter — the `ss` bit value of each equals its intermediate-format articulation code.

| Label | Pseudo | `.mac` line | Effect |
|---|---|---|---|
| `pv1` | `s` | 1275 | `ss := 200000` (staccato; artic. value 4). |
| `pv2` | `l` | 1277 | `ss := 400000` (legato; value 8). |
| `pv3` | `e` | 1279 | `ss := 0` (eighth / default; value 0). |
| `pvf` | `h` | 1281 | `ss := 40000` (half; value 2). |
| `pvg` | `q` | 1283 | `ss := 20000` (quarter; value 1). |
| `pv5` | `bass` | 1286 | `st := 12`. |
| `pv6` | `treble` | 1288 | `st := 26`. |
| `pv7` | `tenor` | 1290 | `st := 16` (`/-- from 20, 070418`). |
| `pv8` | `alto` | 1292 | `st := 20` (`/-- from 22, 070418`). |
| `pv9`/`p9a` | `units` | 1295–1305 | Set `1u`/`3u` (the measure time grid). |
| `pv4`/`p41`/`p42` | `end` | 1309–1341 | **Punch the tape**: notes + checksum, bars + checksum, feed, `goto u`. |
| `pvh`/`pha` | `tempo` | 1344–1350 | `n1+700000` → `call cn` (tempo word). |
| `pva`/`key` | `key` | 1352 | Key signature (see `pum`…`puw`). |
| `pvb`/`pb1`–`pb3` | `rest` | 1401–1425 | Emit a rest note; raise `ilr` if mid-measure. |
| `pvc`/`co1`–`co8` | `copy` | 1444–1479 | Copy a prior measure; raise `ilc`/`blc`/`brc`. |
| `pvd`/`pd1` | `up` | 1427–1431 | `tll := n1` (transpose up). |
| `pve`/`pe1`/`pe2` | `down` | 1434–1441 | `tll := -n1` (transpose down). |

---

## B. Variable table (condensed)

From the temp-storage block (`hc1d.mac` lines 1484–1574); each cell is a literal `0`. Author comment in the source after `/`.

### Scan-1 lexer state

| Var | Meaning |
|---|---|
| `ldl` | preceding char numeric? 1/yes 0/no (s1,s2) |
| `ucd` | number of numeric fields read (s1) |
| `num` | value of numeric field (s1, `rin`) |
| `n1`/`n2` | first / last number of a 1-or-2 field group |
| `psi` | character count |
| `chi` | non-numeric char count |
| `fc`/`fu` | fraction status / fraction used (s1,s2) |
| `g`/`r`/`cm` | count of `g` / `r` / commas |
| `rt` | right indicator: 0/num, 1/g, 2/cm |
| `lt` | left indicator: 0/num, 1/r, 2/cm |
| `tim` | running time |
| `trm` | terminator |
| `tc` | terminator count within measure |
| `chr`/`dig` | character read / digit read |

### Bars & notes bookkeeping

| Var | Meaning |
|---|---|
| `bc` | bar count (`te`) |
| `tbc` | bar count within tape (`sbc`) |
| `nl` | note location in `not` (s2) |
| `lmb` | last measure starting index in `not` (`te`) |
| `mm` | units*3 used in measure to date (s2) |
| `tu` | units*3 used by current note (s2) |
| `1u`/`3u` | 1×units / 3×units (`ps`) |
| `mbh` | beginning of measure in `f` (`rch`) |
| `ao` | arguments outstanding (`ps`) |
| `psw` | return-with-argument switch (`ps`) |

### Scan-2 note builder

| Var | Meaning |
|---|---|
| `ss`/`sv` | running sle status / per-note value |
| `sr`/`st` | staff reloc count / staff location (0=subbass) |
| `3i` | triplet indicator (0/no, 100000/yes) |
| `aci`/`acc` | accidental ind (0/none, 1/sharp-or-flat, -1/natural) / accidental count |
| `et`/`ete` | embellishment temp / terminal |
| `nf` | note forming (`cn`) |
| `ton` | tone pointer to staff (`mt`), not changing |
| `tne` | tone pointer to table, letter changing |
| `tnd`/`tnf` | `tne-1` / `tne+1` for embellishment |
| `nft`/`nfp` | note-formed time / preserved from robbery |
| `ex` | time for sustained note |
| `cut` | time not available to trill loop |
| `rob`/`gi`/`gis` | time desired by grace notes / grace indicator / `gi` saved |
| `sid`/`nld`/`nls` | `si` delayed / `nl` delayed / `nl` saved |
| `ccc` | triplet status of last non-comma note |
| `si` | 0/no sle in note, 1/sle |
| `tll` | transposition semitone count (`pvd`,`pve`) |

### Pseudo / key / read-char / error / scratch

| Var | Meaning |
|---|---|
| `tht`/`zet` | pseudo index under investigation / char position in pseudos (`pc`) |
| `ucl`/`bgm` | switches internal to `pc` |
| `rn` | random number (`rnd`) |
| `pfu` | title identity-check switch; also sharp/flat switch (`pf`,`key`) |
| `cbh`/`irl` | copy begins here (`pvc`) / is-rest location (`pvb`) |
| `np` | number of parts (`pf`) |
| `rii`/`rij`/`riw` | read index / write-or-compare index / compare-or-write switch (`ri`) |
| `bgs` | "end" counter (`rch`) |
| `fi`/`ft` | f index / f top (`rch`) |
| `pp`/`ch` | saved char / char from tape (`rch`) |
| `fl1`/`fl2` | loc in `f` of last terminator / last termin. before new word |
| `chy`/`arg`/`uin` | char from `f` to print / flexo name of error / internal switch (`er`) |
| `etc`/`blc`/`mjp`/`tjp`/`emp` | termin count / bell count / last measure w/ error / termin count for last error / index on `f` (`er`) |
| `rb` | +1 black, -1 red (`red`,`blk`) |
| `t1`–`t4` | scratch |

---

## C. Macro expansion table (condensed)

Definitions in `hc1d.mac` lines 7–325. `.` = this word's own address; "(V" = literal V; `i` = indirect.

### Data movement / arithmetic

| Macro | Expands to | Effect |
|---|---|---|
| `load A` | `lac A` | AC := C(A) |
| `store A` | `dac A` | C(A) := AC |
| `move A,B` | `lac A` / `dac B` | C(B) := C(A) |
| `sett A,B` | `lac (B` / `dac A` | C(A) := literal B |
| `zero A` | `dzm A` | C(A) := 0 |
| `clear` | `cla` | AC := 0 |
| `comple` | `cma` | AC := ~AC |
| `band U` | `and U` | AC := AC ∧ C(U) |
| `addi A` | `add A` | AC := AC + C(A) |
| `subt A` | `sub A` | AC := AC − C(A) |
| `step1 J` | `idx J` | C(J) := C(J)+1 |
| `step J,I` | `lac J`/`add I`/`dac J` | C(J) += C(I) |
| `stepa J,I` | `law I`/`add J`/`dac J` | C(J) += literal I |
| `istepa J,I` | `law i I`/`add J`/`dac J` | C(J) −= literal I |
| `grow A,V,C` | `lac A`/`add (V`/`dac C` | C(C) := C(A)+literal V |
| `halve` | `sar 1s` | AC >>1 (arith) |
| `halfof V` | `lac V`/`sar 1s`/`dac V` | C(V) >>1 |
| `double Q` | `lac Q`/`ral 1s`/`dac Q` | C(Q) rotate-left 1 |
| `x2to1/3/6/7` | `ral 1s/3s/6s/7s` | rotate AC left N |
| `x10dec` | `ral 1s`/`dac t1`/`ral 2s`/`add t1` | ×~10 decimal-shift helper |

### Control / subroutine convention

| Macro | Expands to | Effect |
|---|---|---|
| `goto T` | `jmp T` | jump |
| `govia P` | `jmp i P` | indirect jump (switch return) |
| `call S` | `jda S` | jump, deposit AC into S, run at S+1 (arg in AC) |
| `exit P` | `jmp` (bare; P ignored) | patched-return jump |
| `halt` | `hlt` | halt |
| `answer X` | `0` / `dap X` / `lac .-2` | **prologue**: literal-0 arg cell, patch exit `X`, reload arg |

The `answer`/`exit` pair is hc1d's calling convention — the analogue of *Music 13*'s `jsp`/`jda`+`dap`. A routine `foo,` begins `foo, answer foox` and ends `foox, exit foo`. Arg passes in AC; result returns in AC.

### Skip-and-jump tests (jump condition is OPPOSITE of the bare skip)

| Macro | Expands to | Jumps if |
|---|---|---|
| `trze T` | `sza i`/`jmp T` | AC = 0 |
| `trnz T` | `sza`/`jmp T` | AC ≠ 0 |
| `trpl T` | `sma`/`jmp T` | AC ≥ 0 |
| `trmi T` | `spa`/`jmp T` | AC < 0 |
| `trel A,T` (`ftrel`) | `sad A`/`jmp T` | AC = C(A) |
| `trnl A,T` | `sas A`/`jmp T` | AC ≠ C(A) |
| `test0 Y,Z` | `lac Y`/`sza i`/`jmp Z` | C(Y) = 0 |
| `test1 Y,Z` | `lac Y`/`sza`/`jmp Z` | C(Y) ≠ 0 |
| `testp Y,Z` | `lac Y`/`sma`/`jmp Z` | C(Y) ≥ 0 |
| `testm Y,Z` | `lac Y`/`spa`/`jmp Z` | C(Y) < 0 |
| `testel Y,Z,A` | `lac Y`/`sad Z`/`jmp A` | C(Y) = C(Z) |
| `testnl Y,Z,A` | `lac Y`/`sas Z`/`jmp A` | C(Y) ≠ C(Z) |
| `tles C,T` | `sub C`/`spa`/`jmp T` | AC < C(C) |
| `tlesc C,T` | `sub (C`/`spa`/`jmp T` | AC < literal C |
| `tgrel C,T` | `sub C`/`sma`/`jmp T` | AC ≥ C(C) |
| `tgrec C,T` | `sub (C`/`sma+sza-skp`/`jmp T` | AC > literal C (combined skip fires on minus-OR-zero) |

### Table / dispatch (self-modifying)

| Macro | Expands to | Effect |
|---|---|---|
| `lookup V` | `add (V`/`dap .+1`/`lac` | indexed load: AC := C((AC)+V) — patches the next `lac` |
| `dispat U` | `add (U`/`dap .+1`/`jmp i` | computed jump through table entry (AC)+U |
| `diswit L,U` | `add (U`/`dap .+2`/`lac L`/`jmp i` | as `dispat` but load L first |
| `putback U,Q` | `add (U`/`dap .+2`/`lac Q`/`dac` | indexed store: C((AC)+U) := C(Q) |
| `search W,N,ERR` | (lines 302–315) | linear search AC through W[0..N]; `jmp ERR` if absent, else return matched index |
| `copy H,I,N` | (lines 289–300) | block-copy N+1 words H→I |

### I/O & error (hit `tyo`/`wr`/`fee`/`ppp` — not emulator-verified)

| Macro | Expands to | Effect |
|---|---|---|
| `write P` | `law P`/`jda wr` | type packed-FIODEC string at P |
| `type Q` | `lio Q`/`tyo` | type one FIODEC char |
| `print F` | `lac F`/(`rcl 6s`/`tyo`)×3 | type the 3 chars packed in F |
| `feed N` | `law i N`/`jda fee` | punch N blank tape lines |
| `compla U` (`complaint`) | `lac (U`/`jda er` | non-fatal complaint, U = flexo 3-char code |
| `error U` | `lac (U`/`jda er1` | error, U = flexo 3-char code |

> `compla`, `complaint`, `dispat`, `dispatch`, `diswit`, `diswith`, `comple`, `complement` all fold to the same 6-char tokens; see [§G](#g-6-character-significance-vs-retype-typos).

---

## D. Instruction cheat-sheet — hc1d delta only

Core PDP-1 instructions are documented in [`../../pdp1m13/docs/02-pdp1-primer.md`](../../pdp1m13/docs/02-pdp1-primer.md). Only the **I/O IOTs unique to hc1d** are listed here. hc1d is the tape *producer*; the audio worklet emulator implements the *player's* needs, not these I/O IOTs.

| Mnemonic | Name | Behavior (historical / inferred) | Emulator? |
|---|---|---|---|
| `tyo` | Type Out | Send low 6-bit FIODEC char in IO to the typewriter/punch (prints one char). | **not emulator-verified** |
| `rrb` | Read Reader Buffer | Read paper-tape reader buffer into IO (after a read was initiated). | **not emulator-verified** |
| `rpa` | Read Paper-tape Alphanumeric | Initiate/strobe one 6-bit line from the reader; often `rpa-i` (indirect/clear variant). | **not emulator-verified** |
| `cks` | Check Status | Skip/condition on an I/O device flag (used in `rp` to wait for the reader). | **not emulator-verified** |
| `ppa` | Punch Paper-tape Alphanumeric | Punch one 6-bit line (low 6 bits of IO). | **not emulator-verified** |
| `ppb` | Punch Paper-tape Binary | Punch one binary line (`ppp` punches 3 lines/word). | **not emulator-verified** |
| `lat` | Load Accum. from Test word | AC := AC ∨ testword. Front-panel / sense read (`fee`, `ppp` use it as a pause gate). | **emulator-implemented** |
| `rpb` | Read Paper-tape Binary | Assemble an 18-bit word from 3 tape lines. | **emulator-implemented** |

The emulator (`src/pdp1/cpu.ts`) decodes `rpb` (`0o0002`) and `lat` (the `0o2000` bit of the operate group) but has no case for `tyo`/`rrb`/`rpa`/`cks`/`ppa`/`ppb`. Treat any concrete bit-level claim about those six as historical/inferred.

---

## E. FIODEC (Flexowriter) chart

Lower-case set, from the `s2z` table comments (`hc1d.mac` lines 1147–1167), the `pn*` name strings (1255–1271), and the per-character scan-1 dispatch (`s19`–`s1d`, lines 720–724). Codes with no in-source confirmation are marked **(unknown)**; codes deduced from program behaviour (not a glyph comment) are marked **(inferred)**.

| Code | Glyph | Source | | Code | Glyph | Source |
|---|---|---|---|---|---|---|
| 00 | space | s2z | | 50 | q | s2z / png |
| 21 | `/` (slash = bar) | s2z, spec | | 51 | r | s1b / pn7,pnb |
| 22 | s | s2z / pn1,pn5 | | 54 | − (minus) | s2z |
| 23 | t | pn6/pn7/pnh | | 55 | `)` / `=` | s2z |
| 24 | u | s2z / pn9,pnd | | 57 | `(` / `+` | s2z |
| 25 | (unknown) | — | | 61 | a | s2z / pn8 |
| 26 | w | s2z / pne | | 62 | b | s2z / pn5,pn6 |
| 27 | x | s2z / s1a | | 63 | c | s2z / pnc |
| 30 | y | pna / pnc | | 64 | d | s2z / pn4,pne |
| 33 | , (comma) | s1d (inferred) | | 65 | e | s2z / pn3,pn4 |
| 34 | black-ribbon-shift | `blk` (639) | | 67 | g | s1c (inferred) |
| 35 | red-ribbon-shift | `red` (632) | | 70 | h | s2z / pnf |
| 36 | (unknown) | — | | 71 | i | pn9 |
| 42 | k | pna | | 73 | . (period) | s2z / s19 |
| 43 | l | s2z / pn2 | | 77 | carriage return / mask | `cr` (453), `rch` mask |
| 44 | m | s2z / pnh | | | | |
| 45 | n | s2z / pn4,pn7,pn9 | | | | |
| 46 | o | pn7 / pnc,pnh | | | | |
| 47 | p | s2z / pnc,pnd | | | | |

Red/black ribbon shifts (`35`/`34`) are how `red`/`blk` type the error indication in red ([§F](#f-error-code-catalog)). **Code `21` is the slash `/`** — the spec's measure bar and title terminator ("for the Compiler, the bar is represented by the slash `/`"; "the title is all material … through the first slash `/`", [*MusicCompiler-a.pdf*](../prs-docs/MusicCompiler-a.pdf), pp. 1, 8), and the title reader `pg` confirms it by reading until `21` (line 420). Earlier drafts mislabeled `21` as the vertical bar `|`; the `// |` source comment is Samson annotating the slash with a bar-line mark. Codes `30` (y) and `71` (i) are **confirmed** by the pseudo-name strings (`pna`=key, `pnc`=copy, `pn9`=units); `33` (comma) and `67` (g) are **inferred** from the scan-1 handlers that count them (the spec confirms the comma's and `g`'s *roles* — copy-previous and grace note — at [*MusicCompiler-a.pdf*](../prs-docs/MusicCompiler-a.pdf), pp. 2, 7). Code `77` is typed by `cr` (apparently a carriage return) and also used as a mask in `rch`/`rp`. Codes not appearing above (e.g. 31, 32, 66, 75, 76) are **not pinned down by in-source comments** — treat as unknown.

**Pseudo-command names** (decoded from `pn1..pnh`, confirmed): `pn1`=s, `pn2`=l, `pn3`=e, `pn4`=end, `pn5`=bass, `pn6`=treble, `pn7`=tenor, `pn8`=alto, `pn9`=units, `pna`=key, `pnb`=rest, `pnc`=copy, `pnd`=up, `pne`=down, `pnf`=h, `png`=q, `pnh`=tempo.

---

## F. Error-code catalog

Each diagnostic is a 3-letter FIODEC code passed to `complaint`/`compla` (non-fatal, `jda er`) or `error` (`jda er1`). Codes are raised as `complaint flexo XXX` / `error flexo XXX`. The **`meaning` and `effect` columns are authoritative** — they are Peter Samson's own error table ([*MusicCompiler-b.pdf*](../prs-docs/MusicCompiler-b.pdf), p. 11, "Figure 4 ERRORS"); the bracketed `[xyz]` markers in the language spec ([*MusicCompiler-a.pdf*](../prs-docs/MusicCompiler-a.pdf)) point at these codes. The **`raised at`/trigger** column is read from the code and remains the doc set's own analysis. Only the byte-level Flexowriter typing of these codes is "not emulator-verified." (Three of the earlier educated guesses were wrong and are corrected below: `unc` is *not* "unclear count" but **unprepared comma**; `tic` is *not* "triplet incomplete" but **time in comma note**; `etr` is *not* "terminal redundant" but **embellishment in triplet**.) The two `s3x`/`rrz` table-overflow messages are full English text, not 3-letter codes.

| Code | Kind | Meaning (per spec) | Effect (per spec) | Raised at / trigger (code analysis) |
|---|---|---|---|---|
| `air` | complaint | accidental in rest | accidental ignored | `s2s` / 954: `lt`>1 with `aci+ete` present. Written `complaint flex air` — `flex` is a retype slip for `flexo` ([§G](#g-6-character-significance-vs-retype-typos)). |
| `aor` | complaint | accidental out of range | note replaced by rest | `s41` / 976: `nt[ton]+acc` < 2 or ≥ 77. Written `compalint flexo aor` — `compalint` is a retype slip for `complaint`. |
| `bbl` | complaint | bad bar label | bar label ignored | after `s15`/`s18` / 747: bar-count mismatch `n1 ≠ tbc` (`testel n1,tbc,te`). |
| `blc` | error | bad left argument to "copy" | "copy" ignored | `co3` / 1460: copy source `n1` is 0 or ≥ current tape bar `tbc`. |
| `brc` | error | bad right argument to "copy" | "copy" ignored | `co6` / 1467: copy end `< cbh` (copy-begins-here). |
| `dtu` | complaint | dot underflow | time truncated to 64th | `s1p`→`s1o` / 822: dotted value with `fu` already exhausted (`test1 fu`). |
| `eit` | complaint | embellishment on illegal time | embellishment ignored | `s79` / 1004: figure won't fit, `ex = nft − ebl[]` came out negative (`trpl s73` failed). |
| `eor` | complaint | embellishment out of range | embellishment ignored | `s39` / 1116: neighbor `tnf`/`tnd` pitch < 2 or > 76. |
| `ert` | error | erroneous time | note ignored | `s1v` / 651: note value not a power of two / out of range (`s1n`/`s1p`). (Distinct from the `ert,` routine *label* at line 569.) |
| `etr` | complaint | embellishment in triplet | embellishment ignored | `s72` / 993: `ete` set while `3i` (triplet) set at `s30`. |
| `ilc` | error | illegally located "copy" | "copy" ignored | `pvc` / 1446: `copy` issued mid-measure (`test0 mm`). |
| `ilr` | error | illegally located "rest" | "rest" ignored | `pvb` / 1403: `rest` issued mid-measure (`test0 mm`). |
| `itg` | complaint | insufficient time for grace notes | grace note(s) ignored | `2s2` / 932, `te1` / 1205: grace-note robbery exceeds available time, or leftover `rob` at the terminator. |
| `mtl` | complaint | measure too long | long measure compiled | `te` path / 1200: `mm > 3u` (`tles 3u`). |
| `mts` | complaint | measure too short | short measure compiled | `te9` / 1202: `mm < 3u`. |
| `nor` | complaint | mixed accidentals | natural assumed | `s24` / 875, `s26` / 881: sharp/flat after natural, or natural after sharp/flat. |
| `nps` | error | no such pseudoinstruction | word ignored | `pcz` / 665: index ran past the pseudo name table (`tgrec npi`). |
| `tff` | error | too few fields in note | note ignored | `s1x` / 647: count/sign check failed (`r+g+ucd−2` minus). |
| `tic` | complaint | time in comma note | comma ignored | `s2t` / 944: comma note carries a pending fraction (`test0 fu`). |
| `tmc` | complaint | more than one comma in note | one comma assumed | `s1g` path / 761: too many commas (`tlesc 2,s1h` failed); forced to 1. |
| `tme` | complaint | too many embellishments in note | last embellishment taken | `s28`→`s29` / 898: `ete` already set (`test0 ete`). |
| `tmf` | error | too many fields in note | note ignored | `s1z` / 645: `cm+r+ucd` exceeds 2 (`s1h`, `tgrec 2,s1y`). |
| `tmg` | complaint | too many "g"s in note | one "g" assumed | `s1f` path / 757: too many `g`'s (`tlesc 2,s1g` failed); forced to 1. |
| `tmr` | complaint | too many "r"s in note | one "r" assumed | `s1e` path / 753: too many `r`'s (`tlesc 2,s1f` failed); forced to 1. |
| `tms` | complaint | too many "s","l","e" in note | last occurrence rules | `s2r` / 908: `si` set and `≠1` (`test0 si`/`trel (1`). |
| `uat` | complaint | unavailable tone | note replaced by rest | `s40` / 964: `ton` minus or `≥44` (`trmi`/`tlesc 44`). |
| `unc` | error | unprepared comma (no note before it) | note ignored | `s1w` / 649: a comma with nothing before it (`s1m` path). |

> The `er`/`er1` machinery prints, once per offending measure, the header **"To err is human---to forgive, divine."** (the `text` block at `hc1d.mac` lines 573–576), then re-types the measure from the `f` buffer with the bad character in **red** and the 3-letter code appended. The `kind` column (complaint vs. error) is the doc set's reading of which macro raises each (`compla`/`jda er` vs. `error`/`jda er1`); Samson's table lists meanings and effects, not that internal distinction.

---

## G. 6-character significance vs retype typos

This MACRO assembler is significant to **six characters** and folds case to **UPPER**. So fully-spelled words in the body still resolve to the 6-char macro/symbol — these are **correct**, not typos:

| As written | Folds to | Same as macro/symbol | Used at |
|---|---|---|---|
| `complement` | `COMPLE` | `comple` (`cma`) | 462, 1000, 1331, 1439, 1472 |
| `complaint` | `COMPLA` | `compla` (→ `er`) | 747, 753, 757, … |
| `dispatch` | `DISPAT` | `dispat` | 849, 1030, 1094, 1246 |
| `diswith` | `DISWIT` | `diswit` | 520 |

Treated as the same token throughout the docs (rule stated once here).

These four are **genuine retype slips** (not explained by 6-char folding; the symbol dump shows them undefined with a `?`). Flagged inline where they occur; **not** silently corrected — hc1d is documented as written:

| As written | `.mac` line | Likely intended | Symbol-dump status |
|---|---|---|---|
| `setp1` | 593 | `step1` (`idx`) | `?SETP1 0000` (undefined) |
| `setpa` | 860 | `stepa` (`law`/`add`/`dac`) | `?SETPA 0000` (undefined) |
| `compalint` | 976 | `complaint` | `?COMPAL 0000` (undefined) |
| `flex` | 954 | `flexo` | `?FLEXO 0000` (undefined; reached via the `air` line) |

---

## H. Assembler situation & not-emulator-verified surface

### Re-assembly with `macro/macro1`

`hc1d.lst` / `hc1d.err` are a **modern re-assembly** and emit **171 diagnostics**. The modern reimplementation:

- **lacks the original `text` and `flexo` pseudo-ops** — every English string (`text /.../`) and FIODEC literal (`flexo xxx`) is rejected, so the words inside each message body (`TO`, `IS`, `HUMAN`, `FORGIV`, etc.) read as undefined symbols.
- **is stricter about blanks** — many diagnostics on indented continuation lines.
- **tries to assemble the bare title line** (`harmony compiler phase 1 : 5/21/63`) → `HARMON`, `COMPIL`, `PHASE` undefined.

**Consequence:** the text/flexo blocks emit the wrong word count, so the **octal addresses in the listing DRIFT** and are **not reliable**. Therefore:

- Headline and cross-reference everything by **symbolic label + `hc1d.mac` line range**.
- The octal addresses in [§A](#a-symbol--label-map-routine-roles) come from the `-d` symbol dump and are labelled **approx** — use them only to orient.

### Not-emulator-verified list

The TS emulator (`src/pdp1/cpu.ts`) implements the PDP-1 **player's** needs, not hc1d's front-panel I/O. The following are documented from PDP-1 / MACRO knowledge and are **not emulator-verified**:

- IOTs: `tyo`, `rrb`, `rpa` (incl. `rpa-i`), `cks`, `ppa`, `ppb` ([§D](#d-instruction-cheat-sheet--hc1d-delta-only)).
- The `text` and `flexo` assembler pseudo-ops.
- All FIODEC bit-level mappings ([§E](#e-fiodec-flexowriter-chart)).
- The I/O routines that call the above: `wr`, `rp`, `rpr`, `fee`, `ppp`, `cr`, `red`, `blk`, `print`, `type`, `write`, `feed`.

Emulator-verified: the core ops (`lac`/`dac`/`add`/`sub`/`and`/`xor`/`idx`/`isp`/`sad`/`sas`/`jmp`/`jsp`/`jda`/`law`/`cma`/`cla`/the shift-rotate and skip groups), plus `lat` and `rpb`.

---

## What this accomplishes

These tables are the operating index for the rest of the hc1d doc set: the symbol map locates a routine, the variable and macro tables let you expand any body line into raw PDP-1 instructions, the instruction delta and FIODEC chart cover the bits the player's emulator never sees, and the error catalog maps every red-ribbon diagnostic back to the line that raised it. With these in hand, the walkthroughs can quote source in macro-call form and trust you to expand it.

→ Return to the section walkthroughs (the primer, `rch`/`rp` input layer, scan-1, scan-2, the pseudo/`pc` layer, and the `pv4` tape-punch) for the algorithmic narrative behind each label above.
