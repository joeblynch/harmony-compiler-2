# I/O primitives (`wr`, `rpr`, `rp`, `fee`, `ppp`)

This is the tape-and-typewriter I/O package: the five low-level routines that every other part of hc1d goes through to talk to the Flexowriter (type a diagnostic), the paper-tape reader (read one source character), and the paper-tape punch (emit the intermediate note/bar tape that *PDP-1 Music 13* will later play). They live together in `hc1d.mac` lines **327-401** under the header comment

```
/wr, rp, fee, ppp, rpr
```

Everything here is `call`/`answer`-convention plumbing (see the [primer's macro layer]) wrapped around the PDP-1 I/O IOTs. Two cautions for the whole section:

- The TS emulator **does not implement** the I/O IOTs `tyo`, `rrb`, `rpa`, `cks`, `ppa`, `ppb`. Their semantics here come from standard PDP-1 / Flexowriter knowledge, so **every concrete bit-level claim about them is "(not emulator-verified)" and inferred**. The shift/skip/operate/data-movement instructions these routines also use (`ril`, `spi`, `rcr`, `rcl`, `cli`, `lio`, `dio`, `sma`, `spa`, `sza`, `cla`, `dap`, `dac`, `sad`, `sas`, `and`, `add`, `idx`, `isp`, `jmp`, `jda`, `law`, `lac`, `hlt`, `lat`) **are** emulator-implemented and behave exactly as in [`../../pdp1m13/docs/02-pdp1-primer.md`](../../pdp1m13/docs/02-pdp1-primer.md).
- The tape these routines punch is consumed by Music 13 exactly as described in [`../../pdp1m13/docs/05-data-formats.md`](../../pdp1m13/docs/05-data-formats.md): each section is a **count word, then N data words, then an arithmetic-`add`-sum checksum**, every word laid down as three binary tape lines (`ppb` on this side, `rpb` on the reading side), with blank leader between segments. `ppp` is the per-word producer; `fee` is the leader/blank producer.

Reminder of the calling convention (from the primer): a routine `foo,` opens with `answer foox`, which expands to `0 / dap foox / lac .-2`. Crucially, `jda foo` (what `call`/`write`/`feed` expand into) **deposits the caller's AC — the argument — into the leading `0` cell, and then loads AC with the return-address word** (the saved PC). So inside the routine: the leading `0` holds the argument; `dap foox` patches the routine's exit `jmp` (at label `foox`) with that **return address** (taken from the freshly-loaded AC, not from the argument); and `lac .-2` reloads the argument from the `0` cell back into AC. The routine ends `foox, exit foo` — a bare `jmp` whose address was just patched. Here the routines are spelled out longhand rather than via the `answer` macro, but the shape is identical: leading `0`, then `dap <exit-label>`, ... , `<exit-label>, jmp`.

## `wr` — type a multi-word FIODEC string (lines 329-336)

```
wr,	0
	dap wre
wr1,	print i wre
	idx wre
	sas wr
	jmp wr1
wrx,	jmp i wre
wre,	0
```

`wr` is reached by the `write P` macro (`law P / jda wr`). The text being typed is laid down by a `text /.../` pseudo-op placed **immediately after** the `write` call, and the label `P` names the word **just past the end** of that text (e.g. at line 572 `write erq`, then a `text` block on 573-576, then `erq,` on line 577). So on entry:

- `wr, 0` — the `jda` deposited the caller's AC (`= P`, the post-text sentinel address) here. Cell `wr` therefore holds **`P` = one past the last string word**, and is used as the loop's end sentinel.
- After the `jda`, AC no longer holds `P`; it holds the **return-address word** (the address of the word immediately following `jda wr` in the caller — which is the **first** word of the `text` block).

- `dap wre` — patch the address field of `wre` with that return address. Because `jda` left the *return address* in AC (not the argument), this initializes `wre` to point at the **first** string word. `wre` is both the running string pointer and (re-used) the exit target; `dap` patches only its low 12 address bits, leaving its top bits intact.
- `wr1, print i wre` — `print F` expands to `lac F / rcl 6s / tyo / rcl 6s / tyo / rcl 6s / tyo`. With `i` (indirect) the `lac` becomes `lac i wre`: fetch the word *pointed to by* `wre`, then type its three packed 6-bit FIODEC characters. `rcl 6s` rotates the combined AC:IO left 6 places (the `Ns` shift count is the popcount of the operand; `6s = 6`), bringing the next character into the low 6 bits of IO; `tyo` types the low Flexowriter character of IO **(not emulator-verified)**. Three `rcl 6s`/`tyo` pairs emit all three characters of the 18-bit word.
- `idx wre` — increment the pointer to the next string word (AC := incremented `wre`).
- `sas wr` — Skip if AC **=** C(`wr`). (`sas` skips on *same*; cpu.ts: skip when `AC === C(Y)`.) After `idx`, AC holds the just-incremented pointer; `wr` holds the sentinel `P`. So this skips the following `jmp wr1` once the pointer has walked up to the sentinel.
- `jmp wr1` — executed while the pointer has **not** yet reached the sentinel (AC ≠ C(`wr`)): loop and print the next word.
- `wrx, jmp i wre` — exit, reached when `sas` **did** skip, i.e. when the running pointer equals the sentinel `P`. This is the patched-jump return idiom; control resumes in the caller past the printed text.
- `wre, 0` — the self-modified string pointer / exit cell.

The intent: walk `wre` forward from the first string word, `print`ing 3 chars per word, until the pointer reaches the post-text sentinel held in cell `wr`, then return. Because `dap` only patches the low 12 address bits, the opcode of `wre` is preserved across each self-modification. `tyo` and the FIODEC packing are **(not emulator-verified)**; the loop control (`idx`/`sas`/`jmp`) is standard and emulator-faithful.

> The exact off-by-one of the string-end test, and the precise resolution of the indirect exit `jmp i wre`, depend on the word layout the original `text` pseudo-op produced. The modern macro/macro1 re-assembly does **not** implement `text` (it emits "undefined"/"illegal char" diagnostics and lays down the wrong word count there), so the surrounding octal addresses drift and these details are **inferred from the loop structure, not verifiable from the re-assembly**.

This is the workhorse behind every multi-character Flexowriter diagnostic; single characters go through the `type Q` macro (`lio Q / tyo`) directly.

## `rpr` — raw single read, no flag wait (lines 338-342)

```
rpr,	0
	rrb
	rpa-i
	dap .+1
	jmp
```

`rpr` ("read paper-tape, raw") is the bare reader primitive. It is `call`-ed exactly once, at `ap` (line 408, `call rpr`), to prime the reader at the very start of a run.

- `rpr, 0` — the deposited-argument / saved-AC cell (no argument is meaningfully used).
- `rrb` — Read Reader Buffer: copy the paper-tape reader buffer into IO **(not emulator-verified)**.
- `rpa-i` — Read Paper-tape Alphanumeric, indirect/clear variant (`rpa-i` = `rpa` with the `i`/clear bit subtracted-in by the assembler). This **initiates** the next 6-bit alphanumeric line read from the reader **(not emulator-verified)**. The combination `rrb` then `rpa-i` is the classic "grab what's there, start the next read" idiom — it leaves the reader spinning so the *next* read has data waiting.
- `dap .+1` — patch the address field of the **next** word (the bare `jmp`) with the return address that `jda` left in AC, turning that `jmp` into the return.
- `jmp` — return (address just patched).

So `rpr` does **no** reader-flag wait and **no** parity/code filtering — it just kicks the reader and returns. It exists to get the very first character into the buffer before the main read loop (`rp`) starts checking the device flag; `rp` always assumes a read is already in flight.

## `rp` — read one *valid* source character, with flag-wait, parity check, and code filtering (lines 344-375)

This is the careful one. `rp` is the routine the scanner calls for every source character (`pg, call rp /read title`, line 415; `rcy, call rp /read body`, line 493; `rcu, call rp /read comment`, line 498). It must (1) wait for the reader to actually have a character, (2) reject bad parity, and (3) discard FIODEC codes that carry no musical meaning, looping until it has one good character to return.

```
rp,	0
	dap rtx
rt2,	cks
	ril 1s
	spi i
	jmp rt2
	rrb
	rpa-i
	dio t1
	rcr 7s
	spa
	jmp rt2
	law 1000
	add t1
	dap .+2
	law 2525
	670000	/rar
	sma
	jmp rtb
	law 77
	and t1
	sad (77
	cla
	sad (36
	cla
	sad (13
	jmp rt2
rtx,	jmp
rtb,	lac t1
	sza
	hlt
	jmp rt2
```

**Prologue (344-345).** `rp, 0` is the deposited-AC cell; `dap rtx` patches the exit `jmp` at `rtx` with the return address. (No argument is used — `rp` is a pure reader, returning the character in AC.)

**Reader-flag wait — `rt2` (346-349).**
- `cks` — Check Status: read the I/O device status flags into IO **(not emulator-verified)**. The reader-done flag lands in a known bit of IO.
- `ril 1s` — rotate IO left 1 (popcount of `1s` = 1), moving the reader-flag bit up toward the sign position of IO. (`ril` rotates IO alone — cpu.ts case `0o2000` under opcode `0o66`.)
- `spi i` — Skip on Positive IO, with the `i` (invert) bit. Bare `spi` skips when IO ≥ 0; the `i` bit reverses the sense, so `spi i` skips when IO **< 0** (sign bit set), i.e. when the rotated reader-flag bit is set. Emulator-implemented: cpu.ts tests `y & 0o2000` plus the IO sign bit for `spi`, and inverts the skip when the indirect bit is set.
- `jmp rt2` — if the reader is **not** ready (skip did not fire), loop back and re-check. This is a busy-wait spin on the reader flag.

When the flag is set, control falls through to the read.

**Read + parity check (350-355).**
- `rrb` — Read Reader Buffer into IO **(not emulator-verified)**: the freshly-read line (with its parity/check bits) is now in IO.
- `rpa-i` — immediately re-strobe the reader for the *next* line (keep it spinning) **(not emulator-verified)**.
- `dio t1` — store IO into temp `t1`. `t1` now holds the raw read, including the parity bit; it is the working cell for the rest of the routine.
- `rcr 7s` — rotate the combined AC:IO **right** 7 (popcount of `7s` = 7). This pulls the high/parity bit of the freshly read character across the AC:IO boundary so it lands in the **sign bit of AC**. *(Which exact bit becomes the parity bit is inferred from the rotate distance: the FIODEC line as delivered by `rrb` is treated as wider than 6 bits, with a parity/check bit above the 6 data bits, so a 7-place combined rotate parks it in AC's sign — inferred, and not emulator-verified because `rrb` is not emulated.)*
- `spa` — Skip on Positive AC: skip if the sign bit is clear (parity bit = 0 = "good" in this convention).
- `jmp rt2` — if parity was bad (sign set, `spa` did not skip), **discard** the character and go wait for the next one. So a parity failure is silently re-read, not reported.

**Code filtering — the hand-assembled `rar` table test (356-362).** Having a parity-good character, `rp` must drop FIODEC codes that mean nothing to the music scanner. It does this with a bit-test rather than a branch ladder:

- `law 1000 / add t1` — form `1000 + (raw character)`. `law` loads the literal `1000` into AC; `add` adds the raw read in `t1`. This biases the character code by `1000` octal.
- `dap .+2` — patch the address field of the word **two ahead** (the `670000`/`rar` instruction) with `1000 + char`. Because `dap` writes only the low 12 bits, the resulting word is `670000` with address bits = `1000 + char` — i.e. a `rar` (rotate AC right) whose **operand encodes the shift count as `1000 + char`**.
- `law 2525` — load the literal mask `2525` into AC. In binary `2525` octal = `010 101 010 101`, an alternating bit pattern.
- `670000 /rar` — a **hand-assembled `rar`** (Rotate AC Right). The bare `670000` is `rar` with whatever operand the previous `dap .+2` just patched into its low 12 bits; the assembler's normal `rar` mnemonic for one place is `671000` (note `670000 | 1000`, popcount `1`). The shift distance is the popcount of the patched operand `1000 + char`, so `2525` is rotated right by a number of places that depends on the character code. The effect is a **table-free membership test**: only certain characters rotate a set bit of the `2525` pattern into the sign position. *(The precise set of codes this admits is determined by which shift distances land a set bit of `2525` in the AC sign — that is the inferred mechanism; it is a compact substitute for an explicit accept/reject bitmap. `rar` itself **is** emulator-implemented as a rotate op; the exact accept-set cannot be bit-verified here because the input bits come from the un-emulated `rrb`.)*
- `sma` — Skip on Minus AC: skip if the rotated result is **negative** (sign bit set = "this code is accepted").
- `jmp rtb` — if the sign was **not** set (`sma` did not skip ⇒ code not in the accept pattern), branch to `rtb` (the rejected-code tail below).

**Three explicit terminator codes — `77 / 36 / 13` (363-370).** For characters that passed the `2525` test, `rp` still special-cases three FIODEC codes:
- `law 77 / and t1` — mask the raw character to its low 6 bits (`77` octal), stripping any residual case/parity bits, giving the clean 6-bit FIODEC code in AC.
- `sad (77 / cla` — `sad` skips if AC **≠** the literal `77` (cpu.ts: skip when `AC !== C(Y)`). So if the code **equals** `77` (the FIODEC delete/all-ones code, used as a mask elsewhere — see `type (77` at line 453 and the `tlesc 77,...` literal at line 975), the skip does *not* fire and the `cla` runs, clearing AC. `(77` is a constant-pool literal reference.
- `sad (36 / cla` — likewise for code `36`: equal ⇒ `cla`. (Code `36` is **not pinned down** by the in-source FIODEC comments — inferred to be a non-musical control/shift code worth zeroing.)
- `sad (13 / jmp rt2` — if the code equals `13`, **discard and re-read** (`jmp rt2`) rather than merely clearing. (Code `13` is likewise **not pinned down** by source comments — inferred non-printing/control code.)

If none of those special cases re-routed control, execution falls into `rtx`.

**Normal return — `rtx` (371).**
```
rtx,	jmp
```
A bare `jmp` whose address was patched by `dap rtx` in the prologue — the `exit` idiom. AC at this point holds the cleaned 6-bit character (or `0` if it hit one of the `cla` cases). The caller (`pg`/`rcy`/`rcu`) receives the FIODEC character in AC.

**Rejected-code tail — `rtb` (372-375).**
```
rtb,	lac t1
	sza
	hlt
	jmp rt2
```
Reached when the `2525`/`rar` membership test said the code was **not** acceptable.
- `lac t1` — reload the raw character.
- `sza` — Skip on Zero AC: skip if the raw read was zero.
- `hlt` — **halt** if the rejected character was non-zero. This is a hard stop: an unexpected, non-blank, non-acceptable character on the source tape halts the machine for the operator to notice. A zero (blank tape line) instead skips the `hlt`.
- `jmp rt2` — for a zero/blank line, just go read the next character (blank tape between fields is harmless).

So `rp`'s full contract: spin until the reader has a line, drop bad-parity lines silently, drop the `2525`-pattern-rejected codes (a non-zero rejected code `hlt`s; a zero/blank line is re-read), normalize the accepted `77`/`36` codes to a cleared AC and re-read `13`, and otherwise return one good 6-bit FIODEC character in AC. The shift/skip control flow is emulator-faithful; the `rrb`/`rpa`/`cks`/`tyo` device behavior, the parity-bit position, and the exact `2525` accept-set are **inferred / (not emulator-verified)**.

## `fee` — feed (punch) blank tape lines, switch-guarded (lines 377-387)

```
fee,	0
	dap fex
	cli
	lat
	and (700
	sad (700
	jmp fex
	ppa
	isp fee
	jmp .-2
fex,	jmp
```

`fee` is reached by the `feed N` macro (`law i N / jda fee`), so the deposited cell `fee` holds **−N** (`law i N` loads the ones-complement of the literal, i.e. `−N`). It punches `N` blank tape lines — leader/gap between the count/data/checksum segments of the output tape (`feed 400`, `feed 6`, `feed 300` in the punch driver `pv4`, lines 1311/1325/1340).

- `dap fex` — patch the exit `jmp` at `fex` with the return address.
- `cli` — Clear IO (IO := 0). A blank line is "all zero bits," so IO is cleared before punching. (Emulator-implemented: `cli` is the `0o4000` operate bit.)
- `lat` — Load AC from the test word: `AC := AC OR testword`. (Emulator-implemented; the front-panel test-word read.) Here it samples the operator's switch register so the operator can **gate** the punch from the console.
- `and (700` — mask AC to the three switch bits selected by `700` octal.
- `sad (700 / jmp fex` — `sad` skips if AC **≠** `700`; so if all three switches are set (AC = `700`), the skip does **not** fire and `jmp fex` returns **immediately without punching**. This is a manual "suppress feed / no punch" override.
- `ppa` — Punch Paper-tape Alphanumeric: punch one line from the low 6 bits of IO **(not emulator-verified)**. Since `cli` zeroed IO, this punches a **blank** line (just the feed-hole, no data holes).
- `isp fee` — Index-and-Skip-on-Positive the deposited cell `fee` (which holds −N): increment it; skip the next instruction when the result becomes ≥ 0. (`isp` is emulator-implemented; note cpu.ts normalizes a result of −0 to +0.) This is the loop counter, counting −N up toward 0.
- `jmp .-2` — loop back to `ppa` while `isp` did not skip (count still negative). When `isp` finally skips (count reached 0), control falls through to...
- `fex, jmp` — return (patched).

Intent: punch `N` blank lines as inter-segment leader, unless the operator has thrown the `700` switch mask to inhibit it. The loop is a textbook `isp`/`jmp .-2` count-up; only `ppa` is unverified.

## `ppp` — punch one 18-bit word as three binary lines, switch-guarded (lines 389-401)

```
ppp,	0
	dap pup
	lio ppp
	lat
	and (700
	sad (700
	jmp pup
	ppb
	ril 6s
	ppb
	ril 6s
	ppb
pup,	jmp
```

`ppp` is `call`-ed (`jda ppp`) with the 18-bit word to punch sitting in cell `ppp` (the deposited argument). It is the producer of every data word on the output tape — the note count, each note word, the note checksum, the bar count, each bar pointer, the bar checksum (driver `pv4`, lines 1313-1339). Music 13 reads each such word back with one `rpb` (3 lines → 1 word), exactly as [`../../pdp1m13/docs/05-data-formats.md`](../../pdp1m13/docs/05-data-formats.md) describes.

- `dap pup` — patch the exit `jmp` at `pup` with the return address.
- `lio ppp` — load IO from cell `ppp`: the 18-bit word to punch is now in IO. (Emulator-implemented.)
- `lat / and (700 / sad (700 / jmp pup` — the **same** console switch-gate as `fee`: sample the test word, mask `700`, and if all three switches are set return immediately **without punching**. (The `lat` ORs into AC, which after `lio` holds whatever the caller left in AC, but `and (700` masks down to just the switch bits — so the gate is purely the switch state.) This lets the operator inhibit punching globally.
- `ppb` — Punch Paper-tape **Binary**: punch one binary line from IO **(not emulator-verified)**. Binary mode punches the data holes per line (no FIODEC alphanumeric interpretation), which is what `rpb` on the reading side expects.
- `ril 6s` — rotate IO left 6 (popcount `6s` = 6), bringing the next 6-bit group into punch position. (Emulator-implemented; `ril` rotates IO alone.)
- `ppb / ril 6s / ppb` — two more punch + rotate steps. Three `ppb`s emit all 18 bits as three 6-bit lines, the two intervening `ril 6s`s lining up the next group each time. After three `ril 6s` rotations IO has returned to its original alignment. *(Which 6-bit group is punched first, and thus the line order, is the inverse of however Music 13's `rpb` reassembles the word — the agreement is "3 lines per 18-bit word"; the exact intra-word order is not emulator-verifiable since `ppb` is not emulated.)*
- `pup, jmp` — return (patched).

Intent: emit one 18-bit word as exactly three binary tape lines, the inverse of Music 13's `rpb` word-assembler. The arithmetic-sum checksum that follows each segment in the data-format agreement is computed by the *caller* (`pv4`, e.g. `step t2, t1` — expanding to `lac t2; add t1; dac t2` — accumulating into `t2`, then `call ppp` to punch the sum); `ppp` itself just "lays down one word." Only `ppb` is unverified; `lio`/`ril`/`lat`/`and`/`sad` are emulator-faithful.

## What this accomplishes

These five routines are the complete hardware-I/O surface of hc1d. `wr` (with the `print`/`type` macros) drives the Flexowriter for diagnostics; `rpr` primes the reader and `rp` delivers one clean, parity-checked, code-filtered source character at a time to the scanner; `fee` and `ppp` together write the intermediate tape — `fee` laying blank leader between segments and `ppp` punching each count/data/checksum word as three binary lines that *PDP-1 Music 13* reads back with `rpb`. The console `700`-switch gate on both punch routines lets the operator run the compiler with the punch idle (e.g. to re-check a tape on the Flexowriter without producing output). The careful part is `rp`: its busy-wait on the reader flag, its silent parity-reject, and its compact `2525`/hand-assembled-`rar` membership test are how garbage and non-musical FIODEC codes are kept out of the scanner — at the cost of a hard `hlt` on a genuinely unexpected character.

Next: the top-level scanner driver (`u`, `ap`, `pf`, `pg`, ...) at line 406 onward, which is the first consumer of `rpr` and `rp`.

[primer's macro layer]: ../../pdp1m13/docs/02-pdp1-primer.md
