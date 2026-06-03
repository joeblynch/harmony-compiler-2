# The key-signature builder (`pva`, `pum`, `pue`, `put`, `pug`, `puw`)

This is one of the trickier regions in the whole front end: the **circle-of-fifths** key-signature builder. It is the pseudo-command handler reached when the transcription source contains a `key` declaration (e.g. `key)` for C major, `key( 2` for two sharps, `key- 3` for three flats). Its job is to populate the **tone tables** `nt` / `kt` / `mt` that the note scanner later consults to turn a staff position into a pitch.

Before walking the code you must understand those three tables, because they *are* the pitch model.

## The three-table pitch model (`nt`, `kt`, `mt`)

The constants block (hc1d.mac lines 1578-1587, see also the memory map in [`04`](./04-memory-map.md)) lays the tables out back to back:

```
mt=.-200	/from .-100, 2006-02-25  --prs.
kt=mt+44
nt=kt+44
nt/	2	4	6	7	11	13
	15	16	20	22	23	25
	...
```

Each table has `44` (octal) = 36 (decimal) entries, one per **staff position** the scanner can address. Reading the layout:

| Table | Symbol | Role | "Resolution stage" |
|---|---|---|---|
| `nt` | canonical (note) table | the fixed, initialized chromatic scale -- the **C-major / no-accidentals** pitch of every staff position. Hard-coded literal values at lines 1582-1587. | canonical |
| `kt` | keyed table | `nt` *after the key signature* has been applied. Sharps/flats from `key` are baked in here. | keyed |
| `mt` | momentary table | `kt` *after any momentary accidental* in the current measure. This is the table the scanner actually reads to get a note's pitch. | momentary |

The dataflow is strictly **`nt` -> `kt` -> `mt`** (canonical, then keyed, then momentary), and each stage is just a copy of the previous stage with a delta applied:

- The **key-signature builder documented here** rebuilds `kt` from `nt` (apply the key's sharps/flats), then copies `kt` into `mt`.
- The **note scanner** consults `mt` to resolve each note's pitch; a momentary accidental (`#`/`b`/natural on a single note) patches one entry of `mt`. At the start of each measure `mt` is refreshed from `kt` (the measure-end routine `teb` does `sett pfu, s1; goto pue`, hc1d.mac lines 1220-1221, which re-runs `copy kt, mt, 44`), so accidentals do not persist past the bar -- standard music-engraving behavior. See the scanner's tone-resolution block at hc1d.mac lines 967-990 ([`13`](./13-scan2-embellishments.md)), where `lookup mt` (line 982) reads the resolved semitone and `putback mt, t1` (line 979) applies a momentary accidental.

The `nt` literals (`2 4 6 7 11 13 15 16 20 22 23 25 ...`, octal) appear to be **semitone codes**: consecutive staff positions a *whole step* apart differ by `2`, those a *half step* apart (the natural E-F and B-C boundaries) differ by `1` (e.g. `6 7` and `22 23`). So `nt[i]` evidently encodes the diatonic major scale; the builder's task is only to add or subtract `1` semitone at the positions named by the key signature. (Semitone-code reading inferred from the spacing of the `nt` literals.)

The pitch-pointer variables (hc1d.mac lines 1517-1518):

```
ton,	0	/s2, key: tone pointer to staff (mt); not changing
tne,	0	/s2, key: tone pointer to table; letter changing
```

- `ton` indexes a **staff position** (an entry of `mt`/`kt`/`nt`); during the key build it walks *up* through the table by the octave stride.
- `tne` here is reused as a **letter index** in the order-of-sharps / order-of-flats walk (it is the note scanner's "tone pointer to table" cell, borrowed during the key build). The source comment calls `tne` the "letter changing" pointer, confirming the role; the exact letter each value names is inferred.

## `key` / `pva` -- read the key character (hc1d.mac 1352-1359)

```
key,
pva,	call rch	/key
	trze pva
	ftrel (55, pum
	ftrel (57, pus
	trel (54, puf
	call rrc
	goto s1
```

- `call rch` expands to `jda rch`: run the **read-character** routine (hc1d.mac line 483), which returns the next source character of the `key` argument in AC. `call` passes/returns its value in AC via the `answer`/`exit` convention (see the [primer](../../pdp1m13/docs/02-pdp1-primer.md) for `jda` and hc1d's calling convention).
- `trze pva` expands to `sza i; jmp pva`: jump back to `pva` **if AC = 0**. A `0` character is a soft terminator/blank, so this *skips leading blanks*, re-reading until a real character arrives.
- `ftrel (55, pum` expands (via the `ftrel`=`trel` alias) to `sad (55; jmp pum`: jump to `pum` **if the char = `55`**. FIODEC `55` is `)` / `=` (from the `s2z` table, hc1d.mac line 1155, `55 /) =`) -- the "natural key" / C marker. So `key)` -> `pum` (no sharps, no flats).
- `ftrel (57, pus` -> `sad (57; jmp pus`: char `57` is `(` / `+` (s2z line 1153, `57 /( +`) -- the **sharps** marker. `key(` -> `pus`.
- `trel (54, puf` -> `sad (54; jmp puf`: char `54` is `-` (minus) (s2z line 1154, `54 /-`) -- the **flats** marker. `key-` -> `puf`. (The musical meaning -- `(`/`+` = sharps, `-` = flats -- is inferred from the seeders below, not stated in the source.)
- `call rrc` (= `jda rrc`, hc1d.mac line 477) -- reached only if the character was none of `) ( -`. `rrc` is "re-read character": it does `move fl2, fi; store fl1` (lines 478-479), rewinding the read pointer so the unexpected character is **not consumed** by the key handler.
- `goto s1` expands to `jmp s1` (hc1d.mac line 677): hand control back to the main scan-1 loop. A `key` with a malformed argument is silently abandoned -- the character that wasn't `) ( -` becomes the next thing the scanner sees.

**Why:** `pva` classifies the key declaration into three families -- *natural* (C), *sharp*, *flat* -- and dispatches. The `55`/`57`/`54` literals are the FIODEC codes for the glyphs the transcriber types after `key`. (FIODEC decodes per the provided character set and the in-source `s2z` comments; treat the exact glyph-to-meaning mapping as inferred.)

## `pum` / `pun` / `pue` -- the natural / "rebuild" core (hc1d.mac 1361-1364)

```
pum,	sett pfu, s1
pun,	copy nt, kt, 44
pue,	copy kt, mt, 44
	govia pfu
```

- `pum,` `sett pfu, s1` expands to `lac (s1; dac pfu`: load the **literal address `s1`** into the switch cell `pfu` (the "title/key switch", hc1d.mac line 1547); here it is armed with the continuation `s1` (return to the main scanner). This is the natural-key entry: after rebuilding the tables, just resume scanning.
- `pun,` `copy nt, kt, 44` -- the `copy` macro (definition hc1d.mac lines 289-300) is a self-modifying block move of `N+1` words. With `H=nt, I=kt, N=44`, it copies `44`(octal)+1 entries from `nt` into `kt`. Concretely the macro patches a `lac`/`dac` pair with `dap`, copies a word, `idx`es both pointers, and loops until it has stored `dac kt+44`. **Effect: `kt := nt`** -- reset the keyed table to the canonical scale (clears any prior key signature).
- `pue,` `copy kt, mt, 44` -- same block move, `kt` -> `mt`. **Effect: `mt := kt`** -- reset the momentary table to the keyed table.
- `govia pfu` expands to `jmp i pfu`: indirect jump **through** `pfu` (jump to the address stored in `pfu`). This is hc1d's switch-return idiom (`govia P` = `jmp i P`). On the natural path `pfu` holds `s1`, so control returns to the main scanner.

**Why these are separate labels:** `pun` and `pue` are *re-entry points*, not just fall-through targets, and they are reached from several places with `pfu` set to different continuations:

- The natural-key path enters at `pum`, which sets `pfu := s1` and falls through `pun` (`kt := nt`) and `pue` (`mt := kt`), then `govia pfu` returns to `s1`. (Confirmed by hc1d.mac line 448-449, where the per-part initializer does `sett st, 26; goto pum` with the comment *"copies nt to kt to mt, goes to s1"*.)
- The sharp/flat path enters at `pun` (via the `psw` switch, see below) with `pfu` already armed with a *seeder* (`put`/`pug`). It resets `kt := nt` and `mt := kt`, then `govia pfu` diverts into the seeder rather than returning -- so the loop can modify the freshly-reset `kt`.
- `pw2` and the measure-end routine `teb` re-enter at `pue` alone to copy a modified `kt` out to `mt`.

## `pus` / `puf` / `puh` -- arm for a sharp or flat *count* (hc1d.mac 1366-1371)

```
pus,	sett pfu, put
	goto puh
puf,	sett pfu, pug
puh,	sett psw, pun
	sett ao, 1
	goto s1
```

A `key(` or `key-` is followed by a **number** -- how many sharps/flats. That number has not been read yet, so this block sets up two callbacks: one to run the table rebuild, one to run the seeder.

- `pus,` `sett pfu, put` = `lac (put; dac pfu`: arm `pfu` with the **sharp seeder** `put`.
- `goto puh` -- skip the flat case.
- `puf,` `sett pfu, pug` = `lac (pug; dac pfu`: arm `pfu` with the **flat seeder** `pug`.
- `puh,` `sett psw, pun` = `lac (pun; dac psw`: load the **literal `pun`** into `psw`, the "switch for return with argument" (hc1d.mac line 1537). When the argument scanner finishes reading the count, it returns through `psw` (via `ps, govia psw`, line 1273) -- so the first thing that runs is `pun`, the table reset.
- `sett ao, 1` = `lac (1; dac ao`: set **arguments-outstanding = 1** (hc1d.mac line 1500). The main scan loop tests `ao` at `test1 ao, ps` (hc1d.mac line 745); a nonzero `ao` after a field has been read routes control to `ps`, which does `govia psw`.
- `goto s1` -- resume scanning to collect that number; `n1` will hold the count when control comes back.

**Why two switch cells (the order matters):** `psw` and `pfu` are consumed at *different* times:

1. When the count has been read, `ps` does `govia psw` (= `jmp i psw`). Since `psw = pun`, control reaches **`pun` first**: `kt := nt`, then `pue` does `mt := kt`, then `govia pfu`.
2. Because `pfu` was armed with the **seeder** (`put` for sharps, `pug` for flats), that `govia pfu` jumps to the seeder, which seeds `acc`/`aci`/`tne` and runs the circle-of-fifths loop `puw`, modifying the just-reset `kt`.

So `psw` selects the *table-reset preamble* (`pun`) that runs first; `pfu` selects *which seeder* (`put`/`pug`) the preamble hands off to. The seeders end by reaching `pw2`, which re-arms `pfu := psr` and re-enters `pue` to publish the modified `kt` into `mt`.

## `put` vs `pug` -- seed the accidental walk (hc1d.mac 1373-1380)

```
put,	sett acc, 1
	sett aci, 4
	sett tne, 3
	goto puw
pug,	sett acc, -1
	sett aci, 3
	sett tne, 6
```

These set the three constants that drive the circle-of-fifths loop. Each `sett X, V` is `lac (V; dac X` (load the literal `V` into cell `X`).

| Cell | Sharp (`put`) | Flat (`pug`) | Meaning |
|---|---|---|---|
| `acc` | `1` | `-1` | semitone **delta** added to each affected note: `+1` raises (sharp), `-1` lowers (flat). (`-1` is ones-complement `777776`.) The source comment calls `acc` the "accid. count" (line 1513); the code uses it as the added delta. |
| `aci` | `4` | `3` | the **spacing** added to `tne` each outer pass -- the letter stride between successive sharps/flats. (Source comment "key: spacing", line 1512.) |
| `tne` | `3` | `6` | the **starting letter index** in the table (`tne` reused as a letter pointer, see line 1518). |

`put` ends with `goto puw`, so it jumps past `pug` straight into the loop. `pug` has no `goto`; it **falls through into `puw`** at line 1381.

**Why these seeds (the load-bearing reasoning, mostly inferred):**

- The order of sharps is F#, C#, G#, D#, A#, E#, B#; the order of flats is its reverse, Bb, Eb, Ab, Db, Gb, Cb, Fb. The two seeds (`tne=3` for sharps, `tne=6` for flats) and the two strides (`aci=4` vs `aci=3`) appear to place `ton` (derived from `tne` at `puw`, line 1382) at the first sharp / first flat and march it in the correct direction.
- `acc=+1`/`-1` is the literal semitone change written into `kt`.
- These are *seeds for `tne`/`acc`/`aci`*; the actual table index `ton` is computed from `tne` at `puw` (next). The precise letter that `tne=3` vs `tne=6` selects is **inferred** from the circle-of-fifths convention plus the `nt` semitone spacing; the source comments confirm the *roles* of the cells but not the exact letter mapping.

## `puw` / `pw1` / `pw2` -- walk the circle of fifths (hc1d.mac 1381-1399)

```
puw,	test0 n1, pw2
	move tne, ton

pw1,	load ton
	lookup nt
	addi acc
	store t4
	load ton
	putback kt, t4
	stepa ton, 7
	tlesc 44, pw1
	istepa n1, 1
	step tne, aci
	tlesc 7, puw
	istepa tne,7
	goto puw

pw2,	sett pfu, psr
	goto pue
```

### `puw` -- loop guard and per-pass init (1381-1382)

- `test0 n1, pw2` expands to `lac n1; sza i; jmp pw2`: load the **remaining accidental count** `n1`; if it is `0`, jump to `pw2` (done). This is the outer loop's exit test -- one pass per requested sharp/flat.
- `move tne, ton` = `lac tne; dac ton`: copy the current letter index `tne` into the staff pointer `ton`. Each outer pass starts `ton` at the table position of the *next* accidental's letter.

### `pw1` -- apply `acc` to every octave of one letter (1384-1391)

```
pw1,	load ton
	lookup nt
	addi acc
	store t4
	load ton
	putback kt, t4
	stepa ton, 7
	tlesc 44, pw1
```

- `load ton` = `lac ton`: AC := the current staff index.
- `lookup nt` -- the indexed-load macro (definition lines 149-153): `add (nt; dap .+1; lac`. It computes `AC + nt` (the address `nt+ton`), patches the **very next word** (`.+1`, which is the bare `lac` the macro emits) with that address, then executes it. Net: **AC := nt[ton]**, the canonical semitone of this staff position. (Self-modifying: the patched cell is the `lac` inside the macro expansion.)
- `addi acc` = `add acc`: add the accidental delta (`+1` sharp / `-1` flat). AC is now the *keyed* semitone for this note.
- `store t4` = `dac t4`: stash it.
- `load ton` = `lac ton`: reload the index (it was clobbered).
- `putback kt, t4` -- the indexed-store macro (definition lines 269-274): `add (kt; dap .+2; lac t4; dac`. Computes address `kt+ton`, patches the bare `dac` (at `.+2`) with it, loads `t4`, and stores. Net: **kt[ton] := t4** -- write the altered semitone into the keyed table. (Self-modifying: the patched cell is the trailing `dac`.)
- `stepa ton, 7` -- `stepa J,I` = `law I; add J; dac J`; here `law 7; add ton; dac ton`. **ton += 7** (octal). `7` is the **octave stride**: in this 36-entry chromatic table, advancing 7 staff positions (7 letters) lands on the *same letter one octave up*. So this inner loop sharps/flats **every octave** of the current letter across the staff range. (The 7-per-octave reading is inferred from the table layout and the stride.)
- `tlesc 44, pw1` -- `tlesc C,T` = `sub (C; spa; jmp T`; here `sub (44; spa; jmp pw1`. After `sub (44`, AC = `ton - 44`; `spa` skips on AC >= 0 (in ones-complement, sign bit clear). So when `ton >= 44` the `jmp pw1` is skipped (loop ends); when `ton < 44` the jump fires and the loop continues. Net: **jump back to `pw1` while `ton < 44`** (octal, the table size), fall through once `ton` reaches or passes the top. The next instruction reloads `ton` via `load ton` at the top of `pw1`, so the `sub` clobber of AC is harmless.

### `pw1` tail -- advance to the next accidental (1392-1396)

```
	istepa n1, 1
	step tne, aci
	tlesc 7, puw
	istepa tne,7
	goto puw
```

- `istepa n1, 1` -- `istepa J,I` = `law i I; add J; dac J`; here `law i 1; add n1; dac n1`. `law i 1` loads the literal **-1** (ones-complement), so this is **n1 -= 1** -- one fewer accidental remaining. (See [primer](../../pdp1m13/docs/02-pdp1-primer.md) on `law i`.)
- `step tne, aci` -- `step J,I` = `lac J; add I; dac J`; here `lac tne; add aci; dac tne`. **tne += aci**: advance the letter index by the order-of-sharps/flats spacing (`4` for sharps, `3` for flats). This selects the *next* letter in the accidental sequence.
- `tlesc 7, puw` = `sub (7; spa; jmp puw`: jump back to `puw` **while `tne < 7`** -- i.e. while the letter index is still inside the first octave's 7 letters. The common case: take the next accidental.
- `istepa tne, 7` -- `law i 7; add tne; dac tne`: **tne -= 7** -- fold the letter index back down by one octave when `step tne,aci` pushed it to or past the 7-letter span. This keeps `tne` a valid letter index. (Reached only when the `tlesc 7` test fell through, i.e. `tne >= 7`.)
- `goto puw` -- loop.

**Why the strides:** `7` is the octave stride in the table (inner loop, hits all octaves of one letter); `aci` (`4`/`3`) is the *between-accidentals* spacing that walks the circle of fifths; and the `tlesc 7` / `istepa tne,7` pair keeps the letter index folded into one octave. Each outer iteration handles one sharp/flat for *all octaves*, decrements `n1`, and steps to the next letter -- evidently the order a musician writes a key signature. The exact letter that each `tne` value names is **inferred** from the circle-of-fifths convention; the cell roles are confirmed by the source comments and the loop structure.

### `pw2` -- finish and publish (1398-1399)

```
pw2,	sett pfu, psr
	goto pue
```

- `sett pfu, psr` = `lac (psr; dac pfu`: arm `pfu` with `psr` (hc1d.mac line 1306, the pseudo-command-finish entry that does `zero ao; goto te`).
- `goto pue` -- jump to `pue` (line 1363). `pue` does `copy kt, mt, 44` (**mt := kt** -- publish the freshly keyed table into the momentary table) and then `govia pfu` (= `jmp i pfu`), which now returns through `psr`, ending the key declaration cleanly (`psr` clears `ao` and jumps to `te`).

**Why route through `pue`:** the sharp/flat loop only rebuilt `kt`. The momentary table `mt` must be refreshed from the new `kt` so the scanner sees the key signature. Rather than duplicate the copy, `pw2` re-enters the shared `pue` step and borrows its `govia pfu` tail -- a textbook example of hc1d's reuse-by-re-entry style.

## What this accomplishes

The key-signature builder reads the `key` argument, classifies it as natural / sharp / flat, and rebuilds the pitch tables accordingly. For a natural key (`pum`) it simply resets `kt := nt` and `mt := kt` (C major) and returns. For *n* sharps or flats it first resets `kt := nt` and `mt := kt` (the `pun`/`pue` preamble reached through `psw`), then via `pfu` enters a seeder (`put`/`pug`) that sets `acc` (`+1`/`-1`), the spacing `aci` (`4`/`3`), and the start letter `tne` (`3`/`6`); for each of the *n* accidentals it adds `acc` to `nt[letter]` at every octave (`+7` stride), writing the result into `kt`; finally `pw2` copies the keyed table into `mt`. This is the **canonical -> keyed** stage of the three-table pitch model; the **keyed -> momentary** stage and the per-note `mt` lookups happen in the note scanner. The whole routine is heavily self-modifying (`lookup`/`putback`/`copy` all `dap`-patch their own `lac`/`dac` cells) and reuses `pun`/`pue`/`pum` as shared re-entry points selected by the `pfu`/`psw` switch cells.

Next: the Scan-2 character dispatcher `s2` ([`11`](./11-scan2-dispatch.md)) and the tone-resolution / embellishment code ([`13`](./13-scan2-embellishments.md)), which consume `mt` (via `lookup mt`) to resolve each note's pitch and apply momentary accidentals on top of the key signature built here.
