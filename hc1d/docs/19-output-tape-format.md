# The "end" pseudo and the output tape format (`pv4`, `ppp`)

This is where the Harmony Compiler's first phase finally *writes its product*. Every other routine in `hc1d` has been filling two in-core arrays — the **note-word array** `not` (`not = fl+1`, growing upward) and the **bar-pointer array** `bar` (`bar = 7750`, growing downward) — plus the two counters `nl` (next free slot in `not`) and `bc` (bar count). The `end` pseudo-command, handled at `pv4`, takes those arrays and **punches them onto paper tape** in exactly the envelope that *PDP-1 Music 13* later reads back. This file annotates `pv4` and the punch primitives `ppp` (binary word punch) and `fee`/`feed` (blank-tape feed), then verifies the on-tape format against the consumer side documented in [`../../pdp1m13/docs/05-data-formats.md`](../../pdp1m13/docs/05-data-formats.md).

> **Authoritative format spec.** The on-tape "intermediate" format that `pv4` produces is independently specified by Peter Samson in [*music_intermediate_format.pdf*](../prs-docs/music_intermediate_format.pdf): an Intermediate Tape is **1 to 4 Parts separated by blank tape**, each Part being a **Notes section, 5 blank frames, then a Bars section**, where each section is a **word count, the words, and a `1's-complement-sum` checksum**. Note words are an Encoded note, a **Bar mark = `600000`** octal, or a **Tempo word = `700000` + value**; Bar words are offsets from `not`. The annotations below confirm `pv4`/`ppp` against this spec and cite it inline.

Read this after the pdp1m13 docs; core PDP-1 instruction semantics (`lac`/`dac`/`add`/`sub`/`idx`/`sad`/`sas`/`ril`/`rcl`, ones-complement) are in [`../../pdp1m13/docs/02-pdp1-primer.md`](../../pdp1m13/docs/02-pdp1-primer.md) and are not re-taught here.

> The PDP-1 paper-tape I/O IOTs `ppa`, `ppb`, and `lat` drive the high-speed punch and the front-panel test word. `lat` (Load Accumulator from Test word, `AC := AC OR testword`) *is* emulator-implemented; `ppa`/`ppb` are **not** in the TS emulator, so the bit-level punch behavior below is documented from standard PDP-1 I/O knowledge and is marked **(not emulator-verified)**.

## `pv4` — the `end` handler (lines 1309–1341)

`end` is dispatched (via `pcd`) like every pseudo-command; its handler `pv4` is entered with the note/bar arrays already built. It runs straight through with no inner branching except the two punch loops, then jumps back to the top-level read loop `u` (line 406).

### Close the final bar, then write the leader (1309–1313)

```
pv4,	call sbc	/end
	putback bar, (600000
	feed 400
	step1 nl
	call ppp	/no. of notes
```

`call sbc` expands to `jda sbc` — jump-and-deposit-AC: it stores AC into cell `sbc` and runs the routine at `sbc+1`. `sbc` ("start bar count", lines 456–463) is the per-bar housekeeping routine used throughout phase 1; here it is invoked one last time to close out the final measure. Expanding its `answer`/`exit` body:

```
sbc,	answer sbx	/ -> 0 / dap sbx / lac .-2
	step1 tbc	/ idx tbc   (tape bar count++)
	step1 bc	/ idx bc    (bar count++)
	addi nl		/ add nl    (AC := arg + nl)
	tgrec all, s3x	/ sub (all; sma+sza-skp; jmp s3x  -> overflow check
	load bc		/ lac bc
	complement	/ cma
sbx,	exit sbc	/ jmp (patched return); AC = ~bc = -bc
```

`step1 tbc`/`step1 bc` (`idx`) bump the two bar counters. The `tgrec all, s3x` test (subtract literal `all`, jump if AC strictly greater than the array capacity `all = bar-not-1`) is the **table-overflow guard**: if the notes and bars have collided in core it jumps to `s3x` (line 654), which types `Table overflow.  Subdivide source program.` on the Flexowriter. On the normal path `sbc` returns AC = `~bc` = the **negated bar count** in ones-complement (`cma` is bitwise NOT, so `~bc = -bc`).

That return value is **not** discarded: it is exactly the index `pv4`'s very next line uses. `putback bar, (600000` expands (per the `putback U,Q` macro, lines 269–274) to:

```
add (bar	/ AC := AC + (literal address `bar`)    -- AC came in as ~bc = -bc
dap .+2		/ patch the address of the `dac` two words below
lac (600000	/ AC := the literal 600000
dac		/ dac (bar + (-bc))  -- store 600000 into the indexed bar cell
```

i.e. an **indexed store**: it writes the word `600000` into the `bar` array at offset `~bc` (= `-bc`) from the base. Because `bar` grows *downward* from `bar = 7750`, indexing by the negated bar count walks *down* into the descending bar list and lands on the just-closed final bar slot. The whole `call sbc` is therefore load-bearing both ways: it advances `bc`/`tbc` and runs the overflow check, **and** it hands `pv4` the `~bc` index that `putback` consumes. `600000` is the **end-of-voice / final-bar marker** — the same constant the consumer recognizes as the bar-line word (see [`05-data-formats.md` §2](../../pdp1m13/docs/05-data-formats.md), `(600000)` at `2260`). Stamping it into the last bar slot terminates the bar list with the agreed sentinel.

`feed 400` expands (macro lines 155–158) to `law i 400; jda fee` — load AC with `-400` (`law i` loads the ones-complement of the literal) and call the feed routine. `fee` (lines 377–387) punches blank tape lines:

```
fee,	0		/ arg cell (the -400 from jda)
	dap fex		/ patch the exit jmp
	cli		/ clear IO (IO := 0)
	lat; and (700; sad (700; jmp fex   / front-panel guard
	ppa		/ punch one alphanumeric line (IO = 0 -> a blank line)  (not emulator-verified)
	isp fee		/ increment the (negative) count; skip when it reaches 0
	jmp .-2		/ loop back to ppa
fex,	jmp		/ patched return
```

So `feed 400` punches **`400` (octal) blank lines of leader** ahead of the data — physical tape leader so the consumer's reader has something to grab and so the operator can tear the tape. The `lat; and (700; sad (700; jmp fex` line is a front-panel guard: `lat` ORs the test word into AC, `and (700` masks the low octet's top three bits, and `sad (700` skips the following `jmp fex` only when those bits are **not** all set (`sad` skips on *inequality*; see the macro note below). So when test-word bits `700` are all set the `jmp fex` is taken and `fee` bails out — letting the operator abort a long feed from the front panel. **(The `lat`/`ppa` punch sense here is not emulator-verified; `lat` itself is implemented, but the `ppa` punch and the operator-abort interpretation are inferred from standard PDP-1 I/O.)**

> **`sad`/`sas` sense (verified against `src/pdp1/cpu.ts`).** `sad A` skips the next instruction iff `AC ≠ C(A)`; `sas A` skips iff `AC = C(A)`. This is why `sad (700; jmp fex` falls through to `jmp fex` precisely when `AC = 700`, and why the macro `trnl A,T` = `sas A; jmp T` means "jump to T iff `AC ≠ C(A)`."

`step1 nl` is `idx nl`. `nl` (line 1521) is the *note location in `not`*; after `idx` it is punched by the immediately following `call ppp` as the first data word of the notes section — the **count word** the consumer reads as a positive `N` (the exact off-by-one that makes the punched value equal the note count is governed by how `nl` is maintained during scanning; here we take it as the section count, matching the consumer's positive-count read).

### The note section: count, N note words + checksum (1313–1325)

```
	call ppp	/no. of notes        (already: nl)
	zero t2
	zero t3
p41,	load t3
	lookup not
	store t1
	call ppp	/note entry
	step t2, t1
	step1 t3
	trnl nl, p41
	load t2
	call ppp	/+checksum
	feed 6
```

`zero t2`/`zero t3` (`dzm`) clear the running checksum accumulator `t2` and the loop index `t3`. The loop `p41`:

- `load t3` → `lac t3`: AC = current index.
- `lookup not` expands (macro lines 149–153) to `add (not; dap .+1; lac` — an **indexed load**: AC := `not[t3]` (the note word). It adds the literal base address `not` to the index, patches the very next `lac` with that composed address, and `lac`s it.
- `store t1` → `dac t1`: stash the note word.
- `call ppp` punches it (the actual 18-bit note word) to tape.
- `step t2, t1` expands (macro lines 160–164) to `lac t2; add t1; dac t2` — **accumulate the checksum**: `t2 += note word` (ones-complement `add`, end-around carry).
- `step1 t3` → `idx t3`: advance the index. On the PDP-1 `idx` writes the incremented value back to `t3` **and leaves it in AC** (verified in `src/pdp1/cpu.ts`: `idx` sets `AC := C(ma)+1`, then stores). So after this instruction AC holds the *new* `t3`.
- `trnl nl, p41` expands to `sas nl; jmp p41` — "jump (loop) iff AC ≠ C(nl)." Since AC = `t3` (the just-incremented index), the loop runs as a clean count: it punches `not[0..nl-1]` and exits when `t3` reaches `nl`.

After the loop, `load t2; call ppp` punches the **checksum** `t2` as the trailing word of the section. `feed 6` punches 6 blank lines as an **inter-section gap** between the notes section and the bars section.

> **Producer vs. spec — a one-frame discrepancy (documented, not an error).** Peter Samson's format spec states "Part = Notes section, **5 blank frames of tape**, Bars section" ([*music_intermediate_format.pdf*](../prs-docs/music_intermediate_format.pdf)). The code as written punches `feed 6` = **6** blank frames here. The gap is inert (the consumer's reader, `rd1`/`rd3` via `rpb`, skips blank tape lines and only consumes the count/data/checksum words), so the exact count is not load-bearing and the one-frame difference is harmless. The spec is a 2006 prose description; `hc1d.mac` (dated 5/21/63, retyped 2006) is what actually runs — where they differ, the code is authoritative for *behavior* and the spec for *intent*. Treat "≈5–6 blank frames between the notes and bars sections" as the reconciled statement.

> Cross-check with the consumer: [`05-data-formats.md` §1](../../pdp1m13/docs/05-data-formats.md) describes each section's envelope as **count word → N data words → checksum word**, where the checksum is the arithmetic (`add`) sum of the N data words. That is exactly what `p41` produces: `ppp(nl)`, then `ppp(not[i])` for each `i` while summing into `t2`, then `ppp(t2)`. The producer's checksum (`step t2,t1` = ones-complement `add`) matches the consumer's `lac i ib; add sum; dac sum` accumulation and its `sas ct` verification.

### The bar section: count, N bar words (reversed) + checksum (1326–1340)

```
	step1 bc
	call ppp	/no. of bars
	zero t2
	zero t3
p42,	load t3
	complement
	lookup bar
	store t1
	call ppp	/bar entry
	step t2, t1
	step1 t3
	trnl bc, p42
	load t2
	call ppp	/+checksum
	feed 300
	goto u
```

`step1 bc` (`idx bc`) advances the bar count, then `call ppp` punches it as the bars-section count word.

The bars loop `p42` mirrors `p41` but reads the `bar` array **in reverse**, because `bar` grows *downward* from its base (`bar = 7750`):

- `load t3; complement` → `lac t3; cma`: AC = `~t3` = `-t3` (ones-complement negate). The index is negated so that `lookup bar` reads `bar[-t3]`, i.e. it walks *down* from the base into the descending bar list. This converts the in-core descending storage order into the *ascending* tape order the consumer expects.
- `lookup bar` → indexed load `AC := bar[-t3]` (`add (bar; dap .+1; lac`).
- `store t1; call ppp` punches the bar-pointer word.
- `step t2, t1` accumulates the checksum into `t2` (same as the notes loop).
- `step1 t3` (`idx`, AC := new `t3`); `trnl bc, p42` (`sas bc; jmp p42`) loops while `t3 ≠ bc`, exhausting the bar count.
- `load t2; call ppp` punches the bars-section **checksum**.

`feed 300` punches `300` (octal) blank lines of **trailer** so the tape ends cleanly, then `goto u` (`jmp u`) returns to the top-level command reader to await the next source program. The final-bar `600000` marker stamped earlier (1310) is one of the words this loop punches, so it rides out as the agreed end-of-voice sentinel in the bar stream.

## `ppp` — the three-line binary word punch (lines 389–401)

```
ppp,	0
	dap pup
	lio ppp
	lat; and (700; sad (700; jmp pup
	ppb
	ril 6s
	ppb
	ril 6s
	ppb
pup,	jmp
```

`ppp` is the workhorse `pv4` calls for every data, count, and checksum word. It is an `answer`-style routine but written longhand: the leading `0` is the argument cell where `call ppp` (= `jda ppp`) deposited AC, `dap pup` patches the exit `jmp`, and `lio ppp` loads that deposited 18-bit word into IO.

The `lat; and (700; sad (700; jmp pup` line is the same front-panel guard `fee` uses: read the test word into AC, mask the low octet's top three bits, and fall through to `jmp pup` (skipping the punch and returning) only when those bits are exactly `700` — i.e. the operator can abort the punch from the front panel. **(not emulator-verified.)**

The three `ppb` calls with `ril 6s` between them are the heart of it. `ppb` = **Punch Paper-tape Binary**: punch one tape line from the low 6 bits of IO (in binary/"hole-for-hole" mode). `ril 6s` rotates **IO** (not the combined AC:IO) left by 6 places, bringing the next field of the 18-bit word down into the low 6 bits. So:

| Step | Action | Punches (low 6 bits of IO) |
|---|---|---|
| 1 | `ppb` | the initial low 6 bits of the word → line 1 |
| 2 | `ril 6s` then `ppb` | next field rotated into the low 6 bits → line 2 |
| 3 | `ril 6s` then `ppb` | next field rotated into the low 6 bits → line 3 |

Three 6-bit lines = one 18-bit word on tape. **(The `ppb` bit-level mechanics and the exact line ordering are not emulator-verified; semantics are from standard PDP-1 punch behavior.)** Whatever line/rotate convention `ppp` uses, it is the exact inverse of the consumer's `rpb` (Read Paper-tape Binary), which the player uses to reassemble an 18-bit word from three tape lines — see [`05-data-formats.md` §1](../../pdp1m13/docs/05-data-formats.md), `rpb = 730002`. `ppp` is `rpb`'s producer counterpart.

## Cross-program agreement check (the most important verification in the set)

This is the seam between phase 1 (`hc1d`, producer) and *Music 13* (consumer). The producer's punch in `pv4` must lay down bytes that the consumer's `rdg`/`rd1`/`rd3` read back. Comparing `pv4`/`ppp` here against [`../../pdp1m13/docs/05-data-formats.md` §1](../../pdp1m13/docs/05-data-formats.md):

| Format element | Producer (`hc1d` `pv4`) | Consumer (Music 13) | Agree? |
|---|---|---|---|
| **Per-section envelope** | `ppp(count)` → N × `ppp(data)` → `ppp(checksum)` | `rdg` reads count word; `rd1`/`rd3` read N data words then 1 checksum word | **Yes** |
| **Count sign** | punched **positive** (`step1 nl`/`step1 bc` then `ppp`) | `rdg` reads count, then `cma` → **negates** into `-ct` for `isp` loop counting | **Yes** — producer positive, consumer negates on read, exactly as the consumer doc states ("the count word is read positive and immediately negated into `ct`") |
| **Checksum** | running `step t2,t1` = ones-complement `add` of the N data words; punched after the data | `lac i ib; add sum; dac sum` over the N data words; verified by `sas ct` against the trailing word | **Yes** — same arithmetic `add` accumulation, same position (trailing word) |
| **Word coding** | `ppp` = 3 × `ppb` of 6 bits each (with `ril 6s`) | `rpb` = reassemble 18 bits from 3 tape lines | **Yes** — `ppp` is the inverse of `rpb` |
| **Bar-line / end-of-voice marker** | `putback bar, (600000` stamps `600000` into the final bar slot (index `~bc`), which `p42` then punches | `(600000)` recognized as the bar-line note word / end-of-voice bar pointer | **Yes** — same constant |
| **Leader / trailer** | `feed 400` leader before data; `feed 6` inter-section gap; `feed 300` trailer | reader skips blank leader; gaps are inert blank lines | **Yes** — blank-line padding, no semantic content |
| **Section order on tape** | notes section first (count, words, checksum), then bars section | `rdp`/`rd1` reads the notes section, `rdm`/`rd3` reads the bars section | **Yes** |

**One subtlety worth flagging (not a discrepancy):** the bar *pointers* punched by `p42` are produced in core as a **descending** list (the `bar` array grows down from `7750`), which `pv4` reverses via `load t3; complement; lookup bar` so they land on tape in ascending order. On the consuming side, `rdm`/`rd3` rebiases each *non-negative* bar pointer by `off` (the voice's note base) and leaves negative pointers unbiased ([`05-data-formats.md` §1](../../pdp1m13/docs/05-data-formats.md)). `hc1d` evidently stores bar pointers as offsets relative to the note list, consistent with that "relative offset, relocated on read" contract — though the exact negative-pointer semantics are only certain on the consumer side, so the producer's intent there is **inferred**.

**Verdict: the producer and consumer formats agree, and both match Samson's spec.** `pv4`/`ppp` emit, per section, a positive count word, N data words, and an arithmetic-`add` (= ones-complement-sum) checksum word, three 6-bit lines per word, with `600000` as the final-bar marker and blank-line leader/gap/trailer — precisely the envelope [`../../pdp1m13/docs/05-data-formats.md` §1](../../pdp1m13/docs/05-data-formats.md) documents Music 13 as consuming, and precisely the "Notes section / blank frames / Bars section, each = count + words + 1's-complement-sum checksum" structure of [*music_intermediate_format.pdf*](../prs-docs/music_intermediate_format.pdf). The only difference found is cosmetic and non-semantic: the code's inter-section gap is `feed 6` (6 blank frames) where the spec says 5 (see above).

## What this accomplishes

`pv4` is the *commit* step of Harmony Compiler phase 1: it closes the final bar (`sbc` + the `600000` marker stamped via `putback` at the `~bc` index `sbc` returned), then serializes the two in-core arrays to paper tape as two checksummed, length-prefixed sections — notes then bars — using `ppp` to punch each 18-bit word as three binary lines and `fee`/`feed` to lay down leader, an inter-section gap, and trailer. The byte stream it produces is exactly the intermediate music-tape format that *PDP-1 Music 13* reads back with `rdg`/`rd1`/`rd3`/`rpb` and replays, confirming the cross-program contract.

Next: the remaining `pv*` pseudo-command handlers (`pvh` tempo at line 1344, `pva`/`key` at line 1353, and the note/embellishment scanners) that *fill* the `not` and `bar` arrays this routine punches.
