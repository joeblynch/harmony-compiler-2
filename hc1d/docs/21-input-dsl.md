# The input language (the music transcription DSL)

This section reverse-engineers the language a copyist types on the **source tape** that *Harmony Compiler phase 1* (`hc1d`) reads. `hc1d` is the **producer**; the note/bar tape it punches is the **consumer** format described in [`../../pdp1m13/docs/05-data-formats.md`](../../pdp1m13/docs/05-data-formats.md). Read that first: it pins down the exact bit layout of a compiled note word, and the language documented here is best understood as "what a human types so that those bits come out."

All numbers are **octal**. The PDP-1 is 18-bit ones-complement; for the core opcodes (`lac`/`dac`/`add`/`sub`/`idx`/`sad`/`sas`/the skip group/the shift `Ns` notation) see [`../../pdp1m13/docs/02-pdp1-primer.md`](../../pdp1m13/docs/02-pdp1-primer.md). The macro layer (`load`, `store`, `call`, `answer`/`exit`, the `tr*`/`test*`/`t*` skip-and-jump macros, `lookup`/`dispat`/`putback`) is the program's Rosetta Stone; it is defined once in the primer/appendix of this doc set and used silently here.

There is **no decoded sample source tape in this repository** (the only candidate, `macro/gemsOfTheBaroque.bin.gz`, lives in the git-ignored scratch directory and is a binary artifact, not decoded here), so the syntax below is reconstructed from the recognizer tables (`s2z`, `pn*`) and the handlers (`s1`, `s2`, `pv*`). What is **certain** is the FIODEC decode of every recognized character and the pseudo-command names; what is **inferred** is the precise musical effect of several articulation/embellishment letters, and that is flagged throughout.

## The shape of a score

The tape is read by `rch` (the buffered character reader, `hc1d.mac` line 483), which hands one FIODEC character at a time to the scanner. The program runs two passes over each musical event:

- **Scan 1** (`s1`, lines 677–827) is the **lexical / rhythmic** pass. It collects digits into numbers (`num`, `n1`, `n2`), counts the rhythm-modifier letters (`r`, `g`, comma), tracks the fraction state, and computes the **duration** `tim` of the event. It does not care which pitch you wrote.
- **Scan 2** (`s2`, lines 832–1144) re-reads the *same* run of characters (`s2` calls `rrc` at line 840 to rewind the buffer index, then re-reads via `rch`) and does the **pitch / articulation** work: it reads the note letter, applies accidentals, staff relocation and clef, looks the pitch up through the three tone tables, applies embellishments, and finally calls `cn` to deposit one or more 18-bit **note words** into the `not` array.

Both scans are driven character-by-character and both stop at the same **terminator** (`trm`). Which token a field is is decided in scan 1's terminator handler `s18` (line 738): a field whose characters are entirely a recognized pseudo-command word is sent to `pc` (`trze pc`, line 743); otherwise it is a note. The terminator routine `te` (line 1193) is the post-event handler: it advances the measure/bar bookkeeping and decides whether to read **another note** (terminator was a space, `test0 trm, s1`) or close out **a bar line** (terminator `21`). So a score is, structurally, a stream of **fields** separated by terminators:

```
<duration-and-rhythm>  <note-letter+accidentals+embellishments>  <terminator>
```

The recognized terminators (and bar/measure separator) come from `s2z` below: a note ends at a **space** (`00`), a **bar line `|`** (`21`), or implicitly when a non-note character forces the issue. The vertical bar `|` (FIODEC `21`, confirmed by the `/ |` comment at line 1164 and the `(21` literal compared all over `s1`/`rch`/`te`) is the **measure separator**.

## 1. Lexical layer: numbers, durations, fractions (scan 1)

### Numbers → `n1`, `n2`

`s1` (line 677) zeroes its state, then loops at `s10`:

```
s10,    call rch
        store chr
        trze s11          / blank/terminator (chr = 0) -> s11 (end of a field)
        tgrec 20, s11     / char > octal 20 -> s11 (not a digit)
```

A character whose code is `<= 20` octal is treated as a **digit** (the FIODEC digit codes `1`–`11`, i.e. 1–9, with `0` = code `20`; `s13` maps code `20` to value 0). For each digit `s12`…`s14` shifts the running value:

```
s14,    store dig
        load num
        x10dec            / AC := AC*10  (ral 1s; dac t1; ral 2s; add t1)
        addi dig
        store num         / num := num*10 + dig   (decimal accumulate)
```

`x10dec` is the decimal-shift helper: `ral 1s` makes `AC*2` (saved in `t1`), the next `ral 2s` rotates that further to `AC*8`, and `add t1` gives `AC*8 + AC*2 = AC*10`. So a maximal run of digits builds a decimal integer in `num`.

When a non-digit arrives, `s11` files `num`:

```
s11,    test0 ldl, s15    / if previous char was non-numeric, no number to file
        zero ldl
        test0 ucd, s17    / ucd = count of numeric fields so far
        tgrec 1, s16      / already saw 2+ numbers -> drop this one
        move num, n2      / 2nd field -> n2
        goto s16
s17,    move num, n1      / first numeric field -> n1
        store n2          / and n2 := n1
        zero num
s16,    step1 ucd
```

So a field may carry **one or two numbers**: the **first** goes to `n1`, the **second** to `n2` (`ucd` counts how many were seen; `ldl` = "previous char was numeric", from the variable comments at lines 1484–1488). A third or later number is silently dropped (`tgrec 1, s16`). `n1` is later used as the **staff position** (the note's place on the staff; see §4) and as the argument to most pseudo-commands; `n1`/`n2` together drive the **duration** computation. The exact musical reading of a two-number field is the duration-fraction notation, next.

### Duration, fractions, and the `r`/`g`/`,` modifiers

After the field's number(s) are filed, `s15` (line 715) inspects the **non-numeric** characters of the field and tallies the rhythm modifiers:

```
s15,    test0 chr, s18        / a real terminator (chr = 0) -> s18 (compute duration)
        trel (21, s18         / a bar line | also terminates
        step1 chi             / else count this non-numeric char
        ...
        ftrel (73, s19        / 73 = '.'  -> commit + halve fraction (dotted)
        ftrel (27, s1a        / 27 = 'x'  -> halve the fraction unit
        ftrel (51, s1b        / 51 = 'r'  -> step1 r
        ftrel (67, s1c        / 67 = 'g'  -> step1 g
        trel (33, s1d         / 33 = ? (comma, inferred) -> step1 cm
        goto s10
```

The fraction machinery uses two cells initialized at `s1` to `fc=40`, `fu=100` (lines 685–686), the "fraction status" and "fraction used" (variable comments, lines 1491–1492):

```
s19,    move fc, fu       / '.' : copy the current fraction status into fu, then
s1a,    halfof fc         / '.'/'x' : halve fc (sar 1s)
        goto s10
```

So a **period** `.` (FIODEC `73`, confirmed by the `/.` comment at line 1162) is the familiar **dotted-note** mark — it commits the current fraction status (`move fc, fu`) and then halves it, exactly the "add half again" geometry of a dot. An **`x`** (`27`) halves the fraction status without committing it. (That `.` is the dot and `x` halves it is *inferred* from the `fc`/`fu` halving arithmetic and the dotted-note convention; the source carries no prose comment.)

The three counters incremented at `s1b`/`s1c`/`s1d` are `r`, `g`, and `cm` (comma). Their roles surface at `s1e`–`s1t` (lines 750–782), which translate them into the **left/right indicators** `lt`/`rt`. From the variable comments (lines 1496–1497):

```
rt,  0   / s1: right indicator: 0/num, 1/g, 2/cm.
lt,  0   / s1: left indicator:  0/num, 1/r, 2/cm.
```

So a field can carry a number on a *left* side and a *right* side, separated by a **comma** (`cm`): per these comments **`r`** drives the **left** indicator (`lt := 1`) and **`g`** drives the **right** indicator (`rt := 1`); a comma sets the relevant indicator to `2`. `s1e` enforces "too many" limits with non-fatal complaints — `flexo tmr` ("too many r"), `flexo tmg`, `flexo tmc` (lines 753/757/761), and clamps each count to 1 (`sett r, 1` etc.). This is the **grace-note / time-borrowing notation**: scan 2 later moves time into `rob` ("time desired by grace notes", line 1543) and sets `gi`/`gis` (grace indicators) on the `g` path (`2s1`, line 935). The detailed semantics (which side borrows time from which note) are *inferred* from these variable names and the `rob`/`gi` flow in `s2`; treat "`r`/`g`/`,` are grace-note / time-borrowing markers, `r`→left and `g`→right" as the certain part (it is in the `lt`/`rt` comments) and the exact borrowing rule as inferred.

### Computing the duration `tim`

`s18` (line 738) finishes scan 1 by turning the numbers and fraction state into a running time. The key path (lines 783–827):

- With **no `r`** and a numeric duration, the time is scaled relative to the **units** length (the `units` pseudo, §5) and the fraction `fu`.
- `s1q` (line 813) repeatedly halves `t1`, `tim`, and `fu` together while doubling `t2`, i.e. it divides the unit by a power of two to realize a `n/2^k` note value (the binary note-value ladder: whole, half, quarter, eighth…).
- A mismatch raises `flexo dtu` (line 822, "duration unit" complaint) or, for an impossible time, `flexo ert` via `s1v`.

Finally:

```
s1o,    load tim
        halve             / sar 1s
        store fc
        goto s2           / hand off to scan 2
```

`tim` (halved into `fc`) is the duration scan 2 will attach to the note. The duration ends up, after Music 13's own pass, as the **7-bit duration field in 64ths** of [`05-data-formats.md`](../../pdp1m13/docs/05-data-formats.md#2-the-per-voice-note-word).

## 2. Articulations: `s l e h q` → the `ss`/`sv` status bits

Scan 2 reads the note letter and surrounding characters through `s2z`, the **recognized-character table** (lines 1147–1167), and dispatches through the parallel `s2y` jump table (lines 1170–1173). The articulation letters set the **`sv`** cell (per-note value of the running status `ss`):

```
s2b,    sett sv, 200000   / 's'
s2c,    sett sv, 400000   / 'l'
2sr,    sett sv, 20000    / 'q'
2ss,    sett sv, 40000    / 'h'
s2d,    zero sv           / 'e'
s2a,    setpa si, 1       / (likely retype slip for "stepa"): si := si+1, note has an sle
        goto s20
```

(`setpa` at line 860 is a **likely retype slip for `stepa`**; the symbol dump shows `setpa` undefined. Read it as `stepa si, 1` = `law 1; add si; dac si`, "add literal 1 to `si`". Each of `s2b`/`s2c`/`2sr`/`2ss`/`s2d` reaches `s2a` via a `goto s2a` elided above.)

These bit values are written verbatim into the note word's high bits by `cn` (via `s70`: `load nft; addi tne; addi sv; addi 3i; call cn`, lines 1118–1122), and they line up exactly with the **articulation classes** the consumer decodes in `cxt` (see [`05-data-formats.md`](../../pdp1m13/docs/05-data-formats.md#2-the-per-voice-note-word), the `e/q/h/s/l` table): the four articulation bits occupy note bits `{0,1,3,4}` (sets `400000`/`200000`/`40000`/`20000`) and the triplet bit (`3i = 100000`) is bit 2, exactly the partition the consumer reads with its `rcl`/`ril` sequence.

| Letter | FIODEC | Sets `sv` | Music 13 articulation class | Effect (per consumer doc) |
|---|---|---|---|---|
| `s` | `22` | `200000` | s | **staccato** — release 5/8 of the note |
| `l` | `43` | `400000` | l | **legato** — no release, full sounding |
| `e` | `65` | `0` | e | release 1/8 (long note, small gap) |
| `h` | `70` | `40000` | h | release 1/2 (most separation) |
| `q` | `50` | `20000` | q | release 1/4 |

The same five letters are also available as **pseudo-commands** (§5) via `pv1`/`pv2`/`pv3`/`pvf`/`pvg`, which set the **running** status `ss` (the default for subsequent notes) rather than the per-note `sv`. `s2r` (the `|`/space terminator path, line 906) copies `ss` into `sv` when the note carried no explicit articulation:

```
s2r,    test0 si, s51     / si = 0 -> no per-note sle letter -> s51
        trel (1, s52      / si = 1 -> exactly one sle letter -> keep sv
        complaint flexo tms   / si > 1 -> "too many s/l/e"
s51,    move ss, sv       / inherit the running articulation
```

The class **labels** s/l/e/h/q are certain (they are in the consumer `cxt` comments and match these FIODEC letters); the prose meanings (staccato/legato, "small gap", "most separation") are taken from the consumer doc and are its inferences.

## 3. Accidentals: sharp `+`, flat `-`, natural `=`

Scan 2 handles accidentals through three `s2z` entries. From the variable comment (line 1511): `aci` = accidental indicator (`0`/none, `1`/sharp-or-flat, `-1`/natural); `acc` = accidental count.

```
s2h,    testm aci, s24    / '(' = '+' : sharp.  if aci<0 (a natural set) -> s24 error
        step1 acc         / acc := acc+1
        goto s25
s2i,    testm aci, s24    / '-' : flat.  same guard
        istepa acc, 1     / acc := acc-1  (add literal -1)
s25,    sett aci, 1
        goto s20
s24,    complaint flexo nor   / "no repeat" : mixed accidental type
```

```
s2j,    testel aci, (1, s26    / ')' = '=' : natural.  if aci==1 (sharp/flat set) -> s26
s27,    sett aci, -1
        goto s20
s26,    complaint flexo nor    / natural overriding a prior sharp/flat
        zero acc               / clear acc, then fall into s27
        goto s27
```

So:

| Char | FIODEC | Meaning | Effect |
|---|---|---|---|
| `+` | `57` (also typed `(`) | **sharp** | `acc += 1`, `aci := 1` |
| `-` | `54` | **flat** | `acc -= 1`, `aci := 1` |
| `=` | `55` (also typed `)`) | **natural** | `aci := -1` |

FIODEC `57` and `55` are dual-glyph keys (`(`/`+` and `)`/`=` respectively; the `/( +` and `/) =` comments at lines 1153/1155 confirm both readings). A **double accidental** (e.g. `++`) accumulates `acc`. Mixing accidental types raises `flexo nor` (the two `complaint flexo nor` sites, lines 875 and 881): a `+`/`-` after a `=` (the `testm aci, s24` guard), or a `=` after a `+`/`-` (the `testel aci, (1, s26` guard). Note `acc` is **cleared only on the natural-overriding-sharp/flat error path** (`s26` → `zero acc`); a plain `=` from a clean state (`aci = 0`) goes straight to `s27` and leaves `acc` untouched (it is already 0). `acc` is added to the pitch index in `s2v` (`addi acc`, line 971) — i.e. each `+`/`-` shifts the looked-up tone by one semitone, exactly as a sharp/flat shifts a note.

## 4. The staff / clef model: `bass treble tenor alto`, and `n1 + sr + st → tone`

A note's **vertical position** is the leading number `n1` (the staff line/space). It is converted to a tone by `s2u` (line 958):

```
s2u,    load n1           / staff position written by the copyist
        addi sr           / + staff relocation (the a/b octave-letter offsets)
        addi st           / + clef base (the current staff origin)
        store ton         / ton = absolute index into the staff tone table mt
        trmi s40          / negative -> "unavailable tone" complaint
        tlesc 44, s2v     / ton < 44 -> ok, go to s2v
s40,    complaint flexo uat   / "unavailable tone"
```

`st` is the **clef base**, set by the four clef pseudos (lines 1286–1293):

| Pseudo | Sets `st` | Clef |
|---|---|---|
| `bass` | `12` | bass |
| `treble` | `26` | treble |
| `tenor` | `16` | tenor (comment: "from 20, 070418") |
| `alto` | `20` | alto (comment: "from 22, 070418") |

(`st`'s power-on default is `26` = treble, set in `pfr` at line 448; its comment "0=subbass" at line 1509 gives the origin of the scale. The `-- from 20`/`-- from 22` comments record that `tenor`/`alto` were retuned in a 2007 edit; the **as-written** values `16`/`20` are documented here.)

`sr` is the **staff relocation count**, nudged ±`14` octal (one octave = 12 semitones = `14` octal) by the note letters `a` and `b`:

```
s2e,    stepa sr, 14      / 'a' : sr += 14   (up an octave)
        goto s20
s2f,    istepa sr, 14     / 'b' : sr -= 14   (down an octave)
```

`stepa sr, 14` = `law 14; add sr; dac sr`; `istepa sr, 14` = `law i 14; add sr; dac sr` (the literal is the *negative* `14`). So within a field, the letters **`a`** (`61`) and **`b`** (`62`) shift the *register* up/down an octave (this octave reading is *inferred* from the `14`-octal step matching the 12-semitone octave used by the tone tables). These are distinct from the `up`/`down` **pseudo-commands** (§5), which set the separate transposition cell `tll`.

`ton` then indexes the **three-table pitch model** (memory map, lines 1578–1580):

```
mt = .-200    / momentary tone table  (after a momentary accidental)
kt = mt+44    / keyed tone table      (after the key signature)
nt = kt+44    / canonical tone table  (the bare scale)
```

`nt` holds the canonical scale (the explicit values at lines 1582–1587). At the start of each part `pfr`→`pum`→`pun`/`pue` (lines 449, 1361–1364) does `copy nt, kt, 44` then `copy kt, mt, 44`: the canonical scale is copied forward through key then momentary. The `key` pseudo (§5) rewrites `kt`; an accidental in a field rewrites the one `mt` entry for that tone (`s2v`/`s31`, lines 967–990):

```
s31,    load ton
        lookup mt         / mt[ton] = the playable pitch index
        addi tll          / + transposition (up/down pseudo, semitones)
        store tne
```

`tne` (after a range check and an `x2to7` shift into the pitch bit-field, lines 985–990) is the pitch value that `cn` packs into the note word — the 6-bit **pitch** field the consumer reads (`05-data-formats.md`, pitch indices `0`/`1` = rest). `tll` is the transposition count set by the `up`/`down` pseudos (§5). The three-table cascade is the certain part (the labels and `copy` calls are explicit); calling them "canonical → keyed → momentary" follows the variable comments at lines 1517–1518 and the copy order.

## 5. The pseudo-command layer

A field whose text matches a **pseudo-command word** (rather than a note) is recognized by `pc`/`pcd` (lines 1224–1253). `pc` walks the candidate words `pn1`…`pnh` (the FIODEC name strings at lines 1255–1271), matching the typed characters; on a hit it dispatches `pcd-1` (line 1246) to the matching handler `pv1`…`pvh`. The names decode directly from the strings (this matches the recognizer the sibling [`16-pseudo-recognizer.md`](16-pseudo-recognizer.md) covers and the `05-data-formats.md` note-tag values for `end`/`tempo`). All **seventeen** are **certain** decodes:

| Pseudo (`pn`) | Typed word | Handler | Effect |
|---|---|---|---|
| `pn1` | `s` | `pv1` | running articulation `ss := 200000` (staccato default) |
| `pn2` | `l` | `pv2` | `ss := 400000` (legato default) |
| `pn3` | `e` | `pv3` | `ss := 0` (default articulation) |
| `pn4` | `end` | `pv4` | **end of part** — punch this voice's note & bar tape (see below) |
| `pn5` | `bass` | `pv5` | clef base `st := 12` |
| `pn6` | `treble` | `pv6` | `st := 26` |
| `pn7` | `tenor` | `pv7` | `st := 16` |
| `pn8` | `alto` | `pv8` | `st := 20` |
| `pn9` | `units` | `pv9` | set the **unit note value** from `n1` (computes `1u`, `3u`) |
| `pna` | `key` | `pva` | **key signature** — rewrite `kt` (sharps/flats) |
| `pnb` | `rest` | `pvb` | emit `n1` units of **rest** |
| `pnc` | `copy` | `pvc` | **copy** measures `n1..n2` (repeat) |
| `pnd` | `up` | `pvd` | transpose **up** `n1` semitones (`tll := n1`) |
| `pne` | `down` | `pve` | transpose **down** `n1` semitones (`tll := -n1`) |
| `pnf` | `h` | `pvf` | `ss := 40000` |
| `png` | `q` | `pvg` | `ss := 20000` |
| `pnh` | `tempo` | `pvh` | emit a **tempo** directive word |

Several handlers take **arguments outstanding** (`ao`, line 1500): `pv9`/`pvb`/`pvc`/`pvd`/`pve`/`pvh` (and, for sharp/flat keys, `pva` via `puh`) set `ao` and a return switch `psw`, then `goto te` to read the argument number, returning via `ps`/`govia psw` (line 1273). This is how `units 8`, `up 3`, `tempo 600`, etc. pick up their numeric operand.

A few are worth showing:

**`units`** (`pv9`, line 1295) establishes the basic note length the rhythmic numbers count in:

```
p9a,    load n1
        store 1u          / 1u := n1
        x2to1; addi n1; x2to1
        store 3u          / 3u := ((n1*2)+n1)*2 = 6*n1
        sett irl, -1
```

Watch the arithmetic: `x2to1` (`ral 1s`) makes `2*n1`, `addi n1` makes `3*n1`, the second `x2to1` makes `6*n1`, so `3u = 6*n1` (the variable comment at line 1529 labels `3u` "3\*units", consistent with an internal "unit" of `2*n1`). `1u` and `3u` feed the duration scaling and the `mm`/`tu` measure bookkeeping (whose comments call them "units\*3").

**`tempo`** (`pvh`, line 1344) emits a note word tagged `700000`:

```
pha,    load n1
        addi (700000      / top 3 bits = tempo tag
        call cn           / deposit as a "note" word
```

This is exactly the **tempo-tagged word** the consumer recognizes in `05-data-formats.md` (`top 3 bits == 700000`, low 15 bits `& 77777` = tempo).

**`key`** (`pva`, line 1353) reads sharp/flat/natural markers and rebuilds `kt` from `nt`:

```
pva,    call rch
        ...
        ftrel (55, pum    / '=' : natural key (plain copy nt->kt->mt)
        ftrel (57, pus    / '+' : sharps
        trel (54, puf     / '-' : flats
```

`put`/`pug` then loop over the scale rewriting `kt` with `acc = +1`/`-1` per affected tone (lines 1373–1396), spaced by the `aci` count — i.e. it lays down the key signature.

**`rest`** (`pvb`, line 1401) emits a rest. `pb1` (line 1408) builds a rest note word `t1 = (1u + 100)*2`, allocates a note slot via `snl`, stores that slot index in `irl`, and deposits `t1` followed by a `600000` bar-line word into `not` (`putback not, t1` then `putback not, (600000`, lines 1416/1418). `pb3` then loops `n1` times, allocating a bar slot per unit (`call sbc`) and storing `irl` into `bar` (line 1422). So a rest occupies `n1` measure-units, pointing each at the one rest note. (The exact `(1u + 100)*2` encoding and its `600000` marker are *inferred* to be the rest representation; the source has no prose naming the fields.)

**`copy`** (`pvc`, line 1444) takes two bar numbers (`n1`,`n2`) and replays a range of measures (`ao := 2`, two operands), with `flexo blc`/`brc` complaints for bad ranges. This is the score's **repeat** facility.

**`end`** (`pv4`, line 1309) is the act that produces output: it punches this voice's **note section** and **bar section** to tape, each with a count word, the data words, and a checksum, then feeds blank tape and returns to `u` (the entry point, which begins with `halt`) for the next part:

```
pv4,    call sbc
        putback bar, (600000  / end-of-voice bar marker
        feed 400              / blank leader
        step1 nl
        call ppp              / punch: number of notes
        ...
p41,    ... lookup not ... call ppp   / punch each note word, accumulate checksum in t2
        ...
        load t2; call ppp     / punch +checksum
        feed 6
        step1 bc
        call ppp              / number of bars
        ...                   / then the bar section the same way
        load t2; call ppp     / punch +checksum
        feed 300
        goto u
```

`ppp` (line 389) punches one 18-bit word as three binary tape lines via `ppb`; `feed` punches blank lines. **(I/O not emulator-verified: `ppa`/`ppb`/`tyo` are not implemented in `src/pdp1/cpu.ts`; their bit-level behavior here is historical/inferred from standard PDP-1 paper-tape I/O.)** The resulting envelope — count, N data words, checksum, per section, per voice — is precisely the **intermediate music tape** the consumer reads ([`05-data-formats.md` §1](../../pdp1m13/docs/05-data-formats.md#1-the-intermediate-music-tape-format)).

## 6. Embellishments: the `d m n u w p` letters

The single letters that fall through to `s2k`…`s38` (the `s2y` slots for FIODEC `64 d`, `44 m`, `45 n`, `24 u`, `26 w`, `47 p`) set the **embellishment temp** `et` (lines 885–900):

```
s2k,    load (1   / 'd'
s2l,    load (2   / 'm'
s2m,    load (3   / 'n'
s2n,    load (4   / 'u'
s2o,    load (5   / 'w'
s38,    load (6   / 'p'
s28,    store et
        test0 ete, s29
        complaint flexo tme   / "too many embellishments"
s29,    move et, ete
```

`ete` (the **embellishment terminal**) then indexes the `ebl`/`ebd`/`ebe` tables (lines 1176–1188) at note-formation time (`s30`/`s73`, lines 991–1107), which expand one written note into a short flourish of several `cn` calls — trills, mordents, turns, grace figures. The `ebl` table gives a **time** per embellishment (`6 4 10 10 4 5`); `ebd`/`ebe` are dispatch tables of the figure generators (`s81`/`s82`/`s83`/`s84`/`s85`/`s86`). The handler `s73` builds `tne`, `tnf` (neighbor above, `ton+1`), `tnd` (neighbor below, `ton-1`) and emits the alternation pattern.

| Letter | FIODEC | `et` | `ebl` time | Likely figure (inferred) |
|---|---|---|---|---|
| `d` | `64` | 1 | 6 | embellishment / ornament |
| `m` | `44` | 2 | 4 | mordent |
| `n` | `45` | 3 | 10 | (turn / neighbor figure) |
| `u` | `24` | 4 | 10 | upper-neighbor figure |
| `w` | `26` | 5 | 4 | (lower-neighbor figure) |
| `p` | `47` | 6 | 5 | (appoggiatura/passing) |

The **mapping letter → `et` index → figure generator is certain** (it is in the tables: `et` 1–6 dispatch via `ebd-1` to `s81`–`s86`, and `ebl[et-1]` gives the time). The musical *names* (mordent, turn, trill, etc.) are **inferred** from the neighbor-tone construction in `s73`/`s81`–`s86`; the source has no prose naming the figures, so treat these as plausible labels, not facts.

## An illustrative example (inferred)

Putting the layers together, a copyist transcribing a treble passage might type something like (syntax reconstructed; **not** from a real tape):

```
treble  units 8  key +
4   s    a 6 .   |   q 3   m 5   |   end
```

Read as: set the treble clef; the basic unit is an eighth note; one sharp in the key. Then: a duration-4 **staccato** (`s`) note at staff position 6 raised an octave (`a`), **dotted** (`.`); a bar line `|`; a duration-`q` (quarter-articulation) note at position 3 carrying a **mordent** (`m`) embellishment at position 5; another bar line; `end` to punch the part. The leading numbers are durations/positions, the lowercase letters are articulations/clef/embellishments, `+`/`-`/`=` are accidentals, and `|` separates measures. (Every token here is a real recognized character or pseudo; the *combination* is illustrative only.)

## A note on the FIODEC decode, the typos, and the 6-character assembler rule

Every recognized character above is decoded from the `s2z` table comments, the `pn*` name strings, and the literals compared in `s1`/`s2`/`rch` — these are **certain**. Codes not pinned down by an in-source comment (e.g. several `?` entries in the FIODEC chart, including code `33` used for the comma path at line 724) are not asserted here; the comma reading of `33` is *inferred* from the `cm` ("count of commas") variable, not from a glyph comment. The red/black ribbon-shift codes (`34`/`35`) are not part of the input language; they are how the **error reporter** (`er`, `red`, `blk`) types complaints in red on the Flexowriter.

Because this MACRO assembler is significant to **six characters and folds case to upper**, several body tokens are spelled out in full yet resolve to the short macro (`complaint`→`compla`, `complement`→`comple`, etc.); that rule is documented once in the primer and applied silently here. The genuine retype slips encountered in this region are flagged inline rather than silently corrected: **`setpa`** (line 860, likely `stepa`) in the articulation path; and two more in scan 2's tone/accidental path that the walkthrough above touches but does not quote — **`flex air`** (line 954, likely `flexo air`) on the `lt` grace branch, and **`compalint`** (line 976, likely `complaint`) on the accidental-out-of-range path `s41`.

## What this accomplishes

The input language is a compact, line-oriented transcription DSL: **numbers are rhythmic durations and staff positions; lowercase letters are articulations (`s l e h q`), octave shifts (`a b`), accidentals (`+ - =`), and embellishments (`d m n u w p`); `|` separates measures; and word-pseudos (`treble`, `units`, `key`, `tempo`, `copy`, `rest`, `up`, `down`, `end`, …) set context and control output.** `hc1d` scans each event twice — once for rhythm (`s1`), once for pitch/articulation (`s2`) — and the `end` pseudo punches the result as the count/data/checksum note-and-bar tape that *PDP-1 Music 13* consumes.

For the full FIODEC chart, the `tyo`/`rpa`/`ppb` I/O primitives, and the `flexo`/`text` assembler pseudo-ops that carry the diagnostic strings, see [`22-flexowriter-and-io.md`](22-flexowriter-and-io.md). For the instruction-by-instruction scan-1 walkthrough (digit accumulator, fraction ladder, the `r`/`g`/comma counters, and the `tim` computation), see [`09-scan1-numbers.md`](09-scan1-numbers.md) and [`10-scan1-timing.md`](10-scan1-timing.md).
