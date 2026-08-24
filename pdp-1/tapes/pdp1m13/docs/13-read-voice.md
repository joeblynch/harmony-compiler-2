# `1024`-`1126`: reading a voice from tape (`rdp`/`rdm`/`rdg`)

This block is the tape-ingest front end. Each time the worklet presses Start@4 (`go` -> `rdp`) with sense switch 1 on, it reads **one voice's** data off paper tape: a *notes* section, then a *bars* section, each terminated by a checksum. It is called once per voice; the voice index `ij` (`0o255`) advances after each successful read so the next press fills the next slot. The compiler later turns this raw note/bar data into the per-segment frequency/duration tables the player loop consumes.

Three entry points live here:

- `rdp` (`0o1024`) — read a voice: bounds-check, then read the notes section, then fall into `rdm`.
- `rdm` (`0o1056`) — read the bars section into `b(ij)` and finish the voice.
- `rdg` (`0o1114`) — a shared `jsp` helper that reads a section header (the note/bar count) and primes the loop counter `ct` and checksum `sum`.

## Setup: choose memory top and bounds-check the voice count

```
1024  rdp,	lac nof	/use all bank 0
1025  	szs 30
1026  	lac noe	/leave room for DDT
1027  	dac top
```

- `lac nof` (`0o14`) loads the *normal* bank-0 memory ceiling into AC.
- `szs 30` is `szs` with sense field 3: **skip if sense switch 3 is OFF**. So if SW3 is off, the next instruction is skipped and `nof` stays selected. If SW3 is **on** (the "leave room for DDT" debugger case), the skip does not happen and `lac noe` (`0o13`) overwrites AC with the lower ceiling `noe`.
- `dac top` stores the chosen ceiling into `top` (`0o17`). `top` is the address at which the tape buffer is considered full; every store below checks against it with `sad top; hlt`.

```
1030  	law i 4
1031  	add ij
1032  	sma
1033  	jmp stp	/nope, we're full
```

This is the "have we already read 4 voices?" guard.

- `law i 4` loads the ones-complement immediate `~4` = `0o777773` (i.e. -4) into AC.
- `add ij` adds the current voice index `ij` (`0o255`, which counts 0,1,2,3...). Result is `ij - 4` in ones-complement.
- `sma` skips the next instruction **only if AC is negative** — i.e. only if `ij < 4`, meaning there is still room. The skip jumps over the `jmp stp`, so control falls into the section reader.
- If `ij >= 4` the sum is non-negative, `sma` does **not** skip, and `jmp stp` (`0o724`) bails out: the machine is full, so this voice read is rejected. (`stp` halts back to the front-panel/worklet.)

The boundary case `ij == 4` resolves cleanly thanks to ones-complement -0 normalization: `-4 + 4` = `0o777773 + 4` = `0o777777` = **-0**, which the adder normalizes to **+0** (the same `-0 -> +0` rule that `idx`/`isp` use). With the sign bit clear, `sma` does **not** skip, `jmp stp` fires, and the fourth-voice case is correctly treated as "full." So the guard self-sufficiently means "read only while fewer than 4 voices exist" — no external reset of `ij` is required to make it stop.

## Read the notes section

```
1034  	jsp rdg
1035  	lac ib
1036  	dac off
```

- `jsp rdg` (`0o1114`) calls the shared section-header reader (detailed below). On return, `ct` (`0o1664`) holds the negated note count (a loop counter that counts up toward 0), and `sum` (`0o24`) is cleared.
- `lac ib` loads the current tape-buffer write pointer `ib` (`0o25`), and `dac off` saves it into `off` (`0o256`). `off` records **where this voice's notes begin** in the buffer; it is used later in `rdm` to bias bar pointers so they reference this voice's note block rather than wherever the absolute pointer landed on tape.

```
1037  rd1,	rpb	/a note
1040  	dio i ib
1041  	lac i ib
1042  	add sum
1043  	dac sum
1044  	idx ib
1045  	sad top
1046  	hlt	/too much data
1047  	isp ct
1050  	jmp rd1
```

This is the note-read loop. Per iteration:

- `rpb` (assembled `0o730002`, the indirect bit is part of the `rpb` encoding) — **Read Paper-tape Binary**: assembles one 18-bit word into IO from three tape "lines." Only tape bytes with bit `0o200` set contribute their low 6 bits; bit `0o100` is ignored. One `rpb` therefore consumes three valid tape frames and yields one 18-bit note word in IO.
- `dio i ib` — store IO **indirectly through `ib`**: `C(C(ib)) := IO`. This is the core "store via the buffer pointer" idiom: `ib` holds the buffer address, the indirect deposits the just-read word there. (In extend mode the indirect is single-level with a full address, so the buffer can sit anywhere.)
- `lac i ib` — load that same word back through `ib` (`AC := C(C(ib))`) so it can be folded into the checksum.
- `add sum` / `dac sum` — accumulate the word into the running checksum `sum` (ones-complement add with end-around carry).
- `idx ib` — increment the buffer pointer `ib` (ones-complement increment, with `-0` normalized to `+0`), advancing to the next buffer slot.
- `sad top` — skip if `AC != top`. After `idx`, AC is the *new* `ib`; if it equals `top` the buffer just overflowed, the skip is NOT taken, and `hlt` (`0o1046`) stops the machine ("too much data"). Normally `ib != top`, the skip fires, and `hlt` is jumped over.
- `isp ct` — increment `ct` and **skip if the result is >= 0**. Because `ct` started as the negated count, it counts ...,-2,-1,0; while still negative `isp` does **not** skip and `jmp rd1` loops. When `ct` reaches 0 (all notes read), the result is non-negative, `isp` skips the `jmp rd1`, and control falls through to the checksum check.

```
1051  	rpb	/checksum
1052  	dio ct
1053  	lac sum
1054  	sas ct
1055  	hlt	/checksum error
```

- `rpb` reads one more 18-bit word: the tape's stored checksum.
- `dio ct` parks it in `ct` (now free, since the loop is done) — handy 18-bit scratch.
- `lac sum` loads the computed checksum.
- `sas ct` — **skip if AC == C(ct)**, i.e. skip the `hlt` only when computed checksum matches the tape checksum. On mismatch the skip does not fire and `hlt` (`0o1055`) stops ("checksum error"). This is the section's integrity gate.

Control then falls straight into `rdm`.

## `rdm`: read the bars section

```
1056  rdm,	jsp rdg
1057  	law b
1060  	add ij
1061  	dap rd2
1062  	lac ib
1063  rd2,	dac .	/b(ij)
```

- `jsp rdg` reads the bars-section header (count -> `ct`, clears `sum`).
- The next four instructions compute the address `b + ij` and patch it into the `dac` at `rd2` — classic **self-modifying indexing**:
  - `law b` loads the immediate base address `b` (`0o750`, the per-voice bar-pointer array).
  - `add ij` forms `b + ij`, the slot for this voice.
  - `dap rd2` — **deposit address part** into `rd2` (`0o1063`): only the low 12 bits of the word at `rd2` are overwritten with AC<6:17>; the `dac` opcode bits are preserved. So `rd2` becomes `dac b(ij)`.
  - `lac ib` loads the current buffer pointer (the address where this voice's bars will start).
  - `rd2, dac .` then stores that pointer into `b(ij)`. (`dac .` self-references; the operand was just patched by `dap rd2`.) The result: `b(ij)` records where in the buffer this voice's bar list lives.

```
1064  rd3,	rpb	/a bar pointer
1065  	dio i ib
1066  	lac i ib
1067  	add sum
1070  	dac sum
1071  	lac i ib
1072  	sma
1073  	add off
1074  	dac i ib
1075  	idx ib
1076  	sad top
1077  	hlt	/too much data
1100  	isp ct
1101  	jmp rd3
```

The bar-read loop mirrors `rd1`, with one extra step: each bar pointer is **biased by `off`** so it points into this voice's own note block.

- `rpb` reads one bar-pointer word; `dio i ib` stores it through the buffer pointer.
- `lac i ib; add sum; dac sum` — fold the raw stored word into the checksum (the checksum is computed over the value **as read from tape**, before biasing).
- `lac i ib` — reload the bar pointer.
- `sma` — skip the next instruction if AC is negative. A negative bar pointer is a sentinel/special value that must be left untouched; a non-negative one is a relative offset to be rebased.
- `add off` — for non-negative pointers only, add `off` (the start of this voice's notes, captured back at `0o1036`). This converts the tape-relative bar index into an absolute buffer address.
- `dac i ib` — write the (possibly biased) pointer back through `ib`, overwriting the raw value just stored.
- `idx ib; sad top; hlt` — advance and overflow-check exactly as in `rd1`.
- `isp ct; jmp rd3` — loop until `ct` counts up to 0.

```
1102  	rpb	/checksum
1103  	dio ct
1104  	lac sum
1105  	sas ct
1106  	hlt	/checksum error
```

Identical checksum protocol as the notes section: read the tape checksum into `ct`, compare against the computed `sum`, `hlt` on mismatch.

## Finish the voice

```
1107  	idx ij	/ready for next voice
1110  	stf 5	/got some data
1111  	idx f5
1112  	idx npt	/count the part
1113  	jmp stp
```

- `idx ij` — increment the voice index `ij` (`0o255`) so the next Start@4 fills the next voice slot.
- `stf 5` — **set program flag 5**. Flag 5 (`0o02`) is the lifecycle status bit "voice(s) read"; combined with flag 6 it puts the machine in the `(1,0)` state, so the next Continue compiles & plays (per the header state machine).
- `idx f5` (`0o174`) — `f5` is the **persistent memory copy** of flag 5. Start@4 (`go`) clears the live program flags and then calls `jsp gfg` (`0o176`) to restore flags 5/6 from `f5`/`f6`; incrementing `f5` here makes it non-zero so that restoration will re-set flag 5 on the next press. In other words, `stf 5` sets the live flag *now*, and `idx f5` makes the state survive the next Start@4.
- `idx npt` (`0o16`) — increment `npt`, the count of parts read. The compiler uses `npt` to know how many voices to merge.
- `jmp stp` (`0o724`) — return to the stop/idle path, waiting for the next front-panel action (another voice read, or a Continue to compile).

## `rdg`: the shared section-header reader

```
1114  rdg,	dap rgx
1115  	rpb
1116  	dio ct	/note count
1117  	lac ct
1120  	sma
1121  	sza i
1122  	hlt	/count too small
1123  	cma
1124  	dac ct
1125  	dzm sum
1126  rgx,	jmp .
```

Called as `jsp rdg`; it primes `ct` (loop counter) and `sum` (checksum) for a section.

- `dap rgx` — on entry, `jsp` left the return linkage in AC; `dap rgx` patches the low 12 bits of the exit word at `rgx` (`0o1126`) so `rgx, jmp .` returns to the caller. Standard `jsp` subroutine return idiom.
- `rpb; dio ct` — read the section's element count off tape into `ct`.
- `lac ct; sma; sza i; hlt` — reject an empty section. These are two *sequential* skip instructions, each of which (when it fires) skips exactly the one instruction following it:
  - `lac ct` loads the count.
  - `sma` skips if AC is negative. If it fires it skips the `sza i` and lands on `cma`, so a negative count bypasses the `hlt`.
  - `sza i` is `sza` inverted: **skip if AC != 0**. If it fires it skips the `hlt`, so any non-zero count passes.
  - The `hlt` ("count too small") is therefore reached only when **neither** skip fires — i.e. AC is neither negative nor non-zero, which is exactly zero (`+0` or `-0`). A zero-length section halts; a negative count slips through (`sma` lets it pass — only the empty case is actively guarded).
- `cma; dac ct` — complement AC (ones-complement negate) and store back into `ct`. This turns the positive count into its negative, so the `rd1`/`rd3` loops can use `isp ct` to **count up to zero**.
- `dzm sum` — zero the checksum accumulator for the section.
- `rgx, jmp .` — return to caller (operand patched by the entry `dap rgx`).

## What this routine accomplishes

`rdp`/`rdm`/`rdg` load one voice from paper tape into the bank-0 buffer with full integrity checking. The pattern repeats for both the notes and the bars sections: `rdg` reads and negates the element count and clears the checksum; a tight `rpb` -> `dio i ib` -> checksum -> `idx ib` -> bounds-check -> `isp ct` loop streams the section into the buffer through the moving pointer `ib`; then a trailing `rpb` reads the tape's checksum and `sas`/`hlt` enforces it. The bars pass additionally records each voice's bar list location in `b(ij)` (via the `dap rd2` self-modify) and rebases each non-negative bar pointer by `off` so it addresses this voice's own notes. On success it advances `ij`/`npt`, sets flag 5 (and bumps its memory mirror `f5`) to mark "voice read," and returns to idle — leaving the raw, validated note/bar data ready for the compiler to assemble into the player's segment tables.
