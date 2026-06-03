# The pseudo-command recognizer (`pc`, `pnm`/`pcd`/`pn*`)

A *pseudo-command* (or "pseudo") is a typed-out keyword in the music-transcription DSL that is not a note — words such as `bass`, `treble`, `key`, `tempo`, `units`, `rest`, `copy`, `up`, `down`, `end`, and the single-letter dynamics/articulation markers `s l e h q`. When the scanner hits one of these, it calls into `pc`, the routine documented here. `pc`'s job is to *identify which pseudo was typed* by matching its characters against a table of name strings, and then *dispatch* (computed-jump) to the matching handler `pv1`..`pvh`.

This file owns the decode of the seventeen pseudo names from their raw FIODEC byte strings to the text the user types. The DSL surface that those names present to a transcriber is described in `21-input-dsl.md`; the per-handler music semantics live with `pv1`..`pvh` (next section).

This is an annotation of `hc1d.mac` lines **1224-1271**. As elsewhere, core PDP-1 instruction semantics (`lac`/`dac`/`add`/`sub`/`idx`/`sas`/`sad`/`dap`/`jmp i`, the skip group, ones-complement, the `Ns` shift notation) are taken as read from [`../../pdp1m13/docs/02-pdp1-primer.md`](../../pdp1m13/docs/02-pdp1-primer.md); this section explains only what `pc` does *with* them. Recall also the 6-char/uppercase folding rule (see the primer): `dispatch`→`DISPAT`=macro `dispat`, `diswith`→`DISWIT`=macro `diswit`, etc.

## Inputs and scratch cells

`pc` works over four temporaries (defined in the variable block, lines 1532-1534, 1504):

| Cell | Line | Source comment | Role in `pc` |
|---|---|---|---|
| `tht` | 1532 | `/pc: index of pseudo under investigation` | which candidate name we are testing (1-based index into the name-pointer table `pnm`) |
| `zet` | 1533 | `/pc: character position in pseudos` | a *pointer* into the current candidate's FIODEC string (one `pn*` cell) |
| `ucl` | 1534 | `/pc: switch internal to pc` | "the candidate name has ended" flag (the `0` terminator was reached) |
| `chr` | 1504 | `/s1, s2, pc, ri: character read` | the latest input character read from the body buffer |

(The variable block also defines `bgm` at line 1535 with the comment `/pc: another switch`, but `bgm` is never referenced anywhere in the program as written, so `pc` uses only the four cells above.)

Two table-defining constants matter (lines 1598, 1251):

- `pnm` (line 1251) is the **name-pointer table**: 17 words, each entry being the *address* of one FIODEC name string `pn1`..`pnh`.
- `npi=pn1-pnm` (line 1598) is therefore the **count of pseudo names** = the offset from the start of `pnm` to the first string `pn1`. Because `pnm` is exactly 17 words long and `pn1` is the word immediately after it, `npi = 17`. It is used as the loop bound.

## `pc` / `pcr` — set up and advance to the next candidate (lines 1224-1231)

```
pc,	zero tht
pcr,	zero ucl
	step1 tht
	tgrec npi, pcz
	load tht
	lookup pnm-1
	store zet
	call rrc
```

Expanding each line:

- `pc, zero tht` → `dzm tht`. Start the candidate index at 0. `pc` is the entry point.
- `pcr, zero ucl` → `dzm ucl`. `pcr` ("pc retry") is the **top of the candidate loop**: clear the end-of-name flag before each candidate.
- `step1 tht` → `idx tht`. Advance to the next candidate. Because we cleared `tht` to 0 and increment *before* use, the first candidate examined is `tht=1` (the names are numbered `pn1`..`pnh`, 1-based).
- `tgrec npi, pcz` → `sub (npi` ; `sma+sza-skp` ; `jmp pcz`. This is the `tgrec` macro: "jump if AC > literal `npi`". It subtracts the candidate count `npi` (=17) from AC and the combined skip `sma+sza-skp` skips the `jmp` on minus-OR-zero, so the `jmp pcz` is taken only when AC is strictly **greater** than `npi`. In other words: *if we have run past the last name in the table, give up* and jump to `pcz`, the "no pseudo" path.

  > Note: `tgrec` operates on whatever is already in AC. The preceding `idx tht` leaves the incremented value in AC as well as in memory — on the PDP-1, `idx Y` sets `AC := C(Y)+1` (the incremented word loads into the accumulator; see the [primer's memory-reference table](../../pdp1m13/docs/02-pdp1-primer.md)) — so `tht` is the value being range-checked. This is the usual hc1d idiom of letting `idx` double as "increment and load".

  `pcz` (line 665) issues `error flexo nps` — a "no pseudo" diagnostic (`error U` → `lac (U; jda er1`), the FIODEC 3-char code `nps` being assembled by the `flexo` pseudo-op (not emulator-verified) — and then, far from halting, reads the rest of the offending keyword to its terminator (the `pz2`/`pz3` loop at lines 667-671, scanning for a `0` or `21` and saving it in `trm`) before `goto te` resumes normal processing. So overflowing the table is treated as "this keyword is not a recognized pseudo, complain and skip it."

- `load tht` → `lac tht`. Reload the (in-range) candidate index into AC.
- `lookup pnm-1` → `add (pnm-1` ; `dap .+1` ; `lac`. The `lookup` macro is hc1d's indexed load: it forms the address `tht + (pnm-1)`, patches the address field of the very next word (the bare `lac`) with that sum, then executes that `lac`. Since `tht` is 1-based and the table base is `pnm`, the effective address is `pnm-1+tht` = `pnm[tht-1]` — i.e. it fetches the `tht`-th entry of the `pnm` table. The fetched value is the **address of this candidate's FIODEC name string** (one of `pn1`..`pnh`).
- `store zet` → `dac zet`. Save that string pointer in `zet`; `zet` will walk through the candidate's characters.
- `call rrc` → `jda rrc`. `rrc` (line 477) is the routine that rewinds the body re-read pointer: it does `move fl2, fi` (`lac fl2; dac fi`, so `fi := fl2`, the saved last-terminator location) and then `store fl1` (`fl1 := fi`), so that the character scan re-reads the *same* keyword from the start for each candidate. This is what makes the candidate loop able to re-compare the typed keyword against name after name without consuming new tape — every retry rewinds to the keyword's first character.

So one trip through `pc`/`pcr` says: *"pick the next candidate pseudo name, point `zet` at its character string, and rewind the input so we can compare the typed word against it from the top."*

## `pc2` / `pc3` / `pc4` — compare typed characters against the candidate name (lines 1233-1244)

```
pc2,	call rch
	store chr
	trze pc3
	trnl (21, pc4
	zero chr
pc3,	sett ucl, 1
pc4,	load zet
	lookup 0
	trnl chr, pcr
	test1 ucl, pc9
	step1 zet
	goto pc2
```

This is the per-character comparison inner loop. Expanding:

- `pc2, call rch` → `jda rch`. `rch` (line 483) reads the next character of the typed keyword from the body buffer and returns it in AC. (`rch` refills via `rp` (line 344), which uses `cks`/`rrb`/`rpa-i` tape-reader IOTs; those IOTs are not emulator-verified.)
- `store chr` → `dac chr`. Save the typed character.
- `trze pc3` → `sza i` ; `jmp pc3`. `trze` jumps if AC = 0. A read character of 0 means the typed keyword has *ended* (the scanner delimits keywords); so when the input keyword is exhausted, jump to `pc3` to mark end-of-name.
- `trnl (21, pc4` → `sas (21` ; `jmp pc4`. `trnl A,T` jumps if AC ≠ C(A); here against the literal `21` (FIODEC `|`, the measure-bar / vertical-bar separator). So: *if the typed character is **not** the bar `|`, fall through to treat it as a real keyword character* by jumping to `pc4`. The fall-through (character *is* `21`) hits the next line.
- `zero chr` → `dzm chr`. If the character was the bar `21`, normalize it to 0 — i.e. a bar `|` also terminates the keyword, so canonicalize it to the same 0-terminator the names use.
- `pc3, sett ucl, 1` → `lac (1` ; `dac ucl`. Set the "candidate string should be at its terminator" flag. We reach `pc3` either by `trze` (typed char was 0) or by falling through after zeroing a bar. `ucl=1` records "the typed name has ended here; the candidate had better end here too."
- `pc4, load zet` → `lac zet`. Load the candidate string pointer.
- `lookup 0` → `add (0` ; `dap .+1` ; `lac`. Indexed load with base literal `0`: the effective address is just `C(zet)` (adding literal 0), so this `lac` fetches the **candidate's current FIODEC character** that `zet` points at. AC now holds the expected character of the candidate name.
- `trnl chr, pcr` → `sas chr` ; `jmp pcr`. `sas chr` skips when AC = C(chr); so the `jmp pcr` (next candidate) is taken when the candidate's expected character (in AC) ≠ the typed character `chr`. This is the **mismatch → try the next pseudo name** branch. A mismatch at any position abandons this candidate. (When the characters match — including a `0`-terminator matching a `0`-terminator — the `sas` skips the jump and control falls through to the next line.)
- `test1 ucl, pc9` → `lac ucl` ; `sza` ; `jmp pc9`. `test1 Y,Z` loads Y and jumps to Z if Y ≠ 0. So if `ucl` is set — meaning *both* the typed keyword and (since the characters just matched) the candidate name have reached their terminator simultaneously — jump to `pc9`: **full match found**.
- `step1 zet` → `idx zet`. Otherwise the characters matched but we are not at the end; advance `zet` to the candidate's next character.
- `goto pc2` → `jmp pc2`. Loop back to read and compare the next typed character.

The control logic, restated: for each candidate name, compare characters in lock-step. Any character mismatch aborts to the next candidate (`pcr`). A simultaneous terminator on both sides (`ucl` set *and* the terminator characters equal, since the candidate's `0` matched the typed `0`/normalized-bar) is a complete match (`pc9`). Critically, `ucl` is set *before* the final `trnl chr` comparison, so the match at the terminator position is what both confirms equal length and triggers `pc9` — a typed keyword that is a proper prefix of a longer candidate (typed char 0 vs candidate non-zero) fails the `trnl chr, pcr` mismatch and moves on, and a typed keyword longer than the candidate fails when the candidate's 0 meets a non-zero typed char.

## `pc9` — dispatch to the handler (lines 1245-1246)

```
pc9,	load tht
	dispatch pcd-1
```

- `pc9, load tht` → `lac tht`. Reload the matched candidate index (1-based) into AC.
- `dispatch pcd-1` → (`dispatch`→`DISPAT`=`dispat`) `add (pcd-1` ; `dap .+1` ; `jmp i`. The `dispat` macro is the computed-jump: form `tht + (pcd-1)`, patch the address of the next word (the `jmp i`) with it, then `jmp i` indirectly through that table cell. Effective address `pcd-1+tht` = `pcd[tht-1]`, the `tht`-th entry of the handler-pointer table `pcd`. That entry is one of `pv1`..`pvh`; the indirect jump transfers control to the matching handler.

Because `tht` is 1-based and `pcd` is indexed `pcd-1+tht`, candidate `pn{k}` dispatches to `pcd[k-1]` = `pv{k}`. The two tables are kept in exact parallel order, so name index *k* selects both the *k*-th name string `pn{k}` and the *k*-th handler `pv{k}`.

## The dispatch table `pcd` (lines 1248-1250) and name table `pnm` (lines 1251-1253)

```
pcd,	pv1	pv2	pv3	pv4	pv5	pv6
	pv7	pv8	pv9	pva	pvb	pvc
	pvd	pve	pvf	pvg	pvh
pnm,	pn1	pn2	pn3	pn4	pn5	pn6
	pn7	pn8	pn9	pna	pnb	pnc
	pnd	pne	pnf	png	pnh
```

`pcd` is 17 words, each the address of a handler routine; `pnm` is 17 words, each the address of a FIODEC name string. They are positionally aligned: `pnm[i]` is the name that selects `pcd[i]`.

## The name strings `pn1`..`pnh` (lines 1255-1271) — FIODEC decode

Each `pn*` block is a run of lower-case FIODEC character codes terminated by `0` (see the FIODEC table in the appendix; codes used here: `22`=s, `43`=l, `65`=e, `45`=n, `64`=d, `62`=b, `61`=a, `23`=t, `51`=r, `46`=o, `24`=u, `71`=? (evidently `i` — *inferred*, see below), `42`=k, `30`=y, `63`=c, `47`=p, `26`=w, `70`=h, `50`=q, `44`=m). Decoding each:

| Name ptr | Source bytes (line) | Decoded text | → handler | Handler line | Meaning (per handler) |
|---|---|---|---|---|---|
| `pn1` | `22 0` (1255) | **s** | `pv1` | 1275 | dynamics/articulation: `sett ss,200000` (sets an sle-status bit) |
| `pn2` | `43 0` (1256) | **l** | `pv2` | 1277 | `sett ss,400000` |
| `pn3` | `65 0` (1257) | **e** | `pv3` | 1279 | `zero ss` (clear sle status) |
| `pn4` | `65 45 64 0` (1258) | **end** | `pv4` | 1309 | end of piece/tape (`call sbc`, punch note/bar tables) |
| `pn5` | `62 61 22 22 0` (1259) | **bass** | `pv5` | 1286 | `sett st,12` (staff = bass clef) |
| `pn6` | `23 51 65 62 43 65 0` (1260) | **treble** | `pv6` | 1288 | `sett st,26` (staff = treble clef) |
| `pn7` | `23 65 45 46 51 0` (1261) | **tenor** | `pv7` | 1290 | `sett st,16` (staff = tenor) |
| `pn8` | `61 43 23 46 0` (1262) | **alto** | `pv8` | 1292 | `sett st,20` (staff = alto) |
| `pn9` | `24 45 71 23 22 0` (1263) | **units** | `pv9` | 1295 | `sett ao,1` (units pseudo, takes one argument) |
| `pna` | `42 65 30 0` (1264) | **key** | `pva` | 1353 | key signature (begins `call rch`) |
| `pnb` | `51 65 22 23 0` (1265) | **rest** | `pvb` | 1401 | rest (`sett ao,1`) |
| `pnc` | `63 46 47 30 0` (1266) | **copy** | `pvc` | 1444 | copy a span (`sett ao,2`, two arguments) |
| `pnd` | `24 47 0` (1267) | **up** | `pvd` | 1427 | transpose up (`sett ao,1`) |
| `pne` | `64 46 26 45 0` (1268) | **down** | `pve` | 1434 | transpose down (`sett ao,1`) |
| `pnf` | `70 0` (1269) | **h** | `pvf` | 1281 | articulation: `sett ss,40000` |
| `png` | `50 0` (1270) | **q** | `pvg` | 1283 | articulation: `sett ss,20000` |
| `pnh` | `23 65 44 47 46 0` (1271) | **tempo** | `pvh` | 1344 | tempo (`sett ao,1`) |

Notes and inferences:

- The bytes spell each word in lower-case FIODEC, `0`-terminated; the terminator is exactly the `0` that `pc2` matches against the typed keyword's 0/`21` terminator.
- In `units` (`pn9`) the third byte is `71`, which the FIODEC notes mark as "?". In context the word is unmistakably *units*, so `71` is **inferred to be the lower-case letter `i`**. `71` is not independently confirmed by an in-source comment, so treat this as inferred.
- The handler music semantics in the right-hand column are summarized from the `pv*` handler heads (their `/comment` tags at lines 1275-1444) and are detailed in the next section; the precise musical effect of each — the meaning of the `ss` bits, the `st` staff values, the "clef" labels — is partly **inferred** and not emulator-verified.
- The `ao` ("arguments outstanding", line 1500) seed values — `pv9`/`pvb`/`pvd`/`pve`/`pvh` set `ao,1`; `pvc` sets `ao,2` — tell the post-pseudo argument scanner how many numeric arguments to expect after the keyword. The articulation/clef/dynamics handlers (`pv1`-`pv3`, `pv5`-`pv8`, `pvf`, `pvg`) take no arguments and jump straight to `psr` (line 1306), which clears `ao`. (`pv4`/`end` neither sets `ao` nor uses `psr`; it does its own punch-and-exit at lines 1309-1341.)

## What this accomplishes

`pc` turns a typed pseudo-command keyword into a jump to the right handler. It walks the candidate names `pn1`..`pnh` one at a time (`pcr`, indexed by `tht`), rewinds the input for each candidate (`call rrc`), and compares characters in lock-step (`pc2`), using `ucl` to detect that both the typed word and the candidate name terminate together. On a full match it computed-jumps through the parallel handler table (`dispatch pcd-1` at `pc9`) into `pv1`..`pvh`; on running off the end of the name table it reports the "no pseudo" error at `pcz`, skips the offending keyword, and resumes at `te`. The decode table above — `s l e end bass treble tenor alto units key rest copy up down h q tempo` — is the canonical mapping from the FIODEC name strings to the keywords the transcriber types, and is the authority behind the user-facing DSL description in `21-input-dsl.md`.

Forward pointer: the next section documents the pseudo handlers themselves — `ps`/`psr` and `pv1`..`pvh` (lines 1273-1480) — where each matched keyword does its work (set sle/articulation status `ss`, set staff/clef `st`, gather arguments via `ao`, and emit key/tempo/copy/transpose effects).
