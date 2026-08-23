# The input language (the music transcription DSL)

This section documents the language a copyist types on the **source tape** that *Harmony Compiler phase 1* (`hc1d`) reads. `hc1d` is the **producer**; the note/bar tape it punches is the **consumer** format described in [`../../pdp1m13/docs/05-data-formats.md`](../../pdp1m13/docs/05-data-formats.md). Read that first: it pins down the exact bit layout of a compiled note word, and the language documented here is best understood as "what a human types so that those bits come out."

> **Authoritative source for this language.** The input language is specified by Peter Samson himself in two scanned copies, [*MusicCompiler-a.pdf*](../prs-docs/MusicCompiler-a.pdf) and [*MusicCompiler-b.pdf*](../prs-docs/MusicCompiler-b.pdf) ("MUSIC COMPILER", §I "Writing Music for the Compiler"). They are two copies of the same document — "Read the two copies together, since neither is entirely complete and each has typos which mostly do not coincide" ([*music-workflow.pdf*](../prs-docs/music-workflow.pdf), step 2). This file has been **reconciled against those documents**: where the code-reading below was previously hedged as "inferred," the spec now confirms (or corrects) it, and the relevant fact is cited inline with a page number. The earlier reverse-engineering got the FIODEC decode and pseudo-command names right; the spec mainly fixes the *roles* of `r`/`g`/comma and the *names* of the articulation and embellishment letters.

All numbers are **octal**. The PDP-1 is 18-bit ones-complement; for the core opcodes (`lac`/`dac`/`add`/`sub`/`idx`/`sad`/`sas`/the skip group/the shift `Ns` notation) see [`../../pdp1m13/docs/02-pdp1-primer.md`](../../pdp1m13/docs/02-pdp1-primer.md). The macro layer (`load`, `store`, `call`, `answer`/`exit`, the `tr*`/`test*`/`t*` skip-and-jump macros, `lookup`/`dispat`/`putback`) is the program's Rosetta Stone; it is defined once in the primer/appendix of this doc set and used silently here.

There is **no decoded sample source tape in this repository** (the only candidate, `macro/gemsOfTheBaroque.bin.gz`, lives in the git-ignored scratch directory and is a binary artifact, not decoded here), but the source language is now pinned by the spec above and the recognizer tables (`s2z`, `pn*`) and handlers (`s1`, `s2`, `pv*`). A worked example of a real voice is the demo piece BWV592-3 (Bach, Organ Concerto in G, 3rd movt.) referenced throughout Samson's documentation ([*music-workflow.pdf*](../prs-docs/music-workflow.pdf), step 1).

## The shape of a score

The tape is read by `rch` (the buffered character reader, `hc1d.mac` line 483), which hands one FIODEC character at a time to the scanner. The program runs two passes over each musical event:

- **Scan 1** (`s1`, lines 677–827) is the **lexical / rhythmic** pass. It collects digits into numbers (`num`, `n1`, `n2`), counts the rhythm-modifier letters (`r`, `g`, comma), tracks the fraction state, and computes the **duration** `tim` of the event. It does not care which pitch you wrote.
- **Scan 2** (`s2`, lines 832–1144) re-reads the *same* run of characters (`s2` calls `rrc` at line 840 to rewind the buffer index, then re-reads via `rch`) and does the **pitch / articulation** work: it reads the note letter, applies accidentals, staff relocation and clef, looks the pitch up through the three tone tables, applies embellishments, and finally calls `cn` to deposit one or more 18-bit **note words** into the `not` array.

Both scans are driven character-by-character and both stop at the same **terminator** (`trm`). Which token a field is is decided in scan 1's terminator handler `s18` (line 738): a field whose characters are entirely a recognized pseudo-command word is sent to `pc` (`trze pc`, line 743); otherwise it is a note. The terminator routine `te` (line 1193) is the post-event handler: it advances the measure/bar bookkeeping and decides whether to read **another note** (terminator was a space, `test0 trm, s1`) or close out **a bar line** (terminator `21`). So a score is, structurally, a stream of **fields** separated by terminators:

```
<duration-and-rhythm>  <note-letter+accidentals+embellishments>  <terminator>
```

The recognized terminators (and bar/measure separator) come from `s2z` below: a note ends at a **space** (`00`), a **measure bar** (`21`), or implicitly when a non-note character forces the issue. **FIODEC `21` is the slash `/`** — the character Samson's spec gives as the measure bar: "for the Compiler, the bar is represented by the slash `/`," and "the title is all material on the tape through the first slash `/`" ([*MusicCompiler-a.pdf*](../prs-docs/MusicCompiler-a.pdf), p. 1 §I.A.2 and p. 8 §I.C). The code agrees: the title reader `pg` (line 420) keeps reading until it sees `21` (`testnl chr, (21, pg1`), and the `(21` literal is compared all over `s1`/`rch`/`te` as the measure terminator. (The source's `/ |` comment at line 1164 — read in MACRO, where the first `/` starts the comment — is Samson annotating the slash glyph with a "`|`" bar-line mark; **earlier drafts of these docs mislabeled `21` as the vertical bar `|`. The typed character is the slash `/`.**)

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

So a **period** `.` (FIODEC `73`, confirmed by the `/.` comment at line 1162) is the familiar **dotted-note** mark — it commits the current fraction status (`move fc, fu`) and then halves it, exactly the "add half again" geometry of a dot. An **`x`** (`27`) halves the fraction status without committing it. The spec confirms both: "one or more dots … the first dot adds one-half the duration of the note; each succeeding dot adds half the duration of the dot before it … the Compiler interprets the letter `x` in a note to mean 'halve the value of the dot'" ([*MusicCompiler-a.pdf*](../prs-docs/MusicCompiler-a.pdf), p. 3, §I.B.4.a). A dot smaller than a 64th note is ignored — the `dtu` ("dot underflow → time truncated to 64th") complaint ([*MusicCompiler-b.pdf*](../prs-docs/MusicCompiler-b.pdf), p. 11). (The duration numbers themselves are restricted to the seven powers of two **1, 2, 4, 8, 16, 32, 64** — whole through 64th note — per [*MusicCompiler-a.pdf*](../prs-docs/MusicCompiler-a.pdf), p. 1, §I.B.1.b, Fig. 2.) Separately, the letter **`c`** (FIODEC `63`, handler `s2g`) marks a **triplet** — "play for two-thirds its usual duration" ([*MusicCompiler-a.pdf*](../prs-docs/MusicCompiler-a.pdf), p. 4, §I.B.4.b) — setting the triplet bit `3i = 100000` that becomes bit 2 of the note word (whence the player's ×2-not-×3 duration scaling).

The three counters incremented at `s1b`/`s1c`/`s1d` are `r`, `g`, and `cm` (comma). Their roles surface at `s1e`–`s1t` (lines 750–782), which translate them into the **left/right indicators** `lt`/`rt`. From the variable comments (lines 1496–1497):

```
rt,  0   / s1: right indicator: 0/num, 1/g, 2/cm.
lt,  0   / s1: left indicator:  0/num, 1/r, 2/cm.
```

The `lt`/`rt` indicators record **what kind of token occupies each side of the note**: the left side (the pitch slot) may be a number, a rest `r`, or a comma; the right side (the duration slot) may be a number, a grace marker `g`, or a comma. The spec pins the three letters' roles precisely — they are **not** all "grace-note markers" as an earlier reading guessed:

- **`r` = a rest.** "A rest may be expressed by the letter `r` and a duration number" ([*MusicCompiler-a.pdf*](../prs-docs/MusicCompiler-a.pdf), p. 2, §I.B.2). `r` and the number may come in either order; a pitch number may not appear with an `r`, and at most one `r` per note.
- **`g` = a grace note (appoggiatura).** "The letter `g` anywhere in a note marks it as a grace note" ([*MusicCompiler-a.pdf*](../prs-docs/MusicCompiler-a.pdf), p. 7, §I.B.8). A grace note "steals its playing time from the first non-grace note to follow"; if no duration is specified, a **thirty-second note** is compiled. At most one `g` per note.
- **`,` (comma) = copy the previous note.** "A comma used alone as a note [means] to copy the previous note exactly. Also, the comma may be used with `r` or a pitch number … [to] copy only the duration from the previous note" ([*MusicCompiler-a.pdf*](../prs-docs/MusicCompiler-a.pdf), p. 2, §I.B.3). At most one comma per note.

`s1e` enforces "too many" limits with non-fatal complaints whose codes the spec's error table defines ([*MusicCompiler-b.pdf*](../prs-docs/MusicCompiler-b.pdf), p. 11): `flexo tmr` ("too many `r`s in note" → one `r` assumed), `flexo tmg` ("too many `g`s in note" → one `g` assumed), `flexo tmc` ("more than one comma in note" → one comma assumed) (lines 753/757/761), and it clamps each count to 1 (`sett r, 1` etc.). So the **`rob`/`gi`/`gis` time-borrowing machinery in scan 2 belongs specifically to the grace-note path** (`g`): a grace note's nominal time is accrued into `rob` ("time desired by grace notes", line 1543) and stolen from the following note (`2s1`, line 935; see [`12-scan2-note-emission.md`](12-scan2-note-emission.md)). `r` simply emits a rest; the comma copies a prior note's pitch and/or duration.

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

| Letter | FIODEC | Sets `sv` | Artic. value | Name & effect (per spec) | Silent / sounded |
|---|---|---|---|---|---|
| `s` | `22` | `200000` | 4 | **staccato** | ≈5/8 silent, ≈3/8 sounded |
| `l` | `43` | `400000` | 8 | **legato** (slurs) | 0 silent, full sounded |
| `e` | `65` | `0` | 0 | **eighth** (default; notes not specially marked) | 1/8 silent, 7/8 sounded |
| `h` | `70` | `40000` | 2 | **half** (staccato for organ works) | 1/2 silent, 1/2 sounded |
| `q` | `50` | `20000` | 1 | **quarter** (alternative to e/h) | 1/4 silent, 3/4 sounded |

These five names and their sound/silent fractions are given verbatim in Samson's articulation table ([*MusicCompiler-a.pdf*](../prs-docs/MusicCompiler-a.pdf), p. 6 / [*MusicCompiler-b.pdf*](../prs-docs/MusicCompiler-b.pdf), p. 6, §I.B.6) — so what was previously "the consumer doc's inference" is now ground truth. The `sv` bit value each letter sets corresponds to the intermediate-format articulation code (`l`→8, `e`→0, `h`→2, `q`→1, `s`→4; [*music_intermediate_format.pdf*](../prs-docs/music_intermediate_format.pdf)), which the player's `cxt` table turns back into exactly these release fractions ([`05-data-formats.md`](../../pdp1m13/docs/05-data-formats.md#2-the-per-voice-note-word)).

The same five letters are also available as **pseudo-commands** (§5) via `pv1`/`pv2`/`pv3`/`pvf`/`pvg`, which set the **running** status `ss` (the default for subsequent notes) rather than the per-note `sv`. `s2r` (the `|`/space terminator path, line 906) copies `ss` into `sv` when the note carried no explicit articulation:

```
s2r,    test0 si, s51     / si = 0 -> no per-note sle letter -> s51
        trel (1, s52      / si = 1 -> exactly one sle letter -> keep sv
        complaint flexo tms   / si > 1 -> "too many s/l/e"
s51,    move ss, sv       / inherit the running articulation
```

Two rules from the spec are worth adding (both [*MusicCompiler-a.pdf*](../prs-docs/MusicCompiler-a.pdf), p. 9, §I.D.5): **at the start of each line of music the Compiler is in "e" mode** (the default articulation, `ss = 0`), and **a note that immediately precedes a rest in the same measure is automatically made legato** unless it carries its own articulation letter. If a note carries more than one of `s`/`l`/`e`/`h`/`q`, the last one wins (`tms`, "too many `s`/`l`/`e` in note → last occurrence rules", [*MusicCompiler-b.pdf*](../prs-docs/MusicCompiler-b.pdf), p. 11). A slur is written by making every note in the slur legato except the last.

## 3. Accidentals: sharp `(`, flat `-`, natural `)`

Scan 2 handles accidentals through three `s2z` entries. From the variable comment (line 1511): `aci` = accidental indicator (`0`/none, `1`/sharp-or-flat, `-1`/natural); `acc` = accidental count.

```
s2h,    testm aci, s24    / '(' = '+' : sharp.  if aci<0 (a natural set) -> s24 error
        step1 acc         / acc := acc+1
        goto s25
s2i,    testm aci, s24    / '-' : flat.  same guard
        istepa acc, 1     / acc := acc-1  (add literal -1)
s25,    sett aci, 1
        goto s20
s24,    complaint flexo nor   / nor = "mixed accidentals" -> natural assumed
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
| `(` (also typed `+`) | `57` | **sharp** | `acc += 1`, `aci := 1` |
| `-` | `54` | **flat** | `acc -= 1`, `aci := 1` |
| `)` (also typed `=`) | `55` | **natural** | `aci := -1` |

These are exactly the accidental characters in the spec: "`)` natural, `(` sharp, `-` flat", with "`((` double sharp" and "`--` double flat" ([*MusicCompiler-a.pdf*](../prs-docs/MusicCompiler-a.pdf), p. 5 / [*MusicCompiler-b.pdf*](../prs-docs/MusicCompiler-b.pdf), p. 5, §I.B.5.b, Fig. 9). FIODEC `57` and `55` are dual-glyph keys (`(`/`+` and `)`/`=` respectively; the `/( +` and `/) =` comments at lines 1153/1155 confirm both readings), so the program's `+`/`=` literals are just the alternate glyphs of the spec's `(`/`)`. A **double accidental** (`((` = double sharp, `--` = double flat) accumulates `acc`. Mixing accidental types raises **`flexo nor`** — the spec's code **`nor` = "mixed accidentals → natural assumed"** ([*MusicCompiler-b.pdf*](../prs-docs/MusicCompiler-b.pdf), p. 11; "If `)` appears in the same note with `-` or `(`, the `)` takes precedence", [*MusicCompiler-a.pdf*](../prs-docs/MusicCompiler-a.pdf), p. 5). The two `complaint flexo nor` sites (lines 875 and 881) fire on a `+`/`-` after a `=` (the `testm aci, s24` guard), or a `=` after a `+`/`-` (the `testel aci, (1, s26` guard). Note `acc` is **cleared only on the natural-overriding-sharp/flat error path** (`s26` → `zero acc`); a plain `=` from a clean state (`aci = 0`) goes straight to `s27` and leaves `acc` untouched (it is already 0). An accidental on a rest is ignored (`air`, [*MusicCompiler-b.pdf*](../prs-docs/MusicCompiler-b.pdf), p. 11). `acc` is added to the pitch index in `s2v` (`addi acc`, line 971) — i.e. each `+`/`-` shifts the looked-up tone by one semitone, exactly as a sharp/flat shifts a note.

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

`stepa sr, 14` = `law 14; add sr; dac sr`; `istepa sr, 14` = `law i 14; add sr; dac sr` (the literal is the *negative* `14`). The spec confirms the meaning: the letter **`a`** (`61`) refers the note to the **adjoining staff above**, **`b`** (`62`) to the staff **below**, and "these letters may occur more than once in a note, and their effect is cumulative: e.g. `aa` refers to the second staff above" ([*MusicCompiler-a.pdf*](../prs-docs/MusicCompiler-a.pdf), pp. 4–5, §I.B.5.a, Fig. 8). In this tone numbering an adjacent staff is one octave away, so each `a`/`b` is the `14`-octal (= 12-semitone) register shift seen here. The spec also bounds the range: "The highest pitch available is the treble clef's `a9`, the lowest is the bass clef's `b2`." These are distinct from the `up`/`down` **pseudo-commands** (§5), which set the separate transposition cell `tll`.

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

All of these are documented commands in the spec's §I.D "Commands to the Compiler" ([*MusicCompiler-a.pdf*](../prs-docs/MusicCompiler-a.pdf), pp. 8–10): `end` (§I.D.1), `units` (§I.D.2), the four clefs `treble`/`alto`/`tenor`/`bass` (§I.D.3), `key` (§I.D.4), the articulation-mode letters `s`/`l`/`e`/`h`/`q` (§I.D.5), `rest` (§I.D.6), `copy` (§I.D.7), `up`/`down` (§I.D.8), and `tempo` (§I.D.9). An unrecognized word raises `nps` ("no such pseudoinstruction → word ignored", [*MusicCompiler-b.pdf*](../prs-docs/MusicCompiler-b.pdf), p. 11). Note the **input DSL "comment" rule**: any text outside the title typed in **upper case is ignored** by the Compiler ([*MusicCompiler-a.pdf*](../prs-docs/MusicCompiler-a.pdf), p. 11, §I.E.2) — that is a property of the *source language*, distinct from (though it rhymes with) the MACRO assembler's 6-character/upper-case symbol folding.

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

Watch the arithmetic: `x2to1` (`ral 1s`) makes `2*n1`, `addi n1` makes `3*n1`, the second `x2to1` makes `6*n1`, so `3u = 6*n1` (the variable comment at line 1529 labels `3u` "3\*units", consistent with an internal "unit" of `2*n1`). `1u` and `3u` feed the duration scaling and the `mm`/`tu` measure bookkeeping (whose comments call them "units\*3"). Per the spec, the argument `n1` is **the total duration of a measure stated as the number of thirty-second notes in it** — "computed by multiplying the time signature (as a fraction) by 32" — and `units` takes effect immediately, applying to its own and all following measures until the next `units` ([*MusicCompiler-a.pdf*](../prs-docs/MusicCompiler-a.pdf), p. 8, §I.D.2). The compiler then checks each measure's accumulated note durations against this length, complaining `mtl` ("measure too long → long measure compiled") or `mts` ("measure too short → short measure compiled") at the closing slash ([*MusicCompiler-b.pdf*](../prs-docs/MusicCompiler-b.pdf), p. 11).

**`tempo`** (`pvh`, line 1344) emits a note word tagged `700000`:

```
pha,    load n1
        addi (700000      / top 3 bits = tempo tag
        call cn           / deposit as a "note" word
```

This is exactly the **tempo-tagged word** the consumer recognizes in `05-data-formats.md` (`top 3 bits == 700000`, low 15 bits `& 77777` = tempo) and the spec's "Tempo word = `700000` octal + Tempo value" ([*music_intermediate_format.pdf*](../prs-docs/music_intermediate_format.pdf)). The spec gives the copyist's side of the number too: the `tempo` command's argument is `n = 1126/(m·r)`, where `m` is the Maelzel metronome count and `r` the counted note value (e.g. ♩=60 ⇒ m=60, r=1/4); `n` may not exceed 682, and **defaults to 170** (= `252` octal, the intermediate-format default) if no `tempo` is given; smaller is faster. A `tempo` in any one voice applies to all voices ([*MusicCompiler-a.pdf*](../prs-docs/MusicCompiler-a.pdf), p. 10, §I.D.9).

**`key`** (`pva`, line 1353) reads sharp/flat/natural markers and rebuilds `kt` from `nt`:

```
pva,    call rch
        ...
        ftrel (55, pum    / '=' : natural key (plain copy nt->kt->mt)
        ftrel (57, pus    / '+' : sharps
        trel (54, puf     / '-' : flats
```

`put`/`pug` then loop over the scale rewriting `kt` with `acc = +1`/`-1` per affected tone (lines 1373–1396), spaced by the `aci` count — i.e. it lays down the key signature. Per the spec the syntax is **`key)`** = no sharps or flats, **`key-`N** = N flats, **`key(`N** = N sharps ([*MusicCompiler-a.pdf*](../prs-docs/MusicCompiler-a.pdf), p. 9, §I.D.4, Fig. 13) — matching the `=`/`-`/`+` (i.e. `)`/`-`/`(`) characters this handler reads.

**`rest`** (`pvb`, line 1401) emits a rest. `pb1` (line 1408) builds a rest note word `t1 = (1u + 100)*2`, allocates a note slot via `snl`, stores that slot index in `irl`, and deposits `t1` followed by a `600000` bar-line word into `not` (`putback not, t1` then `putback not, (600000`, lines 1416/1418). `pb3` then loops `n1` times, allocating a bar slot per unit (`call sbc`) and storing `irl` into `bar` (line 1422). So a rest occupies `n1` measure-units, pointing each at the one rest note. This is the spec's **whole-measure** rest command: "`rest` followed by the number of inactive measures … they will all be given the current measure length"; it is distinct from the note-level rest `r`, may not be used once notes are already written in a measure (`ilr`, "illegally located rest → ignored"), and adds no duration so no slash follows it ([*MusicCompiler-a.pdf*](../prs-docs/MusicCompiler-a.pdf), p. 9, §I.D.6).

**`copy`** (`pvc`, line 1444) takes two bar numbers (`n1`,`n2`) and replays a range of measures (`ao := 2`, two operands), with `flexo blc`/`brc` complaints for bad ranges. Per the spec, **`copy`** is followed by two numbers — the first measure to copy from and the last to copy — duplicating that already-written range; the first must be below the current measure number (`blc`, "bad left argument to copy → copy ignored") and the second not below the first (`brc`, "bad right argument to copy → copy ignored"), and it may not be used once notes are in the current measure (`ilc`, "illegally located copy → ignored") ([*MusicCompiler-a.pdf*](../prs-docs/MusicCompiler-a.pdf), p. 10, §I.D.7; codes in [*MusicCompiler-b.pdf*](../prs-docs/MusicCompiler-b.pdf), p. 11). This is the score's **repeat** facility; copied measures are verbatim and unaffected by later changes of articulation/clef/length, but do play at the current tempo.

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

| Letter | FIODEC | `et` | `ebl` time | Ornament (per spec) |
|---|---|---|---|---|
| `d` | `64` | 1 | 6 | short mordent |
| `m` | `44` | 2 | 4 | trill (without suffix) |
| `n` | `45` | 3 | 10 | trill with suffix |
| `u` | `24` | 4 | 10 | turn |
| `w` | `26` | 5 | 4 | trill (later composers) |
| `p` | `47` | 6 | 5 | praller (pralltriller) |

The **mapping letter → `et` index → figure generator is certain** (it is in the tables: `et` 1–6 dispatch via `ebd-1` to `s81`–`s86`, and `ebl[et-1]` gives the time). The musical **names are now sourced**, not inferred: they are Peter Samson's embellishment figure ([*MusicCompiler-a.pdf*](../prs-docs/MusicCompiler-a.pdf), p. 7 / [*MusicCompiler-b.pdf*](../prs-docs/MusicCompiler-b.pdf), p. 7, §I.B.7, Fig. 11), whose symbols are those of C. P. E. Bach's *Essay on the True Art of Playing Keyboard Instruments*. The spec also fixes the surrounding rules: at most one embellishment per note (the last wins, `tme`), none on triplet notes (`etr`), each has a minimum duration (`eit`), and none may generate an out-of-range note (`eor`); a comma does not copy an embellishment. The note-by-note construction of each figure is detailed in [`13-scan2-embellishments.md`](13-scan2-embellishments.md).

## An illustrative example (inferred)

Putting the layers together, a copyist transcribing a treble passage might type something like (syntax reconstructed; **not** from a real tape):

```
treble  units 8  key (
4   s    a 6 .   /   q 3   m 5   /   end
```

Read as: set the treble clef; the basic unit is an eighth note (`units 8`); one sharp in the key (`key (`). Then: a duration-4 **staccato** (`s`) note at staff position 6 raised an octave (`a`), **dotted** (`.`); a bar `/`; a duration-`q` (quarter-articulation) note at position 3 carrying a **trill** (`m`) embellishment at position 5; another bar `/`; `end` to punch the part. The leading numbers are durations/positions, the lowercase letters are articulations/clef/embellishments, `(`/`-`/`)` are accidentals (sharp/flat/natural), and the slash `/` separates measures. (Every token here is a real recognized character or pseudo; the *combination* is illustrative only.)

## A note on the FIODEC decode, the typos, and the 6-character assembler rule

Every recognized character above is decoded from the `s2z` table comments, the `pn*` name strings, and the literals compared in `s1`/`s2`/`rch` — these are **certain**, and the spec confirms the glyph meanings (the slash `/` = bar = FIODEC `21`; the accidentals `(`/`)`/`-`; the letters `s l e h q`, `a b`, `c`, `d m n u w p`, `r`, `g`; the dot `.` and `x`). Codes not pinned down by an in-source comment (e.g. several `?` entries in the FIODEC chart, including code `33` used for the comma path at line 724) are not asserted here; the comma reading of `33` is *inferred* from the `cm` ("count of commas") variable, not from a glyph comment — though the spec confirms the comma's *role* (copy the previous note). The red/black ribbon-shift codes (`34`/`35`) are not part of the input language; they are how the **error reporter** (`er`, `red`, `blk`) types complaints in red on the Flexowriter.

Because this MACRO assembler is significant to **six characters and folds case to upper**, several body tokens are spelled out in full yet resolve to the short macro (`complaint`→`compla`, `complement`→`comple`, etc.); that rule is documented once in the primer and applied silently here. The genuine retype slips encountered in this region are flagged inline rather than silently corrected: **`setpa`** (line 860, likely `stepa`) in the articulation path; and two more in scan 2's tone/accidental path that the walkthrough above touches but does not quote — **`flex air`** (line 954, likely `flexo air`) on the `lt` grace branch, and **`compalint`** (line 976, likely `complaint`) on the accidental-out-of-range path `s41`.

## What this accomplishes

The input language is a compact, line-oriented transcription DSL: **numbers are rhythmic durations and staff positions; lowercase letters are articulations (`s l e h q`), octave/staff shifts (`a b`), the triplet mark (`c`), accidentals (`( - )` = sharp/flat/natural), rest (`r`), grace (`g`), and embellishments (`d m n u w p`); the slash `/` separates measures (and ends the title); and word-pseudos (`treble`, `alto`, `tenor`, `bass`, `units`, `key`, `tempo`, `copy`, `rest`, `up`, `down`, `end`, …) set context and control output.** Upper-case text (outside the title) is treated as comments. `hc1d` scans each event twice — once for rhythm (`s1`), once for pitch/articulation (`s2`) — and the `end` pseudo punches the result as the count/data/checksum note-and-bar tape that *PDP-1 Music 13* consumes. The full language is specified in [*MusicCompiler-a.pdf*](../prs-docs/MusicCompiler-a.pdf) / [*MusicCompiler-b.pdf*](../prs-docs/MusicCompiler-b.pdf).

For the full FIODEC chart, the `tyo`/`rpa`/`ppb` I/O primitives, and the `flexo`/`text` assembler pseudo-ops that carry the diagnostic strings, see [`22-flexowriter-and-io.md`](22-flexowriter-and-io.md). For the instruction-by-instruction scan-1 walkthrough (digit accumulator, fraction ladder, the `r`/`g`/comma counters, and the `tim` computation), see [`09-scan1-numbers.md`](09-scan1-numbers.md) and [`10-scan1-timing.md`](10-scan1-timing.md).
