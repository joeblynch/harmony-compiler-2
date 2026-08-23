# Scan 2 tables: `s2z`, `s2y`, `ebl`/`ebd`/`ebe`

This section documents the four read-only decode tables that the **scan-2** pass (`s20`…) and the **embellishment generator** (`s70`…) consult. None of them contain code; they are pure data, laid out so that a single `search`/`dispatch`/`lookup` macro can turn a FIODEC character (or an embellishment selector value) into a handler address or a length. They are the "key" that makes the scan-2 dispatcher table-driven, and the `s2z` glyph comments are the program's most authoritative FIODEC evidence (they feed the appendix character chart).

The four tables occupy `hc1d.mac` lines 1147–1188, immediately after the note-finalization tail `s33` (line 1141) and before the terminator handler `te` (line 1193). They are referenced from four places:

| Reference | hc1d.mac line | Macro call | Uses |
|---|---|---|---|
| scan-2 char dispatch | 848–849 | `search s2z, 25, s20` then `dispatch s2y` | `s2z` + `s2y` |
| embellishment length | 997 | `lookup ebl-1` | `ebl` |
| embellishment phase 1 | 1030 | `dispatch ebd-1` | `ebd` |
| embellishment phase 2 | 1094 | `dispatch ebe-1` | `ebe` |

Core instruction semantics (`add`, `dap`, `jmp i`, `idx`, `sad`, `sas`, `lac`) are in [the PDP-1 primer](../../pdp1m13/docs/02-pdp1-primer.md); the hc1d macros (`search`, `dispat`/`dispatch`, `lookup`, `load`, `sett`) are expanded in this doc set's macro appendix and recapped inline below. **All numbers are octal** — including the counts `25` (`= 21` decimal) and `14` that appear below.

---

## `s2z` — the recognized scan-2 characters (lines 1147–1167)

`s2z` is a 21-entry (`25` octal) list of FIODEC codes: every character that scan-2 is willing to act on. The source annotates each entry with the glyph it stands for. Reproduced exactly:

```
s2z,	22	/s
	43	/l
	65	/e
	61	/a
	62	/b
	63	/c
	57	/( +
	54	/-
	55	/) =
	64	/d
	44	/m
	45	/n
	47	/p
	24	/u
	26	/w
	73	/.
	27	/x
	21	// |
	00	/ space
	50	/q
	70	/h
```

The role of each code is the action of its paired `s2y` handler (next subsections); the table below summarizes, with the music meaning marked *inferred* where the source gives only the glyph.

| Index | FIODEC (octal) | Glyph (in-source comment) | `s2y` handler / action |
|---:|---:|---|---|
| 0 | 22 | `s` | `s2b`: set sle value `sv := 200000` (inferred) |
| 1 | 43 | `l` | `s2c`: set sle value `sv := 400000` (inferred) |
| 2 | 65 | `e` | `s2d`: clear sle value `sv := 0` (inferred) |
| 3 | 61 | `a` | `s2e`: staff relocation up — `stepa sr,14` |
| 4 | 62 | `b` | `s2f`: staff relocation down — `istepa sr,14` |
| 5 | 63 | `c` | `s2g`: set triplet indicator `3i := 100000` |
| 6 | 57 | `(` / `+` | `s2h`: accidental **sharp** — `step1 acc`, `aci := 1` |
| 7 | 54 | `-` | `s2i`: accidental **flat** — `acc := acc-1`, `aci := 1` |
| 8 | 55 | `)` / `=` | `s2j`: **natural** — `aci := -1` |
| 9 | 64 | `d` | `s2k`: embellishment selector value `1` → `s28` |
| 10 | 44 | `m` | `s2l`: embellishment selector value `2` → `s28` |
| 11 | 45 | `n` | `s2m`: embellishment selector value `3` → `s28` |
| 12 | 47 | `p` | `s38`: embellishment selector value `6` → `s28` |
| 13 | 24 | `u` | `s2n`: embellishment selector value `4` → `s28` |
| 14 | 26 | `w` | `s2o`: embellishment selector value `5` → `s28` |
| 15 | 73 | `.` | `s2p`: dot — `fu := fu+fc`, then halve `fc` (inferred: dotted duration) |
| 16 | 27 | `x` | `s2q`: halve fraction `fc` (inferred) |
| 17 | 21 | `\|` | `s2r`: **note terminator** (build the note) |
| 18 | 00 | space | `s2r`: **note terminator** (build the note) |
| 19 | 50 | `q` | `2sr`: set sle value `sv := 20000` (inferred) |
| 20 | 70 | `h` | `2ss`: set sle value `sv := 40000` (inferred) |

> **The glyph *meanings* are authoritative (the `(inferred)` tags concern only the bit values).** Every character here is a recognized token of the Harmony Compiler's input language, defined by Peter Samson in [*MusicCompiler-a.pdf*](../prs-docs/MusicCompiler-a.pdf) / [*MusicCompiler-b.pdf*](../prs-docs/MusicCompiler-b.pdf): the **articulation** letters `s` (staccato), `l` (legato), `e` (eighth/default), `h` (half), `q` (quarter) (p. 6); the **accidentals** `(` = sharp, `)` = natural, `-` = flat, with `((`/`--` for double sharp/flat (p. 5); the octave-relocation letters `a` (one staff above) / `b` (one staff below) (pp. 4–5); the **triplet** letter `c` (p. 4); the **dot** `.` and `x` ("halve the value of the dot") (p. 3); and the **embellishment** letters `d m n u w p` (p. 7, see `ebl` below). What remains code-derived ("inferred") is only the *bit pattern* each articulation letter writes into `sv`, which the consumer side confirms maps to articulation classes `{l=8, e=0, h=2, q=1, s=4}` ([`05-data-formats.md`](../../pdp1m13/docs/05-data-formats.md) §2, and [*music_intermediate_format.pdf*](../prs-docs/music_intermediate_format.pdf)).

That is 21 entries — exactly `25` octal. The label `s2z+25,` at line 1169 (where `25` is octal `= 21` decimal) sits on the word immediately after the 21st entry, asserting the table's length; it creates **no gap**. The `search` count is likewise `25` octal (`search s2z, 25, s20`), so the linear scan covers exactly these 21 entries. *(There is no "25-versus-21" mismatch: in this all-octal assembler `25` is `21`.)*

### How `s2z` is consumed — `search s2z, 25, s20` (line 848)

The dispatcher reads one cleaned source character into `chr` at `s20` (line 842), bounds-checks it, then `s21` (line 847) searches and dispatches:

```
s20,	call rch            / fetch next cleaned source char
	store chr           / save it
	trze s21            / sza i; jmp s21  if char = 0 (space)
	tgrec 20, s21       / jump s21 if char > 20 (octal)
	goto s20            / else re-fetch
s21,	load chr            / lac chr
	search s2z, 25, s20 / linear-search s2z for AC; ERR = s20
	dispatch s2y        / computed jump through s2y[index]
```

`search W,N,ERR` (macro def lines 302–315) expands to a self-modifying linear scan of `W[0..N]` for the value in AC. The scan patches its own `sad W` instruction (via `dap .+2` / `idx`) and loops while that patched address differs from `sad W+N`. On a hit it falls through to the tail `lac .-6 ; add (-sad-W`, which recovers **AC = the matched index** (matched position minus base `W`). On no match it does `jmp ERR`. Here `ERR = s20`, so an unrecognized character is silently re-fetched — scan-2 keeps reading until it sees one of the 21 known codes. The returned index then feeds `dispatch s2y` (next subsection) as a parallel-array lookup.

---

## `s2y` — the parallel dispatch targets (lines 1170–1173)

`s2y` is the address table that runs in lockstep with `s2z`: slot *i* of `s2y` is the handler for the character at slot *i* of `s2z`. It also has 21 entries (`25` octal). Reproduced exactly:

```
s2y,	s2b	s2c	s2d	s2e	s2f	s2g
	s2h	s2i	s2j	s2k	s2l	s2m
	s38	s2n	s2o	s2p	s2q	s2r
	s2r	2sr	2ss
```

The label `s2y+25,` at line 1175 (`25` octal `= 21` decimal) again marks the end of the 21 entries — no padding, no unreachable slots.

### How `s2y` is consumed — `dispatch s2y` (line 849)

`dispatch` resolves (6-char fold: `DISPAT`) to the `dispat U` macro (def lines 256–260):

```
dispat U  ==  add (U      / AC := index + (address of s2y)
              dap .+1     / patch the next instruction's address field
              jmp i       / jump indirect through s2y[index]
```

So with AC holding the `search` result (the matched index), `add (s2y` forms the address `s2y+index`, `dap .+1` writes that into the following `jmp i`, and `jmp i` jumps **indirect** through `s2y[index]` — landing on the handler. This is the classic hc1d computed-jump idiom; the only state it mutates is the `jmp i` cell itself.

### Char → handler pairing

Pairing each `s2z` code with its `s2y` target (handler bodies at lines 851–906):

| `s2z` glyph | FIODEC | `s2y` target | Handler action (label + key effect) |
|---|---:|---|---|
| `s` | 22 | `s2b` | `sett sv,200000` (line 851) → `s2a` |
| `l` | 43 | `s2c` | `sett sv,400000` (853) → `s2a` |
| `e` | 65 | `s2d` | `zero sv` (859) → `s2a` |
| `a` | 61 | `s2e` | `stepa sr,14` (862) — staff reloc up (add literal `14` to `sr`) |
| `b` | 62 | `s2f` | `istepa sr,14` (864) — staff reloc down (subtract literal `14`) |
| `c` | 63 | `s2g` | `sett 3i,100000` (866) — set triplet indicator `3i` |
| `(` `+` | 57 | `s2h` | sharp (868): if `aci<0` complaint `nor`, else `step1 acc`, `aci:=1` |
| `-` | 54 | `s2i` | flat (871): if `aci<0` complaint `nor`, else `istepa acc,1` (acc−1), `aci:=1` |
| `)` `=` | 55 | `s2j` | natural (877): if `aci=1` complaint `nor` (+`zero acc`); set `aci:=-1` |
| `d` | 64 | `s2k` | `load (1` (885) → `s28` (embellishment selector value 1) |
| `m` | 44 | `s2l` | `load (2` (887) → `s28` (value 2) |
| `n` | 45 | `s2m` | `load (3` (889) → `s28` (value 3) |
| `u` | 24 | `s2n` | `load (4` (891) → `s28` (value 4) |
| `w` | 26 | `s2o` | `load (5` (893) → `s28` (value 5) |
| `p` | 47 | `s38` | `load (6` (895) → `s28` (value 6) — note `s38` is its own label |
| `.` | 73 | `s2p` | `step fu,fc` (902) — `fu += fc`; falls into `s2q` |
| `x` | 27 | `s2q` | `halfof fc` (903) — halve `fc`, then `s20` |
| `\|` | 21 | `s2r` | **note terminator** (906): finish the note value |
| space | 00 | `s2r` | **note terminator** (906) — same path |
| `q` | 50 | `2sr` | `sett sv,20000` (855) → `s2a` |
| `h` | 70 | `2ss` | `sett sv,40000` (857) → `s2a` |

Several pairing notes, all as-written:

- The handlers that set `sv` (`s2b`,`s2c`,`s2d`,`2sr`,`2ss`) all converge on `s2a` (line 860), whose first instruction is **`setpa si, 1`** — *likely a retype slip for `stepa si, 1`* (the symbol dump shows `setpa` undefined). Expanded as `stepa si,1` it is `law 1 ; add si ; dac si`, incrementing the per-note sle flag `si` by 1, then `goto s20`.
- **`s2r` appears twice** (slots 17 and 18): both `\|` (21, measure bar) and space (00) drop into the same note-terminator path `s2r`. A note value is finished either by an explicit bar `\|` or by a space.
- The labels `2sr`/`2ss` are distinct from `s2r`; they are sle-value handlers (`sett sv,20000` / `sett sv,40000`), not terminators. *(The musical meaning of each `sv` bit-pattern — `200000`/`400000`/`20000`/`40000`/`0` — is inferred from `sv` being the "value of ss for a particular note", where `ss` is the running status of the sle (slur) indicator per the variable comments at lines 1506–1507; the source gives only the glyph comments.)*

The handlers at `s2h`/`s2i` (`+`/`-`) are the **accidental** mechanism: `+` increments the count `acc` (sharp), `-` decrements it (flat), and both set `aci := 1` to record that an accidental is pending; first, each guards with `testm aci, s24` so that if a natural is already pending (`aci<0`) it instead issues the `nor` complaint (line 875). `)`/`=` (`s2j`) requests a natural and sets `aci := -1`, but complains (`nor`, line 881) if a `+`/`-` accidental was already pending (`aci=1`). These counts later drive the tone-table walk at `s2v`/`s31` (lines 968–990): when an accidental is pending, `acc` is added to the canonical tone `nt[ton]` and the result is filed into the momentary tone table `mt[ton]` (via `putback mt,t1`); otherwise `s31` reads `mt[ton]` directly. *(The sharp/flat/natural reading of `acc`/`aci` is from the variable comment "accid. ind.: 0/none, 1/sharp or flat, -1/natural" at line 1511; the per-step musical effect is inferred.)*

---

## `ebl` — embellishment lengths (lines 1176–1181)

When scan-2 has recognized an embellishment letter (the `d m n u w p` group, selector values 1–6 stored in `et`/`ete`), the embellishment generator at `s71` (line 996) needs to know how many time-units that embellishment spans. `ebl` is that lookup table:

```
ebl,	6	/d
	4	/m
	10	/n
	10	/u
	4	/w
	5	/p
```

| Selector value (in `ete`) | Embellishment letter | Length (octal units) | Ornament (per spec) |
|---:|---|---:|---|
| 1 | `d` | 6 | short mordent |
| 2 | `m` | 4 | trill (without suffix) |
| 3 | `n` | 10 | trill with suffix |
| 4 | `u` | 10 | turn |
| 5 | `w` | 4 | trill (later composers) |
| 6 | `p` | 5 | praller (pralltriller) |

(`ebl+6,` at line 1182 asserts the table has 6 entries.) The ornament names come from Peter Samson's embellishment figure ([*MusicCompiler-a.pdf*](../prs-docs/MusicCompiler-a.pdf), p. 7 / [*MusicCompiler-b.pdf*](../prs-docs/MusicCompiler-b.pdf), p. 7, Fig. 11) — they are authoritative, not inferred; only the note-by-note construction in the `s8x` handlers is read from the source. See [`13-scan2-embellishments.md`](13-scan2-embellishments.md) for the per-letter figures.

### How `ebl` is consumed — `lookup ebl-1` (line 997)

At `s71`:

```
s71,	load ete         / lac ete  (AC := selector value 1..6)
	lookup ebl-1     / AC := C(ete + (ebl-1)) = ebl[value-1]
	subt nft         / sub nft  — AC := ebl[value-1] - nft
	trze s99         / sza i; jmp s99 if AC = 0
	complement       / cma — negate (jumps over if nonzero)
s99,	store ex         / dac ex
	trpl s73         / sma; jmp s73  if ex >= 0
```

`lookup V` (the indexed-load macro, def lines 149–153) expands to `add (V ; dap .+1 ; lac`: it adds the literal table base to AC, patches the following `lac`, and loads that cell. The base used is `ebl-1` so that a selector value of **1** addresses `ebl[0]` (the `d` entry) — the table is effectively 1-indexed. The note's formed time `nft` is then subtracted from the fetched length; the generator uses the result (stored in `ex`, the time for the sustained note) to decide whether the embellishment fits in the note (`s73` etc., lines 1004–1029).

---

## `ebd` and `ebe` — the two embellishment-generator dispatch phases (lines 1183, 1186)

Embellishment expansion happens in two phases, each a computed jump through a 6-entry address table indexed by the same selector value (1–6). Both are consumed with `dispatch …-1`, mirroring `ebl`'s 1-based indexing.

### `ebd` — phase 1 (line 1183), consumed at `dispatch ebd-1` (line 1030)

```
ebd,	s81	s82	s83	s84	s85	s86
```

The body reaches this from `s73` (lines 1007–1030), which has just built the upper neighbor tone `tnf` (`tne+1`) and lower neighbor tone `tnd` (`tne-1`) around the main tone `tne`, then:

```
	load ete           / lac ete  (selector 1..6)
	dispatch ebd-1     / jmp i  ebd[value-1]
```

| Selector | Letter | Phase-1 target | What it emits (from bodies, lines 1032–1086) |
|---:|---|---|---|
| 1 | `d` | `s81` | two `cn` calls: `tne` (main) then `tnd` (lower) → `s75` |
| 2 | `m` | `s82` | `zero cut` → `s76` (trill body, no time withheld) |
| 3 | `n` | `s83` | `sett cut,4` → `s76` (trill with 4 units withheld) |
| 4 | `u` | `s84` | three `cn` calls with `(400002` added to `tnf`,`tne`,`tnd` → `s75` |
| 5 | `w` | `s85` | one `cn` on `tne`, then `goto s83` (trill) |
| 6 | `p` | `s86` | three `cn` calls on `tnf`,`tne`,`tnf` → `s75` |

`dispat`/`dispatch` is the same `add (U ; dap .+1 ; jmp i` idiom as `s2y`; here `U = ebd-1`, so selector 1 lands on `ebd[0]=s81`. Each target writes one or more note words via `call cn` — the note-emitter at line 1109 (`answer cnx` … `store nf` … `call snl` … `putback not,nf`) — and then converges on `s75` (the sustained-tone emitter, line 1086) or `s76` (the trill loop, line 1044). *(The bit `400002` is added as a literal to the tone pointers in `s84`; reading it as a "sustain" flag, and the neighbor/trill/turn shapes generally, are inferred from the body structure.)*

### `ebe` — phase 2 (line 1186), consumed at `dispatch ebe-1` (line 1094)

The phase-2 table closes out the embellishment from `s78` (line 1093), reached after the trill loop has run:

```
s78,	load ete           / lac ete
	dispatch ebe-1     / jmp i  ebe[value-1]
```

```
ebe,	s32	s32	s93	s32	s95	s32
```

| Selector | Letter | Phase-2 target | Effect (bodies at lines 1096–1107, 1136) |
|---:|---|---|---|
| 1 | `d` | `s32` | finalize (no extra tone) |
| 2 | `m` | `s32` | finalize |
| 3 | `n` | `s93` | emit `tnd` then `tne`, then `goto s32` |
| 4 | `u` | `s32` | finalize |
| 5 | `w` | `s95` | emit `tnf` once, then `goto s32` |
| 6 | `p` | `s32` | finalize |

Four of the six selectors (`d`,`m`,`u`,`p`) need no extra phase-2 tone, so they share the single common finalizer `s32` (line 1136) — the table simply repeats the `s32` address. Only `n` (`s93`) and `w` (`s95`) emit an additional closing note before falling through to `s32`. `s32` itself computes `tu = 3*nft` (`load nft ; store tu ; x2to1 ; addi tu ; store tu`), then `s33` adds `tu` into the running measure total `mm` and goes to `te`. As with `ebd`, the base offset is `ebe-1` so the selector value indexes directly.

---

## What this accomplishes

These four tables turn scan-2 and the embellishment generator from a tangle of `sad`/`jmp` chains into clean table-driven dispatchers. `s2z`+`s2y` form a parallel char→handler array: `search s2z` returns the index of the input FIODEC code (or loops back to `s20` on an unknown code), and `dispatch s2y` jumps through the matching handler — so adding a recognized character is, in principle, one entry in each table. Both tables hold exactly 21 entries (`25` octal); the `s2z+25,`/`s2y+25,` labels are exact end-of-table assertions, not gaps. `ebl`/`ebd`/`ebe` form a 1-indexed (`…-1` base) triple keyed by the embellishment selector value 1–6: `ebl` gives the embellishment's length in time-units, `ebd` selects the phase-1 figure generator (neighbor/trill/turn), and `ebe` selects the phase-2 closer (mostly the shared finalizer `s32`). The `s2z` glyph comments are the most authoritative FIODEC evidence in the program and are the source for the appendix character chart.

Next: the **terminator and pseudo-command dispatch** at `te` (line 1193 onward), where a measure-end terminator (`trm`) or a pseudo-command is handled and the note buffer `not` is flushed toward the punched output tape.
