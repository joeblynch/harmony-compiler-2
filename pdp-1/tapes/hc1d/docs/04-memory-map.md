# Memory map and variables

This is the reference section for *Harmony Compiler phase 1* (`hc1d.mac`): where things live in core. It covers the constants block (`hc1d.mac` lines 1576-1602) that lays out the buffers, the three pitch tables, and the compiled-note/bar arrays; and the temp-storage block (`hc1d.mac` lines 1484-1574) that holds the per-routine working variables, each reproduced with its author comment.

This file is meant to be consulted, not read straight through. The walkthrough sections reference these symbols by name; come here to find out what `nl`, `ton`, `tne`, `mbh`, or `bgs` actually *is*.

For core instruction semantics referenced in passing (`copy`, `idx`, ones-complement, `dac`/`lac`), see [`../../pdp1m13/docs/02-pdp1-primer.md`](../../pdp1m13/docs/02-pdp1-primer.md). The output-tape format this program *produces* — the note/bar word layout consumed by *PDP-1 Music 13* — is documented in [`../../pdp1m13/docs/05-data-formats.md`](../../pdp1m13/docs/05-data-formats.md); this section covers only the *in-core* layout that feeds the punch.

> A note on addresses: the modern `macro/macro1` re-assembly emits 171 diagnostics and the resulting `.lst` octal addresses **drift** (the `text`/`flexo` text blocks emit the wrong word count). All of the absolute numbers below come either from a literal in the source (e.g. `bar=7750`, `mt=.-200`) or from relative `=` definitions; where an address could only come from the unreliable symbol dump it is marked **approx**. Headline by symbolic label, not by address.

---

## The constants block (`hc1d.mac` lines 1576-1602)

The whole compiler's memory layout is defined in this short block at the end of the program. It is read as one running computation: `.` is the current assembly location, and each `=` line is evaluated in order, so the symbols stack up contiguously in core.

```
mt=.-200	/from .-100, 2006-02-25  --prs.
kt=mt+44
nt=kt+44
        ...
bar=7750
f=0
fb=.
foo=105
fw=fb+400
fl=fw+200
not=fl+1
all=bar-not-1
npi=pn1-pnm
```

### The character buffer `f` (`fb` / `fw` / `fl`)

| Symbol | Definition | Octal (approx) | Meaning |
|---|---|---|---|
| `f` | `0` | `0` | Source-character buffer **base name** (used as an index origin: cell `f+i` is character *i*). |
| `fb` | `.` | (load point) | Buffer **start** — the first real cell of the source-character buffer, set to wherever the program code happens to end. |
| `fw` | `fb+400` | `fb+400` | A boundary `400` (256.) words above `fb`. Tested in the reader `rch` as a "warn" threshold: `tlesc fw, rcs` (`hc1d.mac` line 513). |
| `fl` | `fw+200` | `fw+200` | The buffer **limit**, `200` (128.) words above `fw`. Tested in `rch` as the hard "buffer full" threshold: `tlesc fl, rce` (`hc1d.mac` line 515), and `trnl (fl, pg` in `pf` (`hc1d.mac` line 428). |

`f` is the staging area into which `rch` reads raw transcription characters off the paper tape, one FIODEC character per word, before the scanners (`s1`, `s2`) walk over it. The `fb`→`fw`→`fl` ladder gives a soft warning point (`fw`) and a hard end (`fl`) so the reader can complain (via `rcs`/`rce`) before overrunning into the note array.

### The note and bar arrays (`not`, `bar`, `all`)

| Symbol | Definition | Octal | Meaning |
|---|---|---|---|
| `not` | `fl+1` | `fl+1` | Base of the **NOTE-WORD array** — the compiled per-note words, the principal output product. |
| `bar` | `7750` | `7750` | Base of the **BAR-pointer array** — one entry per measure, pointing into `not`. (A fixed high address, near the top of the 4K bank.) |
| `all` | `bar-not-1` | `bar−not−1` | The note-array **capacity**: how many `not` cells fit between `not` and `bar`. Used as the overflow guard, e.g. `tgrec all, s3x` (`hc1d.mac` lines 460, 469). |

`not` grows *upward* from just past the character buffer; `bar` sits at a fixed ceiling (`7750`); `all` is simply the gap between them, computed at assembly time, so an out-of-range note index is caught by comparing against `all` (`tgrec all, s3x` = jump-if-greater to the error path). The compiled words deposited here (built by `cn` and stored via `putback not, …`, e.g. `hc1d.mac` lines 796, 1112) are what eventually get punched out as the intermediate music tape consumed by *Music 13* (see [`05-data-formats.md`](../../pdp1m13/docs/05-data-formats.md)).

### The three tone tables — the pitch pipeline `nt` → `kt` → `mt`

This is the heart of the compiler's pitch model. **Order matters**, and the `=` chain defines them *backwards* in address from the way data flows through them:

```
mt=.-200	/from .-100, 2006-02-25  --prs.
kt=mt+44
nt=kt+44
```

So in **ascending address** the layout is `mt`, then `kt = mt+44`, then `nt = kt+44` — three contiguous `44`-octal (36.) entry tables, each with one slot per staff position. (`44` octal = 36 decimal; the `nt/ … ` initializer at `hc1d.mac` lines 1582-1587 lists exactly 36 values.)

| Symbol | Definition | Octal (approx) | Role | "momentary"→"keyed"→"canonical" |
|---|---|---|---|---|
| `nt` | `kt+44` | top of the three | **Canonical** tone table — the fixed natural-scale pitch for each staff position. Constant; never written at run time. |
| `kt` | `mt+44` | middle | **Keyed** tone table — `nt` after the current **key signature** is applied (sharps/flats from the `key` pseudo). |
| `mt` | `.-200` | bottom (lowest of the three) | **Momentary** tone table — `kt` after a **momentary accidental** (a sharp/flat/natural that applies to one note). |

The data flows `nt` → `kt` → `mt`, refreshed by two block copies at `pun`/`pue` (`hc1d.mac` lines 1362-1363):

```
pun,	copy nt, kt, 44		/ canonical -> keyed  (apply key signature)
pue,	copy kt, mt, 44		/ keyed -> momentary  (reset accidentals)
```

`copy H,I,N` block-copies `N+1` words from table `H` to table `I` (macro defined `hc1d.mac` lines 289-300; the loop runs until `sas (dac I+N`, so the store into `I+N` *is* performed). So `pun` rebuilds the keyed table from the canonical one (then the `key` handler mutates `kt` for each sharp/flat), and `pue` resets the momentary table to the keyed baseline at the start of each note (then a momentary accidental mutates `mt`). The comment at `pfr` (the per-part init that ends with `goto pum`, `hc1d.mac` line 449, *"copies nt to kt to mt, goes to s1"*) describes the full cascade.

At note-formation time the scanner indexes into these tables through two pointer variables: `tne` ("tone pointer to table; letter changing") indexes `nt`/`kt`/`mt` by note letter, and `ton` ("tone pointer to staff (mt)") points at the resolved `mt` slot for the staff position (`hc1d.mac` lines 1517-1518; see uses at lines 961-1020). The pitch finally landed in a note word is the `mt` entry — i.e. canonical scale, adjusted by key, adjusted by any momentary accidental. (The musical interpretation of the cascade is **inferred** from the variable comments and the `copy` order; the bit-level `mt` lookup is grounded in the source at `s31`/`s42`, `hc1d.mac` lines 978-982.)

The canonical values (`hc1d.mac` lines 1582-1587), 36 entries, are the semitone numbers of the natural scale across the staff:

```
nt/	2	4	6	7	11	13
	15	16	20	22	23	25
	27	31	32	34	36	37
	41	43	45	46	50	52
	53	55	57	61	62	64
	66	67	71	73	75	76
```

### `mt = .-200` and the staff offsets `sr` / `st`

The `--prs` retype comment notes `mt` was moved from `.-100` to `.-200` on 2006-02-25, i.e. the table region was given more headroom below the constants. Staff positions are addressed into `mt` via the relocation/location variables `sr` (staff reloc. count) and `st` (staff location, `0 = subbass`), built up in `s2` (`hc1d.mac` lines 833, 862-864, 959-961). The pseudo handlers set `st` to fixed clef bases: `bass` → `st=12`, `tenor` → `st=16`, `alto` → `st=20`, `treble` → `st=26` (`pv5`-`pv8`, `hc1d.mac` lines 1286-1292; also the default `sett st, 26` at line 448). (The clef→`st` mapping is **confirmed** by the in-source comments at `pv5`-`pv8`.)

### Miscellany in the constants block

| Symbol | Definition | Meaning |
|---|---|---|
| `npi` | `pn1-pnm` | Offset from the pseudo-name **pointer table** `pnm` (`hc1d.mac` lines 1251-1253, the list of pointers to the `pn1`…`pnh` strings) to the first string `pn1` (the FIODEC strings live at `hc1d.mac` lines 1255-1271). **Inferred** to convert a `pnm`-table index into a string address; the dispatch table `pnm` is read directly via `lookup pnm-1` (`hc1d.mac` line 1229). |
| `foo` | `105` | A bare constant (`105` octal); name suggests scratch/placeholder. **Inferred** to be a stray/utility constant — no in-source comment pins its use. |
| `11a` / `11b` / `11c` | `not` / `bar` / `u` | Aliases (`hc1d.mac` lines 1599-1601). Evidently DDT/debug handles for the note array, bar array, and the start address `u`. **Inferred** from the names; no comment. |
| `start u` | — | Sets the program start point to label `u` (`hc1d.mac` line 1604): execution begins in the reader/control routine. |

---

## The temp-storage block (`hc1d.mac` lines 1484-1574)

A flat block of one-word cells, each initialized to `0` and each carrying an author comment naming the **owning routine** and the cell's purpose. Reproduced below verbatim (comment text preserved), grouped by owning routine. These cells are the program's entire mutable state; many are shared between scan pass 1 (`s1`) and scan pass 2 (`s2`).

> Read the leading tag in each comment (`/s1`, `/s2`, `/rch`, `/er`, …) as "this cell belongs to that routine." A few cells are shared and list two owners (e.g. `ldl /s1, s2`).

### Scan pass 1 — character/field tokenizer (`s1`)

`s1` walks the `f` character buffer counting numeric vs. non-numeric fields, gs, rs, commas, and tracking running time.

| Cell | Line | Author comment |
|---|---|---|
| `ldl` | 1484 | `s1, s2: preceding char. numeric? 1/yes, 0/no.` |
| `ucd` | 1485 | `s1: number of num. fields read` |
| `num` | 1486 | `s1, rin: value of num. field` |
| `n1` | 1487 | `s1: first number` |
| `n2` | 1488 | `s1: last number of 1 or 2` |
| `psi` | 1489 | `s1: character count` |
| `chi` | 1490 | `s1: nun-numeric char. count` *(sic — "non-numeric")* |
| `fc` | 1491 | `s1, s2: fraction status` |
| `fu` | 1492 | `s1, s2: fraction used` |
| `g` | 1493 | `s1: count of g's` |
| `r` | 1494 | `s1: count of r's` |
| `cm` | 1495 | `s1: count of commas` |
| `rt` | 1496 | `s1: right indicator: 0/num, 1/g, 2/cm.` |
| `lt` | 1497 | `s1: left indicator: 0/num, 1/r, 2/cm.` |
| `tim` | 1498 | `s1: running time` |
| `trm` | 1499 | `s1: terminator` |
| `tc` | 1503 | `s1: terminator count within measure` |
| `dig` | 1505 | `s1: digit read` |

### Scan pass 2 — note builder (`s2`)

`s2` is the large pass that resolves pitch (via `nt`/`kt`/`mt`, `ton`/`tne`), accidentals, embellishments, triplets, grace notes, and time, then forms each note word.

| Cell | Line | Author comment |
|---|---|---|
| `chr` | 1504 | `s1, s2, pc, ri: character read` |
| `ss` | 1506 | `s2: running status of sle indicator` |
| `sv` | 1507 | `s2: value of ss for particular note` |
| `sr` | 1508 | `s2: staff reloc. count` |
| `st` | 1509 | `s2: staff location (0=subbass)` |
| `3i` | 1510 | `s2: triplet ind.: 0/no, 100000/yes.` |
| `aci` | 1511 | `s2: accid. ind.: 0/none, 1/sharp or flat, -1/natural.` |
| `acc` | 1513 | `s2, key: accid. count` |
| `et` | 1514 | `s2: embell. temp.` |
| `ete` | 1515 | `s2: embell. terminal` |
| `ton` | 1517 | `s2, key: tone pointer to staff (mt); not changing` |
| `tne` | 1518 | `s2, key: tone pointer to table; letter changing` |
| `tnd` | 1519 | `s2: tne-1 for embell.` |
| `tnf` | 1520 | `s2: tne+1 for embell.` |
| `nl` | 1521 | `s2: note location in not` |
| `nft` | 1522 | `s2: note formed, time part` |
| `nfp` | 1523 | `s2: nft preserved from robbery` |
| `ex` | 1524 | `s2: time for sustained note` |
| `cut` | 1525 | `s2: time not available to trill loop` |
| `mm` | 1526 | `s2: units*3 used in measure to date` |
| `tu` | 1527 | `s2: units*3 used by current note` |
| `sid` | 1539 | `s2: si delayed` |
| `nld` | 1540 | `s2: nl delayed` |
| `ccc` | 1541 | `s2: triplet status of last non-comma note` |
| `nls` | 1542 | `s2: nl saved` |
| `rob` | 1543 | `s2: time desired by grace notes` |
| `gi` | 1544 | `s2: grace note indicator` |
| `gis` | 1545 | `s2: gi saved` |
| `si` | 1548 | `s2: 0/no sle in note; 1/sle` |

> Line 1512 carries a comment with **no preceding label**: `/key: spacing`. It is a dangling comment sitting between `aci` (1511) and `acc` (1513), evidently a note that the `key` handler also uses this region for spacing. **Inferred**: it documents `acc`'s alternate role under `key` (which line 1513 also tags), not a separate cell.

### Note former (`cn`)

| Cell | Line | Author comment |
|---|---|---|
| `nf` | 1516 | `cn: note forming` |

### Read-character / measure reader (`rch`)

`rch` reads transcription characters off the tape into `f` and tracks measure boundaries and the `"end"` sentinel.

| Cell | Line | Author comment |
|---|---|---|
| `mbh` | 1530 | `rch: pointer to beginning of measure in f` |
| `bgs` | 1555 | `rch: "end" counter` |
| `fi` | 1556 | `rch: f index` |
| `ft` | 1557 | `rch f top` |
| `pp` | 1558 | `rch: saves character` |
| `ch` | 1559 | `rch: character from tape` |
| `fl1` | 1560 | `rch: location in f of last terminator` |
| `fl2` | 1561 | `rch: loc. in f of last termin. before new word` |

### Bar/measure bookkeeping (`te`, `sbc`)

| Cell | Line | Author comment |
|---|---|---|
| `bc` | 1501 | `te: bar count` |
| `tbc` | 1502 | `sbc: bar count within tape` |
| `lmb` | 1531 | `te: last measure starting index in not` |

### Pseudo-command dispatcher (`pc`) and units (`ps`)

`pc` parses the pseudo-command names (`s`, `l`, `bass`, `key`, `tempo`, …); `ps` handles units arithmetic and the argument-return switch.

| Cell | Line | Author comment |
|---|---|---|
| `ao` | 1500 | `ps: arguments outstanding` |
| `1u` | 1528 | `ps: 1*units` |
| `3u` | 1529 | `ps: 3*units` |
| `tht` | 1532 | `pc: index of pseudo under investigation` |
| `zet` | 1533 | `pc: character position in pseudos` |
| `ucl` | 1534 | `pc: switch internal to pc` |
| `bgm` | 1535 | `pc: another switch` |
| `psw` | 1537 | `ps: switch for return with argument` |

### Random / transposition / pseudo-handler state (`rnd`, `pvd`/`pve`, `pf`, `pvc`, `pvb`, `ri`)

| Cell | Line | Author comment |
|---|---|---|
| `rn` | 1536 | `rnd: random number` |
| `tll` | 1546 | `pvd, pve: transposition semitone count` |
| `pfu` | 1547 | `pf, key: identity check for title; switch: sh. or fl.` |
| `cbh` | 1549 | `pvc: copy begins here` |
| `irl` | 1550 | `pvb: is rest location?` |
| `np` | 1551 | `pf: no. of parts` |
| `rii` | 1552 | `ri: index on read` |
| `rij` | 1553 | `ri: index on write or compare` |
| `riw` | 1554 | `ri: switch for compare or write` |

### Error / complaint reporter (`er`)

`er` (and `er1`) type diagnostics on the Flexowriter, locating the offending character within `f` and the measure.

| Cell | Line | Author comment |
|---|---|---|
| `chy` | 1562 | `er: charac. from f to be printed` |
| `arg` | 1563 | `er: flexo name of error` |
| `uin` | 1564 | `er: internal switch` |
| `etc` | 1565 | `er: internal terminator count` |
| `blc` | 1566 | `er: bell count` |
| `mjp` | 1567 | `er: last measure having error` |
| `tjp` | 1568 | `er: termin. count in meas. for last error` |
| `emp` | 1569 | `er: internal index on f` |

### Ribbon-shift state (`red` / `blk`)

| Cell | Line | Author comment |
|---|---|---|
| `rb` | 1570 | `red, blk: +1 blac, -1 red.` *(sic — "black")* |

`red`/`blk` flip the Flexowriter ribbon shift (FIODEC codes `35`/`34`, *not emulator-verified*) so that error text types in **red**; `rb` tracks the current ribbon state (`+1` black, `−1` red) to avoid redundant shift characters.

### Scratch (`t1`–`t4`)

General-purpose scratch cells, no owning routine (`hc1d.mac` lines 1571-1574). Used throughout, e.g. `putback not, t1` / `putback mt, t1` (`hc1d.mac` lines 796, 979).

| Cell | Line | Author comment |
|---|---|---|
| `t1` | 1571 | *(none)* |
| `t2` | 1572 | *(none)* |
| `t3` | 1573 | *(none)* |
| `t4` | 1574 | *(none)* |

---

## What this accomplishes

The constants block fixes a single contiguous core layout: the source-character buffer `f` (`fb`→`fw`→`fl`), then the compiled NOTE-WORD array `not` growing upward toward the fixed bar-array ceiling `bar=7750`, with `all` as the computed capacity guard; and below the constants, the three `44`-entry pitch tables in ascending address `mt` < `kt` < `nt`, wired as a **canonical (`nt`) → keyed (`kt`) → momentary (`mt`)** pipeline refreshed by the `copy`s at `pun`/`pue`. The temp-storage block holds every mutable cell the two scan passes, the dispatcher, the reader, and the error reporter use — each tagged in the source with its owning routine and purpose, exactly as transcribed above.

Next: the scan passes (`s1`, `s2`) and the note former (`cn`) that read `f`, walk the `nt`/`kt`/`mt` tables through `ton`/`tne`, and deposit words into `not`.
