# Lifecycle: read, scan, emit, punch

The Harmony Compiler phase 1 (`hc1d`, dated 5/21/63) is the **front end** of the two-stage Harmony Compiler. It reads a human-authored music-transcription DSL from paper tape, lexes and interprets it one *measure* at a time, builds an in-core array of compiled **note words** plus an array of **bar pointers**, and at the `end` pseudo-command punches those two arrays out as the intermediate note/bar tape — exactly the tape that the separate program *PDP-1 Music 13* later reads and plays. (See the consumer's description of that tape envelope in [../../pdp1m13/docs/05-data-formats.md](../../pdp1m13/docs/05-data-formats.md).)

This section is the map. It traces the end-to-end control flow and names the three core buffers and the main counters, so the per-routine walkthroughs (scan 1, scan 2, the pseudo-commands, the error typer) have somewhere to hang.

> Conventions used throughout this doc set: all numbers are **octal**; the machine is **18-bit ones-complement** (negate = bitwise NOT; a distinct `-0` = `777777` exists). Core PDP-1 instruction semantics (`lac`/`dac`/`add`/`sub`/`idx`/`isp`/`sad`/`sas`/`jmp`/`jsp`/`dap`/`law`/`cla`/the skip group/the `Ns` shift notation/...) are **not** re-taught here; see [../../pdp1m13/docs/02-pdp1-primer.md](../../pdp1m13/docs/02-pdp1-primer.md). hc1d's macro layer (`load`/`store`/`call`/`exit`/`goto`/the `tr*`/`test*`/`t*` skip-and-jump macros/the dispatch macros) and the 6-character / upper-case symbol-folding rule are introduced in the hc1d primer/appendix; this section assumes you have read them. The paper-tape I/O IOTs (`tyo`, `rrb`, `rpa`, `cks`, `ppa`, `ppb`) are **not implemented in the TS emulator** — any bit-level claim about them here is historical/inferred and is flagged "(not emulator-verified)".

## The three core arrays

Everything hc1d does flows between three arrays, all defined in the constants block (`.mac` lines 1576-1602) and laid out in detail in [04-memory-map.md](04-memory-map.md):

| Array | Symbol | Defined | Holds | Filled by | Drained by |
|---|---|---|---|---|---|
| **source characters** | `f` (`f=0`, `fb=.`, `fw=fb+400`, `fl=fw+200`) | 1591-1595 | the raw FIODEC characters of **one measure** of DSL text | `rch` (the reader) | scan 1 (`s1`) and scan 2 (`s2`), which re-read `f` |
| **note words** | `not` (`not=fl+1`) | 1596 | the **compiled note words** for the whole piece, appended as measures are interpreted | `cn` (commit-note), via scan 2 | `pv4` (the `end` punch) |
| **bar pointers** | `bar` (`bar=7750`) | 1590 | one pointer per measure, indexing into `not` (a measure's note words start here) | `te` (terminate-measure) via `putback bar,lmb` | `pv4` (the `end` punch) |

`not` grows **upward** from `fl+1`; `bar` grows **downward** from `7750`. They share one pool whose total capacity is `all=bar-not-1` (line 1597). The bookkeeping routines `sbc`/`snl` (lines 456-471) bump the bar count and note location and check `tgrec all,s3x` — if the combined demand (`bc+nl`) exceeds `all`, control jumps to `s3x` (line 654), which types *"Table overflow. Subdivide source program."* and halts at `u`. So the two arrays growing toward each other is the actual out-of-memory condition.

Three tone tables embody the pitch model (constants 1578-1587): `nt` (canonical scale, the literal values are spelled out at 1582-1587), `kt` (the scale **after the key signature** is applied), and `mt` (the **momentary** scale, after an accidental within a measure). They are defined in ascending order `mt = .-200`, `kt = mt+44`, `nt = kt+44` — so in memory the layout is `mt`, then `kt`, then `nt`, each `44` (octal) words wide. The full-reset path copies `nt`→`kt`→`mt` to re-arm the scale (below).

## The main counters

These cells (from the temp-storage block, lines 1484-1574, each with an author comment in source) thread through the whole loop:

- **`bc`** — bar count (number of measures committed so far). Initialized to `-1` at `ap`, bumped by `sbc`.
- **`nl`** — note location: index of the next free slot in `not`. Initialized to `-1` at `ap` (see below); bumped by `snl`/`cn`.
- **`tbc`** — tape bar count, bumped alongside `bc` in `sbc` (line 457).
- **`tc`** — terminator count within the current measure.
- **`mm`** — units × 3 consumed in the current measure (the rhythmic-fill check, against `3u`).
- **`lmb`** — last-measure start (the `not` index where the current measure's notes begin); written into `bar` by `te`.
- **`tim`** — running time within scan 1.

## Top-level flow

```
              start u        (line 1604: "start u"; the assembler entry is u)
                  |
                  v
    u, halt  -->  ap  ----------------- one-time init (lines 406-411)
                  |    zero lmb; call rpr (prime reader); bc:=-1; nl:=-1; mjp:=-2
                  v
    pf/pg: read the TITLE (lines 413-429)
        pg reads chars into f at ft until terminator (21 = '|') ;
        on '|':  xp sets pfu:=pfr, emp:=fb, tc:=-1, goto erf  (type the title back)
              -- erf/ec eventually  govia pfu --> pfr
                  |
                  v
    pfr: FULL RESET (lines 431-449)
        zero 1u/3u/tll/ft/rob/gi/gis/ao/tc/mm/ss ; irl:=-1; fi:=1; sid:=1;
        rb:=1 (black ribbon); tbc:=1; tim:=-1; st:=26 (treble) ; goto pum
        pum/pue:  copy nt->kt ; copy kt->mt  (re-arm scale) ; govia pfu --> s1
                  |
                  v
    +====================  PER-MEASURE LOOP  ====================+
    |                                                            |
    |   rch  -- read chars into f until a terminator (line 483)  |
    |          (body via rcy/rcc; comments stripped via rcu)     |
    |                                                            |
    |   s1   -- SCAN 1: lex + time the measure (line 677)        |
    |          counts digits/chars, computes tim -> fc, goto s2  |
    |                                                            |
    |   s2   -- SCAN 2: interpret chars into note words (832)    |
    |          dispatch each char; build notes; call cn to       |
    |          APPEND each finished note word into not[nl++]      |
    |                                                            |
    |   te   -- TERMINATE measure (line 1193)                    |
    |          rhythm check (mm vs 3u); call sbc; record bar      |
    |          pointer: putback bar,lmb ; lmb:=nl+1 ; back to s1  |
    |                                                            |
    +============================================================+
                  |
                  |  (a "tempo" / "units" / "key" pseudo, or "end")
                  v
    pc: PSEUDO-COMMAND parse (line 1224) -- a word like  end  tempo  key ...
        match the typed name against pn1..pnh, dispatch via pcd to pv1..pvh
                  |
                  v
    pv4 (= "end"): PUNCH the output tape (line 1309), then  goto u  (halt)
        call sbc; putback bar,(600000); feed 400;
        step1 nl; ppp(#notes); for each not[]: ppp + accumulate checksum; ppp(checksum);
        feed 6; step1 bc; ppp(#bars); for each bar[]: ppp + checksum; ppp(checksum);
        feed 300; goto u
```

## 1. `start u` / `ap` — initialization

The assembler directive `start u` (line 1604) makes the program begin at label `u` (line 406), which is simply `halt`. The operator presses **Continue** and falls into `ap` (lines 407-411):

```
ap,  zero lmb
     call rpr
     sett bc, -1
     store nl
     sett mjp, -2
```

- `zero lmb` — clears last-measure start (`dzm lmb`).
- `call rpr` — `jda rpr`; the reader-primer (lines 338-342) issues `rrb` / `rpa-i` to prime the paper-tape reader's first line **(not emulator-verified — these I/O IOTs are not in the TS emulator)**.
- `sett bc,-1` — `lac (-1; dac bc` loads the **literal** `-1` into the bar count, leaving `AC = -1`. The first `sbc` does `step1 bc` (`idx bc`) so the first committed bar lands at `0`.
- `store nl` — `dac nl`. The AC still holds the `-1` from `sett bc,-1`, so this initializes the note location to `-1` as well — the classic AC-reuse idiom (no fresh `lac`). `pfr` does **not** re-touch `nl`, so this is the authoritative `nl` init; the first `snl`/`cn` does `step1 nl` (`idx nl`), putting the first note at slot `0`.
- `sett mjp,-2` — primes the error typer's "last measure having error" cell (`mjp`).

## 2. `pf` / `pg` — read the title

Before any music, hc1d reads a **title** line (lines 413-429). `pf` sets the fill pointer `ft:=fb` (the base of `f`); `pg` loops:

```
pg,  call rp        /read title
     store chr
     load ft
     putback f, chr
     testnl chr, (21, pg1
```

- `call rp` (`jda rp`) reads one character from tape into AC; `rp` (lines 344-375) spins on `cks` until the reader flag is up, then `rrb`/`rpa-i` to fetch and re-strobe **(not emulator-verified)**, and screens out tape control codes (`77`, `36`, `13`).
- `putback f,chr` is the indexed-store macro: `add (f; dap .+2; lac chr; dac` — store the char into `f[ft]`.
- `testnl chr,(21,pg1` — `lac chr; sas (21; jmp pg1`: if the char is **not** `21` (`|`, the measure/title separator) keep reading at `pg1` (which `step1 ft` and loops back to `pg`). When the `|` arrives, fall through into `xp`.

`xp` (lines 422-425) arms the error/echo path to re-type the title: `sett pfu,pfr` (the "return switch" `pfu` will route control to the full reset **after** the title has been echoed), `sett emp,fb`, `sett tc,-1`, `goto erf`. `erf` (line 582) is the character-echo engine inside the error typer (`er`); after it types the buffered title it does `govia pfu` (`jmp i pfu`) and lands in `pfr`. So the title is both consumed as a delimiter check and echoed to the Flexowriter as a heading **(the echo uses `tyo` — not emulator-verified)**.

## 3. `pfr` — full reset (re-arm the scale)

`pfr` (lines 431-449) is the clean-slate routine, entered for a fresh piece and re-entered by the **`key`** pseudo (because a key signature must rebuild the keyed scale). It zeros most per-piece state — `1u`, `3u`, `tll` (transposition), `ft`, `rob`/`gi`/`gis` (grace-note state), `ao` (arguments outstanding), `tc`, `mm`, `ss` — and sets `irl:=-1`, `tim:=-1`, `st:=26` (staff location = treble). Watch the AC-reuse idiom for the cells set via a bare `store`:

```
     sett fi, 1
     store sid     /sid := 1  (AC still holds 1 from "sett fi,1")
     ...
     sett rb, 1
     store tbc     /tbc := 1  (AC still holds 1 from "sett rb,1")
```

So `fi:=1` **and** `sid:=1` (not 0), and `rb:=1` (black ribbon, i.e. normal type) **and** `tbc:=1` (not 0) — each `store` parks the `1` the preceding `sett` left in AC rather than loading a fresh value. `pfr` ends:

```
     goto pum    /copies nt to kt to mt, goes to s1
```

`pum`/`pue` (lines 1361-1364) do the scale rebuild:

```
pum, sett pfu, s1
pun, copy nt, kt, 44
pue, copy kt, mt, 44
     govia pfu
```

`copy A,B,N` is the block-copy macro; it moves `N+1` words (the loop runs through `B+N` inclusive). With `N=44`, it copies `45` (octal) words — the full `44`-octal-word tone table plus its boundary word — first `nt`→`kt` then `kt`→`mt`, re-arming the keyed and momentary tone tables from the canonical scale. `sett pfu,s1` then `govia pfu` (`jmp i pfu`) drops into `s1` — the start of the per-measure loop. (The `key` pseudo enters at `pun`/`pue` with a different `pfu` so it rebuilds without re-zeroing everything; see the pseudo-command walkthrough.)

## 4. The per-measure loop: `rch` → `s1` → `s2` → `te`

### `rch` — read characters into `f`

`rch` (lines 483-555, called from `te`/`s1`/`s2` via `rcw`/`rrc`) is the **input layer**: a subroutine (`answer rcx` / `rcx, exit rch`) that fills the `f` buffer with the next measure's worth of source characters and stops at a terminator. Its inner loop `rcy` (line 493) calls `rp` for body characters; `rcu` (line 498) skips **comment** text (delimited by FIODEC `74`/`72`); and the `rdt` dispatch table (line 522) classifies each character. It bounds-checks the fill pointer against `fw` and `fl` (lines 513-516) and jumps to `rrz` (line 660, *"Measure has too many characters. Rearrange tape."*) if a single measure overflows the `f` window. Scan 1 and scan 2 then **re-read** the same `f` buffer via `rch` (they pull characters one at a time through it), so `rch` is both the tape reader and the character source for both scans.

### `s1` — scan 1: lex and time the measure

`s1` (lines 677-827) is the first pass over the measure. It zeros its lexer state (`ldl` last-was-digit, `ucd` numeric-field count, `num` running value, `psi`/`chi` char counts, `g`/`r`/`cm` token counts) and pre-loads `fc:=40`, `fu:=100`. It walks the characters via `call rch`/`store chr`, accumulating multi-digit numbers with the `x10dec` decimal-shift helper (`ral 1s; dac t1; ral 2s; add t1`, i.e. ×~10) and tallying field counts. Its job is to **time** the measure: it derives `tim`, and at `s1o` (line 824) computes `fc := tim/2` (`load tim; halve; store fc`) before `goto s2`. Scan 1 also raises the lexical diagnostics `s1v`/`s1w`/`s1x`/`s1z` (lines 644-652) for malformed input.

### `s2` — scan 2: interpret into note words; `cn` appends

`s2` (lines 832-1144) is the interpreting pass. It re-zeros per-note state (`fu`, `sr` staff reloc, `3i` triplet indicator, `si`, `aci`/`acc` accidental ind/count, `et`/`ete` embellishment temps), then loops `s20`/`s21`: read a char, `search s2z,25,s20` to classify it against the `s2z` character table (`25` octal = `21` decimal entries), and `dispatch s2y` (the macro `dispat`, folded from `dispatch`) to the per-character handler (`s2b`..`s2r`, etc.). Those handlers set the staff-relocation, accidental, slur (`ss`/`sv`), and triplet bits and assemble each finished note. When a note is complete, scan 2 (e.g. via `s70`, lines 1118-1122) builds the 18-bit note word in AC and does:

```
     call cn
```

`cn` (lines 1109-1113) is the **append-a-note-word** primitive:

```
cn,  answer cnx
     store nf
     call snl
     putback not, nf
cnx, exit cn
```

- `store nf` — save the note word (the argument the caller passed in AC) into `nf` ("note forming").
- `call snl` — `snl` (lines 466-471) `step1 nl` (advance the note location), adds in `bc`, checks `tgrec all,s3x` (table-overflow guard → halt), and returns the new `nl` in AC.
- `putback not,nf` — indexed store: `add (not; dap .+2; lac nf; dac` writes the note word into `not[nl]`.

So **every musical note (and the special bar-line word `600000`) becomes one word appended to `not`**, and `nl` is the running length. The bar-line word is emitted by `te0` via `load (600000; call cn` (lines 1210-1211).

### `te` — terminate the measure, record a bar pointer

`te` (lines 1193-1221) closes out the measure. Its first line guards re-entry:

```
te,  test0 trm, s1
```

`test0 trm,s1` = `lac trm; sza i; jmp s1` — jump back to `s1` if `trm == 0`, i.e. if no terminator has been recorded yet. `trm` holds the terminator character last seen (set by `move chr,trm` in `s18` at line 739 and in `pz3` at line 671); a real measure ends with `|` (`trm = 21`), which is non-zero, so control falls through and the measure is closed. (`te` does **not** route to `pc`; the pseudo-command branch is taken earlier, in scan 1 at `s18`/`trze pc`, line 743.)

Falling through, `te` verifies the rhythmic fill: `testel mm,3u,te1` (`lac mm; sad 3u; jmp te1`) — if the units consumed (`mm`) equal `3u` (3 × units-per-measure) it jumps straight to `te1`; otherwise it complains *measure too long* (`mtl`) or *too short* (`mts`) (`flexo` codes, lines 1200-1202, selected by `tles 3u, te9`). It resolves any pending grace-note state, emits the bar-line note word (`te0`), then:

```
teb, call sbc
     putback bar, lmb
     grow nl, 1, lmb
     zero mm
     call rcw
     store mbh
     zero ao
     sett pfu, s1
     goto pue
```

- `call sbc` — `sbc` (lines 456-463) `step1 tbc`, `step1 bc`, adds `nl`, checks `tgrec all,s3x` (overflow → halt), returns `-bc` in AC; the **bar count is now advanced** and another bar slot is reserved.
- `putback bar, lmb` — record the **bar pointer**: store `lmb` (where this measure's notes began) into `bar[-bc]` = `bar - bc` (the slot `sbc` just chose; `bar` grows downward, so larger `bc` → lower address). This is the one place a measure's bar pointer is written.
- `grow nl,1,lmb` — `lac nl; add (1; dac lmb`: set the *next* measure's start to `nl+1`.
- `zero mm`, `call rcw`/`store mbh` (remember where the next measure's chars begin in `f`), `zero ao`.
- `sett pfu,s1`; `goto pue` — re-arm the momentary scale (`pue` copies `kt`→`mt`, clearing any in-measure accidentals) and `govia pfu` back to `s1` for the next measure.

## 5. `pc` / `pv4` — pseudo-commands and the `end` punch

A pseudo-command word (a typed keyword rather than notes) is detected in scan 1: at `s18` the test `trze pc` (line 743, `sza i; jmp pc`) branches to `pc` when the measure held no numeric/comma content. `pc` (lines 1224-1247) parses it: it walks the candidate names `pn1`..`pnh` (the FIODEC strings at lines 1255-1271, decoded in the appendix as `s`, `l`, `e`, `end`, `bass`, `treble`, `tenor`, `alto`, `units`, `key`, `rest`, `copy`, `up`, `down`, `h`, `q`, `tempo`), matching character by character (`lookup`), and on a full match does `dispatch pcd-1` (line 1246) into the handler table `pcd` → `pv1`..`pvh` (lines 1248-1250). Most handlers (`pv1`/`pv2`/`pv3`/`pvf`/`pvg`) set the articulation/slur bits in `ss`; `pv5`..`pv8` set the staff `st` (bass/treble/tenor/alto); `pv9` (`units`) and `pvh` (`tempo`) consume a numeric argument; `pva` (`key`) re-enters the reset path through `pum`/`pus`/`puf`. The musical meaning of the individual handlers is partly inferred and is covered in the pseudo-command walkthrough.

The pseudo that ends the program is **`end` = `pv4`** (lines 1309-1341), the **output punch**. This is where the two in-core arrays become the intermediate tape (the format the consumer documents in [../../pdp1m13/docs/05-data-formats.md](../../pdp1m13/docs/05-data-formats.md)):

```
pv4, call sbc          /end
     putback bar, (600000)
     feed 400
     step1 nl
     call ppp           /no. of notes
     zero t2
     zero t3
p41, load t3
     lookup not
     store t1
     call ppp           /note entry
     step t2, t1
     step1 t3
     trnl nl, p41
     load t2
     call ppp           /+checksum
     feed 6
     step1 bc
     call ppp           /no. of bars
     zero t2
     zero t3
p42, load t3
     complement
     lookup bar
     store t1
     call ppp           /bar entry
     step t2, t1
     step1 t3
     trnl bc, p42
     load t2
     call ppp           /+checksum
     feed 300
     goto u
```

Step by step:

- `call sbc` then `putback bar,(600000)` — append the **end-of-voice bar pointer** `600000` to the `bar` array (the same sentinel the consumer expects; see 05-data-formats.md, which notes `600000` as the bar-line / end-of-voice value).
- `feed 400` — `feed N` = `law i N; jda fee` (`law i N` loads `-N`); `fee` (lines 377-387) punches `N` blank tape lines (`ppa` in a loop) as **leader** **(not emulator-verified)**.
- `step1 nl`; `call ppp` (`/no. of notes`) — punch the **note count** word first. `ppp` (lines 389-401) punches the 18-bit word in its argument as three `ppb` binary lines (`ppb; ril 6s; ppb; ril 6s; ppb`, rotating IO `6s` between lines) **(not emulator-verified)**, behind a test-word pause guard (`lat; and (700; sad (700` — if those three test-word bits are all set, skip the punch).
- Loop `p41` — for each index `t3`, `lookup not` fetches `not[t3]` into AC (the indexed-load macro: `add (not; dap .+1; lac`), `call ppp` punches that **note word**, and `step t2,t1` (`lac t2; add t1; dac t2`) accumulates the **arithmetic checksum** in `t2`. `trnl nl,p41` (`sas nl; jmp p41`, testing the `step1 t3` result against `nl`) loops until `t3 == nl`.
- `load t2; call ppp` (`/+checksum`) — punch the notes-section **checksum** word.

This is exactly the section envelope the consumer reads: **count word → N data words → checksum** (the `add`-sum of the data words), per [../../pdp1m13/docs/05-data-formats.md](../../pdp1m13/docs/05-data-formats.md), where *Music 13*'s `rdg` reads the count, negates it, and `rd1`/`rd3` verify the trailing checksum. hc1d is the producer of that agreement.

- `feed 6` — a short blank gap between the notes section and the bars section.
- `step1 bc`; `call ppp` (`/no. of bars`) — punch the **bar count**.
- Loop `p42` — for each `t3`, `complement` then `lookup bar`. `complement` (`cma`) ones-complement-negates `t3`, so `lookup bar` (`add (bar`) fetches at `bar + (-t3)` = `bar - t3` — i.e. it reads the `bar` array *downward* (`bar`, `bar-1`, `bar-2`, …), matching the downward growth of `bar`. (At `t3=0`, `complement` yields ones-complement `-0` = `777777`, and `bar + (-0) = bar`.) `call ppp` punches the **bar pointer**, `step t2,t1` accumulates the checksum, `trnl bc,p42` loops.
- `load t2; call ppp` (`/+checksum`) — punch the bars-section checksum.
- `feed 300` — trailing leader.
- `goto u` — `jmp u`, halting the machine (the program is done; the punched tape is the deliverable).

## What this accomplishes

`hc1d` is a one-measure-at-a-time streaming compiler: `rch` pulls DSL characters off paper tape into the `f` buffer until a terminator; scan 1 (`s1`) lexes and times the measure; scan 2 (`s2`) interprets it and, via `cn`, **appends compiled note words to the `not` array**; `te` records a **bar pointer in `bar`** and loops back; pseudo-commands (`pc`/`pv*`) adjust staff, key, units, tempo, and articulation along the way; and the `end` pseudo (`pv4`) **punches `not` and `bar` as count/data/checksum sections** — the intermediate note/bar tape — then halts. Everything downstream (the field layout of a note word, the bar-pointer biasing, the checksum verification) is the agreement that *PDP-1 Music 13* relies on when it reads this tape; see [../../pdp1m13/docs/05-data-formats.md](../../pdp1m13/docs/05-data-formats.md) and the hc1d [04-memory-map.md](04-memory-map.md).

**Next:** the reader/input layer — `rp`, `rpr`, `rch` and the `rdt` dispatch table — in the read-and-buffer walkthrough.
