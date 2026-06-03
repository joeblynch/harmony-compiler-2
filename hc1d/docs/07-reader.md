# The buffered reader and counters (`rch`, `sbc`, `snl`, `cr`, `rcw`, `rrc`)

This section documents hc1d's **input engine** and the small counter helpers that ride alongside it. Every scan and pseudo-command routine in the compiler gets its source characters by calling `rch`; `rch` in turn refills a one-measure buffer in the `f` array from the paper tape (via `rp`), recognizes the literal word `end`, and hands back one logical character at a time in `ch`. The counter helpers `sbc`/`snl` advance the compiled bar/note pointers (with overflow checks), and `cr`/`rcw`/`rrc` are tiny utilities the reader and error code lean on.

These routines live at hc1d.mac lines 452-555. They are all written in hc1d's `answer`/`exit` subroutine convention (see [the hc1d primer's account of the macro layer](02-hc1d-primer.md) and the [macro vocabulary](20-macro-vocabulary.md)); a quick refresher on that convention appears under [`cr`](#cr-lines-452-454-type-a-carriage-return) below. Core PDP-1 opcode semantics (`lac`, `dac`, `add`, `sub`, `idx`, `sad`, `sas`, `jmp`, `dap`, ones-complement arithmetic, the skip group) are not re-taught here -- see [`02-pdp1-primer.md`](../../pdp1m13/docs/02-pdp1-primer.md).

> **6-character / case rule.** This MACRO assembler is significant to six characters and folds to upper case, so `diswith` in the body (line 520) is the same token as the macro defined as `diswit` (line 262). The hc1d primer documents this once; this section treats them as identical.

---

## The `f` buffer and its pointers

`rch` works against a small refillable buffer in the `f` array, whose extent is fixed in the constants block (hc1d.mac lines 1591-1596):

```
f=0
fb=.
fw=fb+400
fl=fw+200
not=fl+1
```

(Line 1593, `foo=105`, sits between `fb` and `fw` and is unrelated to the buffer.) So `f` is the *symbolic base* `0`, and the actual storage runs from `fb` (the current value of the location counter `.`) up through `fl`; the compiled note array `not` begins one word past the buffer at `fl+1`. The buffer is addressed as `f` (= 0) plus an index: cell `i` of the buffer is the absolute address `f+i` = `i`. The reader uses two thresholds within it:

| Constant | Value | Role |
|---|---|---|
| `f` | `0` | symbolic base for indexed access (`putback f, ch`, `lookup f`) |
| `fb` | `.` (start of buffer; *approx address only*) | start of the measure buffer |
| `fw` | `fb+400` (octal) | "warn" point -- when the write index `ft` reaches this, the reader starts checking against `fl` |
| `fl` | `fw+200` | hard end of the buffer (overflow -> `rrz`) |

The pointer variables (hc1d.mac lines 1530, 1555-1561) are the heart of the choreography:

| Var | Author comment | Meaning |
|---|---|---|
| `mbh` | `/rch: pointer to beginning of measure in f` | index in `f` where the current measure's characters begin |
| `ft` | `/rch f top` | **write** index: next free slot in `f` (where freshly read characters are stored) |
| `fi` | `/rch: f index` | **read** index: next character to hand back to the caller |
| `fl1` | `/rch: location in f of last terminator` | index of the most recent terminator (space `00` or `\|`, FIODEC `21`) |
| `fl2` | `/rch: loc. in f of last termin. before new word` | the previous value of `fl1`, used to "back up" one word |
| `bgs` | `/rch: "end" counter` | state of the `end`-word recognizer (the finite-state machine) |
| `pp` | `/rch: saves character` | terminator flag saved across the dispatch (1 if the stored char was a terminator) |
| `ch` | `/rch: character from tape` | the returned character |

The design intent: a whole measure of source text is read from tape into `f` *once* (the `rcy`/`rcu`/`rcc` fill loop), and is then re-scanned multiple times -- scan-1 reads it, then scan-2 reads it again -- by replaying it out of `f` via the `fi` read index. `rcw`/`rrc` let a scan save and restore where it is mid-buffer. The buffer is refilled only when the reader is asked for a character past the last one buffered (`fi > ft`, tested at the top of `rch`).

This is a **linear, refill-per-measure** buffer, not a circular ring: `ft` and `fi` only ever increment, and a refill resets both back to `fb` rather than wrapping.

---

## `cr` (lines 452-454): type a carriage return

```
cr,	answer crx
	type (77
crx,	exit cr
```

`answer crx` expands to the standard prologue `0 / dap crx / lac .-2`: the literal `0` is the cell where the caller's `call`/`jda` deposited AC, `dap crx` patches the exit `jmp` at `crx` with the return address, and `lac .-2` reloads the deposited argument. (`cr` ignores its argument; it is called purely for effect.)

`type (77` expands to `lio (77 / tyo` -- load the literal constant `77` into IO, then `tyo` types the low Flexowriter character in IO. FIODEC `77` is evidently hc1d's carriage-return / format code given the routine name (the provided FIODEC table records `77` only as a mask/delete value, so the carriage-return reading is *inferred* from the `cr` label, not from an in-source comment). **(not emulator-verified: `tyo` is not implemented in the TS emulator; semantics from standard PDP-1 I/O.)**

`crx, exit cr` is a bare `jmp` whose address was patched by the `dap crx` in the prologue -- the return. `cr` is called all over the diagnostics code (e.g. `s3x` at line 654, `rrz` at line 660) to start each error message on a fresh line.

---

## `sbc` (lines 456-463): step the bar count

```
sbc,	answer sbx
	step1 tbc
	step1 bc
	addi nl
	tgrec all, s3x
	load bc
	complement
sbx,	exit sbc
```

`sbc` ("step bar count") is called once per measure boundary as the compiler closes off a bar. Expanding the macros:

- `step1 tbc` -> `idx tbc`: increment `tbc`, the bar count *within the tape* (author comment: `/sbc: bar count within tape`).
- `step1 bc` -> `idx bc`: increment `bc`, the running bar count (`/te: bar count`). After the `idx`, the incremented `bc` is left in AC.
- `addi nl` -> `add nl`: add `nl`, the current **note location in `not`** (the count of compiled note-words so far, `/s2: note location in not`). AC now holds `bc + nl`, i.e. the total words consumed = bars + notes.
- `tgrec all, s3x` -> `sub (all / sma+sza-skp / jmp s3x`: subtract the literal capacity `all` (`= bar-not-1`, lines 1590/1597 -- the number of words between the note array `not` and the bar-pointer array `bar` at `7750`). The combined skip `sma+sza-skp` fires on minus-OR-zero, so the `jmp` is *suppressed* unless `bc+nl > all`. In words: **jump to `s3x` (table-overflow diagnostic) if bars+notes strictly exceeds the available core**. `s3x` types "Table overflow.  Subdivide source program." and routes to the halt at `u` (lines 654-658).
- `load bc` -> `lac bc`; `complement` -> `cma`: reload the bar count and one's-complement it (`complement` is the macro `comple` reached by 6-char folding). `sbc` returns the **complemented** bar count `-bc` in AC.

`sbx, exit sbc` returns. The only run-time self-modification here is the `answer` prologue's `dap crx`-style exit patch (at `sbx`); `tgrec`'s capacity literal and the `s3x` target are fixed.

---

## `snl` (lines 466-471): step the note location

```
snl,	answer swx
	step1 nl
	addi bc
	tgrec all, s3x
	load nl
swx,	exit snl
```

`snl` ("step note location") is the note-array analogue of `sbc`, called each time a compiled note-word is committed to `not`:

- `step1 nl` -> `idx nl`: increment `nl`, the note location in `not`. The `idx` leaves new `nl` in AC.
- `addi bc` -> `add bc`: add the bar count, giving the same bars+notes total used for the capacity test.
- `tgrec all, s3x`: identical overflow guard -- `jmp s3x` if `nl+bc > all`.
- `load nl` -> `lac nl`: return the *un*-complemented note location in AC.

`swx, exit snl` returns. So `sbc` returns `-bc` and `snl` returns `+nl`; the two routines share the single capacity check `bc+nl <= all` against the gap between the `not` and `bar` arrays.

---

## `rcw` (lines 473-475) and `rrc` (lines 477-480): save / restore the read position

These two tiny routines bracket a re-scan so a caller can rewind the `f` read index to the start of the current word.

```
rcw,	answer rwx
	load fi
rwx,	exit rcw
```

`rcw`: `load fi` -> `lac fi` simply returns the current read index `fi` in AC. A caller uses it to remember where it is.

```
rrc,	answer rrx
	move fl2, fi
	store fl1
rrx,	exit rrc
```

`rrc`: `move fl2, fi` expands to `lac fl2 / dac fi` -- copy `fl2` (the index of the last terminator *before the current word*) into the read index `fi`, rewinding the reader to the start of the word just read. AC then holds `fl2`; `store fl1` -> `dac fl1` writes it back into `fl1` as well, collapsing the two terminator markers so the next word begins cleanly. This is how a scan that decides it has over-read a word puts it back for the next pass to see.

---

## `rch` (lines 483-555): read one logical character

`rch` is **the input engine every scan and pseudo routine calls** (e.g. `s10` at line 688, `pz2` at line 667). It returns the next source character in `ch` and in AC. Internally it either replays a character already in the `f` buffer or, if the buffer is exhausted, runs the fill loop that pulls a fresh measure off the tape via `rp`, recognizing terminators and the literal word `end` as it goes.

### Entry and the refill decision (lines 483-491)

```
rch,	answer rcx
	load ft
	tgrel fi, rcf
	sett mbh, fb
	store fi
	store ft
	store fl1
	store fl2
	sett bgs, 1
```

- `answer rcx`: prologue (the argument is ignored; `rch` is called for its result).
- `load ft` -> `lac ft`: AC = write index.
- `tgrel fi, rcf` -> `sub fi / sma / jmp rcf`: compute `ft - fi`; `sma` skips the jump when the result is negative, so the `jmp rcf` fires when `ft - fi >= 0`, i.e. **when the write index has not yet been overrun by the read index** (`ft >= fi`). In that case there is still buffered text (or the terminator slot at `ft` is still to be replayed), so jump straight to `rcf` (line 543) to hand back the next buffered character. (`tgrel C,T` jumps when `AC >= C(C)`; here `AC=ft`, `C=fi`, so "jump if `ft >= fi`". Only once `fi` has advanced *past* `ft` does the test fail and a fresh measure get read.)
- If we fall through, the buffer is empty and we must read a **new measure** from tape. The next six lines reset the buffer:
  - `sett mbh, fb` -> `lac (fb / dac mbh`: load the literal `fb` and point `mbh` (measure-begins-here) at the buffer base.
  - `store fi` / `store ft` / `store fl1` / `store fl2` -> four `dac`s: AC still holds the literal `fb`, so read index, write index, and both terminator markers are all reset to the buffer start `fb`.
  - `sett bgs, 1` -> `lac (1 / dac bgs`: initialize the `end`-recognizer state to 1 (primed to match the first letter `e` -- see the state table below).

### `rcy` -- read body (lines 493-496)

```
rcy,	call rp		/read body
	store ch
	trnl (74, rcc
```

- `call rp` -> `jda rp`: read one 6-bit tape line into AC. `rp` (lines 344-375) waits on the reader, strobes a line, and validates it; see [the `rp` reader notes](#cross-reference-rp-the-tape-line-reader) below. **(not emulator-verified: `rp` uses `cks`/`rrb`/`rpa` IOTs not implemented in the TS emulator.)**
- `store ch` -> `dac ch`: stash the raw character.
- `trnl (74, rcc` -> `sas (74 / jmp rcc`: `sas` skips when AC == literal `74`, so the `jmp rcc` fires when `ch != 74`. FIODEC `74` evidently introduces a comment here (*inferred* from the control flow): a `74` falls through to `rcu` to swallow the comment; anything else is a real body character and jumps to `rcc` to be buffered.

### `rcu` -- read comment (lines 498-501)

```
rcu,	call rp		/read comment
	trnl (72, rcu
	goto rcy
```

When a `74` was seen, `rch` swallows the comment: `call rp` reads a line, `trnl (72, rcu` (`sas (72 / jmp rcu`) loops back to `rcu` while the character is not `72`. FIODEC `72` evidently terminates the comment (*inferred*). When `72` is seen, `goto rcy` (`jmp rcy`) drops back into body reading. Comments are read off the tape but never stored in `f`.

### `rcc` -- classify and buffer a body character (lines 503-516)

```
rcc,	load ch
	trze rc1
	trel (21, rc1
	clear
	goto rc2
rc1,	load (1
rc2,	store pp
	load ft
	putback f, ch
	step1 ft
	tlesc fw, rcs
	load ft
	tlesc fl, rce
	goto rrz
```

First, compute the `pp` flag (whether this character is a *terminator*):

- `load ch` -> `lac ch`.
- `trze rc1` -> `sza i / jmp rc1`: jump to `rc1` if `ch == 0` (FIODEC `00` = space -- a word terminator).
- `trel (21, rc1` -> `sad (21 / jmp rc1`: jump to `rc1` if `ch == 21` (FIODEC `21` = `|`, the measure separator -- also a terminator).
- Otherwise `clear` (`cla`) and `goto rc2`: `pp := 0` for a non-terminator.
- `rc1, load (1` (`lac (1`): `pp := 1` for a terminator (space or bar).
- `rc2, store pp` (`dac pp`): commit the terminator flag.

Then store the character into the buffer and advance the write index:

- `load ft` -> `lac ft`: AC = write index.
- `putback f, ch` -> `add (f / dap .+2 / lac ch / dac` (with `f=0`): AC = `ft + 0 = ft`; patch the in-line `dac` (two words ahead) to address `ft`, load `ch`, and store it -- i.e. `f[ft] := ch`. This is hc1d's indexed-store idiom; the `dac` cell is self-modified each call.
- `step1 ft` -> `idx ft`: advance the write index.
- `tlesc fw, rcs` -> `sub (fw / spa / jmp rcs`: `spa` skips when AC >= 0, so `jmp rcs` fires when `ft - fw < 0`, i.e. **while `ft` is still below the warn point `fw`, jump to `rcs`** (the common case -- no end-of-buffer worry yet).
- If `ft >= fw` we fall through to the hard-limit check: `load ft` then `tlesc fl, rce` -> `sub (fl / spa / jmp rce` -> `jmp rce` when `ft < fl` (still room before the hard end).
- `goto rrz`: if `ft >= fl` the measure overflowed the buffer -> `jmp rrz`, which types "Measure has too many characters.  Rearrange tape." (lines 660-663) and routes to the halt at `u`.

So the buffer-full ladder is: below `fw` -> `rcs`; between `fw` and `fl` -> `rce`; at/above `fl` -> `rrz` (fatal).

### `rce` / `rcs` -- terminator bookkeeping and the `end` dispatch (lines 517-520)

```
rce,	load ch
	trel (21, rfc
rcs,	load bgs
	diswith ch, rdt
```

- `rce` is reached only in the warn zone (`ft >= fw`): `load ch / trel (21, rfc` -> if the character we just stored is `21` (`|`, a measure boundary) jump to `rfc` (finish -- a bar in the warn zone forces the measure to close here). Otherwise fall into `rcs`.
- `rcs, load bgs` -> `lac bgs`: AC = the `end`-recognizer state.
- `diswith ch, rdt` is the macro `diswit ch, rdt` (6-char fold), which expands to `add (rdt / dap .+2 / lac ch / jmp i`. With `bgs` in AC: add the literal table base `rdt`, patch the `jmp i` two words ahead to address `rdt+bgs`, load `ch` (so the dispatched code starts with the character in AC), then `jmp i` *indirectly* through table entry `rdt+bgs` -- i.e. jump to the address **stored at** cell `rdt+bgs`. This is a **computed jump into the `rdt` dispatch table**, indexed by the current `end`-recognizer state. (The PDP-1 `diswit`/`dispat` self-modify the in-line `jmp i`; that cell is rewritten every call.)

### `rdt` and `rd0..rd4` -- the `end` state machine (lines 522-540)

```
rdt,	rd0	rd1	rd2	rd3	rd4
```

`rdt` is a table of five addresses (the words assemble as bare `rd0..rd4`), dispatched through *indirectly* by `diswith`. Because the dispatch indexes `rdt+bgs` and the entries are `rd0` at `rdt+0`, `rd1` at `rdt+1`, ... `rd4` at `rdt+4`, **state `bgs=N` lands at handler `rdN`** (so the initial `bgs=1` set in the entry code lands at `rd1`). Because the dispatch arrives with `ch` in AC, each handler can immediately compare the freshly read character against the next letter of `end`.

```
rd0,	trze rda
	trnl (21, rdp
rda,	sett bgs, 1
	goto rcy
rd1,	trnl (65, rdp
	sett bgs, 2
	goto rcy
rd2,	trnl (45, rdp
	sett bgs, 3
	goto rcy
rd3,	trnl (64, rdp
	sett bgs, 4
	goto rcy
rd4,	trze rfc
	trel (1, rfc
rdp,	move pp, bgs
	goto rcy
```

The machine recognizes the literal source word **`end`** (the end-of-part marker). FIODEC letters in play: `e = 65`, `n = 45`, `d = 64` (from the FIODEC table). The states:

| `bgs` | Handler | char (in AC) tested | On match | On mismatch |
|---|---|---|---|---|
| 0 | `rd0` | a *terminator* (space `00` via `trze`, or bar `21`) -- the boundary that may precede `end` | `rda` -> `bgs := 1` (now expecting `e`) | -> `rdp` |
| 1 | `rd1` | `e` (`65`) | `bgs := 2` | -> `rdp` |
| 2 | `rd2` | `n` (`45`) | `bgs := 3` | -> `rdp` |
| 3 | `rd3` | `d` (`64`) | `bgs := 4` | -> `rdp` |
| 4 | `rd4` | terminator after `d` (`0` via `trze`, or the `1` sentinel) | -> `rfc` (complete `end`) | -> `rdp` |

Walking the matches:

- `rd0` (`bgs=0`, the dead/resync state): `trze rda` (`sza i / jmp rda`) -- if `ch == 0` (space) jump to `rda`; else `trnl (21, rdp` (`sas (21 / jmp rdp`) -- `sas` skips when `ch == 21`, so if `ch == 21` (a bar) the skip fires and we fall into `rda`, while any other character does `jmp rdp`. So state 0 advances to `rda` only on a terminator boundary -- the precondition for a standalone word `end`.
- `rda, sett bgs, 1 / goto rcy`: arm the recognizer to look for the first letter `e` (next dispatch -> `rd1`) and continue reading the body.
- `rd1` (`bgs=1`, expecting `e`): `trnl (65, rdp` -- bail unless `ch == 65` (`e`); on match `sett bgs, 2`.
- `rd2` (`bgs=2`, expecting `n`): `trnl (45, rdp` -- need `n` (`45`); on match `sett bgs, 3`.
- `rd3` (`bgs=3`, expecting `d`): `trnl (64, rdp` -- need `d` (`64`); on match `sett bgs, 4`.
- `rd4` (`bgs=4`, expecting a terminator after `d`): `trze rfc` then `trel (1, rfc` -- if the char after `d` is a terminator (`0`, or the `1` sentinel) we have a clean, free-standing `end`; jump to `rfc` to finish the measure. Otherwise fall to `rdp`.
- `rdp, move pp, bgs` (`lac pp / dac bgs`): the **mismatch reset** -- copy the terminator flag `pp` (1 if the char just stored was a terminator, else 0) into `bgs`. If the failing character was itself a terminator, `bgs := 1`, ready to look for `e` immediately after it; otherwise `bgs := 0`, the dead state that only `rd0`'s terminator test can revive. Then `goto rcy` continues reading the body.

All paths loop back to `rcy` to read the next tape line, so a whole measure (up to a terminator/overflow) is pulled in before any character is returned. The `end` detection lets the reader notice the literal word `end` mid-stream and stop buffering at exactly the right place (via `rfc`).

### `rfc` / `rcf` / `rff` -- finish and return a character (lines 542-555)

```
rfc,	istepa ft, 1
rcf,	load fi
	lookup f
	store ch
	step1 fi
	load ch
	trze rf1
	trel (21, rf1
	move fl1, fl2
	goto rff
rf1,	move fi, fl1
rff,	load ch
rcx,	exit rch
```

`rfc` is entered when a measure has been fully buffered (a bar in the warn zone, or a complete `end`); `rcf` is entered directly from the top of `rch` when the buffer was *not* empty. Both converge on returning one character out of `f` via the read index `fi`:

- `rfc, istepa ft, 1` -> `law i 1 / add ft / dac ft`: `law i 1` loads `-1` (the indirect bit makes `law` load `~1` = `777776` = `-1` in ones-complement), so this **decrements the write index `ft` by one**. The fill loop stored one character *past* the terminator/`end` that ended the measure; backing `ft` up by one trims that lookahead so the buffered measure ends exactly at its terminator.
- `rcf, load fi` -> `lac fi`: AC = read index.
- `lookup f` -> `add (f / dap .+1 / lac` (with `f=0`): AC = `fi + 0 = fi`; patch the in-line `lac` (next word) to address `fi` and execute it -- i.e. `AC := f[fi]`, the next buffered character. This is the indexed-load idiom; the `lac` cell self-modifies each call.
- `store ch` -> `dac ch`: the returned character.
- `step1 fi` -> `idx fi`: advance the read index.
- `load ch / trze rf1 / trel (21, rf1`: if the returned character is a terminator -- `0` (space) via `trze`, or `21` (`|`) via `trel` -- jump to `rf1`.
- For a **non-terminator** (fall-through): `move fl1, fl2` (`lac fl1 / dac fl2`) -- shift `fl1` down into `fl2`, recording "last terminator before this new word" so `rrc` can later rewind a word. Then `goto rff`.
- `rf1, move fi, fl1` (`lac fi / dac fl1`): for a **terminator**, record the just-advanced read index as `fl1` (the location of the most recent terminator). This is exactly the marker `rrc` uses to find word boundaries.
- `rff, load ch` (`lac ch`): leave the returned character in AC.
- `rcx, exit rch`: return (the patched `jmp` from the `answer` prologue).

So on every call `rch` returns one character in both `ch` and AC, maintains `fi` as the cursor, and keeps `fl1`/`fl2` pointed at the last two terminators so a caller can back up exactly one word with `rrc`/`rcw`.

---

## Cross-reference: `rp`, the tape-line reader

`rch` (and the title/part front matter `pg`/`pf`) get their raw bytes from `rp` (hc1d.mac lines 344-375), the producer-side analogue of the player's RIM reader. In outline: it waits on the reader flag (`cks` / `ril 1s` / `spi i` loop at `rt2`), strobes one alphanumeric line (`rrb` then `rpa-i`), stores it in `t1`, then does a validity rotate-and-test, looping past certain control codes (`77`, `36`, `13`) and halting on a hard error. **(not emulator-verified: `cks`, `rrb`, `rpa` are not implemented in the TS emulator; bit-level behavior here is inferred from standard PDP-1 paper-tape I/O and the in-source comments.)** The companion punch routines `fee`/`ppp`/`ppa`/`ppb` -- which emit the intermediate note/bar tape consumed by *PDP-1 Music 13* (see [`05-data-formats.md`](../../pdp1m13/docs/05-data-formats.md)) -- are likewise I/O and out of scope here.

---

## What this accomplishes

These six routines form hc1d's **buffered character source and its measure-level counters**:

- `rch` reads the source DSL one measure at a time into the `f` buffer (skipping `74`...`72` comments), recognizes the standalone word `end` via the `bgs`/`rdt` state machine, trims the terminator lookahead, and hands back characters one at a time through the `fi` cursor -- maintaining `fl1`/`fl2` so callers can rewind exactly one word.
- `rcw`/`rrc` are the save/rewind pair built on those terminator markers, letting scan-1 and scan-2 replay the same buffered measure.
- `cr` types a carriage return for diagnostics; `sbc`/`snl` advance the tape/bar counts (`tbc`, `bc`) and the note location (`nl`) while sharing one capacity check (`bc+nl <= all`) that diverts to the "Table overflow" handler `s3x` when the compiled program would collide the `not` and `bar` arrays.

Every higher-level routine -- scan-1, scan-2, and all the pseudo-command handlers -- pulls its input through `rch`, so this is the foundation the rest of the compiler stands on.

Next: **scan-1** (`s1`, line 677 onward), the first pass that reads a measure's characters out of this buffer and classifies them into numeric fields and terminators.
