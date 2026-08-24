# A primer for reading hc1d (delta from the PDP-1 primer)

**Read [`../../pdp1m13/docs/02-pdp1-primer.md`](../../pdp1m13/docs/02-pdp1-primer.md) first.** That primer covers the machine model you need for *everything* here: 18-bit **ones-complement** words (negate = `cma` = bitwise NOT, with a distinct `-0 = 777777`), the registers AC/IO/PC, the 6 program flags, 6 sense switches, the 18-bit test word read by `lat`, the instruction-word format (opcode / indirect-`i` bit / 12-bit `Y`), and the core instruction set — `lac`/`dac`/`add`/`sub`/`and`/`xor`/`idx`/`isp`/`sad`/`sas`/`jmp`/`jsp`/`jda`/`law`/`cma`/`cla`, the shift/rotate family (`sar`/`sal`/`ral`/`rar`/`rcl`/`rcr` with the `Ns` shift-count notation), and the skip group. This document does **not** re-teach any of those; it documents only what `hc1d` adds on top.

`hc1d` differs from *PDP-1 Music 13* in four big ways: (1) almost every body line is a **macro call**, not a bare instruction; (2) it uses a homegrown **`answer`/`exit`/`call`/`govia`** subroutine convention instead of bare `jsp`/`jda`+`dap`; (3) it does real paper-tape and Flexowriter **I/O** through IOTs the TS emulator never implements; and (4) it leans on two assembler **pseudo-ops** (`flexo`, `text`) that the modern re-assembler can't process. There is also a 6-character symbol-folding rule you must keep in mind while reading. Each is below.

## 1. The MACRO pseudo-language: `define ... termin`

Lines 7-325 of `hc1d.mac` are one long block of macro definitions. Each has the form:

```
define	load A
	lac A
	termin
```

`define <name> <formals>` opens a definition; the lines until `termin` are the body; `<formals>` are textually substituted on each call. So `load chr` expands to `lac chr`, and `step nl, bc` (a two-arg macro) expands to three instructions. This is a pure **text-substitution** macro facility — there is no recursion, no conditionals; expansion is literal token replacement, exactly like the original DEC MACRO assembler's `define`.

The consequence for reading the program: **the body of `hc1d` (everything after line 325) is written almost entirely in this pseudo-language.** A line like

```
s3x,	call cr
	write eha
```

is not two PDP-1 instructions — it is two macro calls. `call cr` expands to `jda cr`; `write eha` expands to `law eha / jda wr`. To read any routine you must expand its macros first. A handful of macros (`copy`, `search`, `answer`, the table-dispatch group) expand to self-modifying multi-instruction sequences and are genuinely subtle.

The full vocabulary — every macro, its expansion, and what it does in PDP-1 terms — is tabulated in the companion reference **[`20-macro-vocabulary.md`](20-macro-vocabulary.md)**. Keep it open. The categories there are: data movement (`load`/`store`/`move`/`sett`/`zero`/`clear`/`comple`/`band`), arithmetic & stepping (`addi`/`subt`/`step1`/`step`/`stepa`/`istepa`/`grow`/`halve`/`halfof`/`double`/`x2to*`/`x10dec`), control (`goto`/`govia`/`call`/`exit`/`halt`), the subroutine prologue (`answer`), the skip-and-jump test family (`trze`/`trnz`/`trpl`/`trmi`/`trel`/`trnl`/`ftrel`, the `test*` loads-and-tests, and the `tles`/`tlesc`/`tgrel`/`tgrec` compares), the self-modifying table/dispatch group (`lookup`/`dispat`/`diswit`/`putback`/`search`/`copy`), and the I/O & error group (`write`/`type`/`print`/`feed`/`compla`/`error`).

Two reading hazards worth stating here:

- **The skip-and-jump macros invert the bare-skip sense.** A macro like `trze T` expands to `sza i / jmp T`, so it *jumps to T when AC = 0*. The macro **name states the jump condition**, which is the opposite of the PDP-1 skip it is built from. Read `trze`/`trnz`/`trpl`/`trmi` etc. by their name's stated condition, not by the underlying `sza`/`sma`/`spa`. (For example `tgrec C,T` expands to `sub (C / sma+sza-skp / jmp T` and *jumps when AC > C*, the combined skip firing on minus-OR-zero.)
- **`exit P` ignores its argument.** `exit P` expands to a bare `jmp` (no operand) — the operand was patched in at runtime by the matching `answer` prologue (next section). The `P` you see written is documentation only.

## 2. The `answer` / `exit` / `call` / `govia` subroutine convention

*Music 13* returns from subroutines by the classic `jsp`/`jda`+`dap`-the-exit idiom. `hc1d` wraps the same machinery into a fixed calling convention built from four macros.

**Call site.** `call S` expands to `jda S` — jump-and-deposit-AC: AC is written into cell `S`, and execution resumes at `S+1`. So the argument is passed in AC, deposited into the routine's first word. `govia P` expands to `jmp i P` — an indirect jump through cell `P`; this is the "switch-return" idiom, used where the return/continuation target is held in a variable (e.g. `ps, govia psw` at line 1273 dispatches through the pseudo-command return switch `psw`).

**Routine prologue.** A routine begins with `answer <exitlabel>`, which expands to three words:

```
define	answer X
	0          / cell where the caller's jda/call deposited AC (the argument)
	dap X      / patch the low 12 bits of the exit jmp at X with the return address (in AC after jda)
	lac .-2    / reload the deposited argument back into AC
	termin
```

Walking it: `jda S` left the **return linkage** in AC and the **argument** in the word at `S` (the `0` slot). `dap X` then patches that return address into the address field of the word labelled `X` (the routine's exit), leaving its opcode — a `jmp` — intact. `lac .-2` reloads the argument (the `0` cell, two words back from the `lac`) into AC so the body can use it. The routine ends with `<exitlabel>, exit <name>` — a bare `jmp` whose address `dap X` just filled in. Result is returned in AC.

**Worked example — `cr` (carriage return), lines 452-454:**

```
cr,	answer crx     / cr=0 (arg slot); dap crx; lac .-2 (arg back to AC)
	type (77       / lio (77 ; tyo  -- type one FIODEC char (77) (not emulator-verified)
crx,	exit cr        / bare jmp, address patched by the answer prologue -> returns
```

`cr` takes no real argument; it types the FIODEC code `77` (evidently a carriage-return/format char) and returns. The skeleton — `answer` at top, `exit` at the labelled bottom — is `hc1d`'s universal subroutine shape; you will see it on `cr`, `sbc`, `snl`, `rcw`, `rrc`, `rch`, `er`, `er1`, `red`, `blk`, `cn`, and others. A slightly richer one, `sbc` (lines 456-463), uses its returned AC as a real result:

```
sbc,	answer sbx       / arg in AC, return patched into sbx
	step1 tbc        / idx tbc
	step1 bc         / idx bc
	addi nl          / add nl
	tgrec all, s3x   / sub (all; sma+sza-skp; jmp s3x  -- jump to overflow handler if AC > all
	load bc          / lac bc  -- set up the return value...
	complement       / cma     -- ...negated
sbx,	exit sbc         / return with result in AC
```

`tgrec all, s3x` is the table-overflow guard: it jumps to `s3x` (the "Table overflow" handler, line 654) when the running total exceeds the literal capacity `all`. Note `complement` is the macro `comple` reached by 6-char folding — see section 5.

## 3. The I/O IOTs — `tyo` / `rrb` / `rpa` / `cks` / `ppa` / `ppb` (+ `lat`, `rpb`)

`hc1d` is a tape-to-tape program: it **reads** the source DSL from the paper-tape reader and **punches** the intermediate note/bar tape (the format consumed by *Music 13*, per [`05-data-formats.md`](../../pdp1m13/docs/05-data-formats.md)), while **typing** diagnostics on the Flexowriter. All of this happens through IOT instructions. **The TS emulator (`src/pdp1/cpu.ts`) does not implement any of the reader/punch/typewriter IOTs**, so every concrete bit-level claim below is *historical / inferred from standard PDP-1 I/O*, not emulator-verified. Treat them as such.

| IOT | Name | Inferred semantics (not emulator-verified) | Where used |
|---|---|---|---|
| `tyo` | Type Out | Send the low Flexowriter character in IO to the typewriter/punch — prints one 6-bit FIODEC char. | `type`, `print` macros; `wr`, `cr`, `red`, `blk` |
| `rrb` | Read Reader Buffer | Read the paper-tape reader buffer into IO (after a read was strobed). | `rpr` (l.339), `rp` (l.350) |
| `rpa` | Read Paper-tape Alphanumeric | Initiate/strobe one 6-bit line from the tape reader. Used as **`rpa-i`** (the indirect/clear-and-read variant). | `rpr` (l.340), `rp` (l.351) |
| `cks` | Check Status | Skip / condition on an I/O device flag; used to spin until the reader is ready. | `rp` (l.346, the `rt2` wait loop) |
| `ppa` | Punch Paper-tape Alphanumeric | Punch one 6-bit line (low 6 bits of IO) in alphanumeric mode. | `fee` (l.384, blank-feed) |
| `ppb` | Punch Paper-tape Binary | Punch one line in binary mode; three of them lay down one 18-bit word. | `ppp` (l.396-400, punches 3 lines) |

Two more I/O-adjacent instructions are **emulator-implemented** (so verifiable):

- **`lat`** — Load AC from the test word (`AC := AC OR testword`). A front-panel/switch read. `hc1d` uses it in `fee`/`ppp` (lines 380, 392) to sample switch settings: `lat / and (700 / sad (700` masks off three test-word bits and gates the punch on whether they are all set.
- **`rpb`** — Read Paper-tape Binary; assemble one 18-bit word from 3 tape lines. (This is the binary-mode reader, the inverse of `ppp`.)

The low-level reader and punch routines live in lines 327-401: `wr` (type a string), `rpr`/`rp` (read a line, with the `rt2` ready-wait loop), `fee` (feed blank tape), `ppp` (punch one 18-bit word as 3 binary lines). When you trace those, remember the device behavior is reconstructed, not simulated.

## 4. The `flexo` and `text` assembler pseudo-ops

Two **assembler pseudo-ops** (built into the original MACRO assembler, *not* `define`d macros) lay FIODEC data into memory:

- **`flexo`** packs a short FIODEC character code into a constant word. It appears only as the argument to the `error` and `compla` (complaint) macros: `error flexo tmf` (l.645) expands the `error U` macro with `U = flexo tmf`, i.e. `lac (flexo tmf) / jda er1` — the operand is the packed 3-character FIODEC error-name code that the error printer types. (`flexo` is *inferred* to assemble its operand symbol's characters into a packed FIODEC literal; the exact packing is historical.)
- **`text`** lays down a packed FIODEC string between `/` delimiters. E.g. the block at lines 654-657:

  ```
  s3x,	call cr
  	write eha
  	text /Table overflow.  Subdivide source program./
  eha,	call cr
  ```

  The `write eha` types the string starting just after it, up to the word at `eha`; the `text /.../` block is that string, assembled inline as packed FIODEC. There is also a multi-line `text` block at lines 573-576 (the "To err is human---to forgive, divine." message), where the literal newlines between the `/` delimiters are part of the typed text.

**The on-disk `macro`/`macro1` re-assembly does NOT support `flexo` or `text`.** This is the single biggest reason `hc1d.lst`/`hc1d.err` are unreliable: the modern reimplementation lacks both pseudo-ops, so every `text` block and every `flexo` operand miscounts words, the assembled **octal addresses drift**, and the re-assembly emits its 171 diagnostics (it is also stricter about blanks and even tries to assemble the bare title line — the first six errors in `hc1d.err` are "undefined symbol HARMON/COMPIL/PHASE" and related "illegal blank"/"illegal expression" complaints, all from line 1). **Therefore every section of this doc set headlines routines by symbolic label + `hc1d.mac` line range, never by octal address.** An approximate octal from the `-d` symbol dump may appear only when clearly labelled "approx".

## 5. Six-character, upper-folded symbols (and the genuine typos)

This MACRO assembler is **significant to six characters and folds case to UPPER**. So a symbol the author spells out in full still resolves to its 6-character macro name. In the body you will therefore see these *longer* spellings, which are simply the macros from section 1:

| As written in body | Folds to (6 chars, upper) | Resolved macro |
|---|---|---|
| `complement` | `COMPLE` | `comple` (= `cma`) |
| `complaint` | `COMPLA` | `compla` (= the `compla U` error macro) |
| `dispatch` | `DISPAT` | `dispat` (= the computed-jump macro) |
| `diswith` | `DISWIT` | `diswit` (= the load-then-dispatch macro) |

These are **not** errors — they are the same tokens, and this doc set treats them as such silently from here on. (For example line 1246 reads `dispatch pcd-1`, which folds to the `dispat` macro and assembles the pseudo-command jump table. This is also why `complement`, `dispatch`, etc. appear in the body but never in the `define` block.)

By contrast, four spellings are **genuine retype slips** introduced in the 2006 retype — the `-d` symbol dump shows them undefined with a `?`. Flag them inline; never silently correct them in the `.mac`:

| Line | As written | Likely intended | Note |
|---|---|---|---|
| 593 | `setp1 etc` | `step1 etc` | likely retype slip for `step1` |
| 860 | `setpa si, 1` | `stepa si, 1` | likely retype slip for `stepa` |
| 954 | `complaint flex air` | `complaint flexo air` | likely retype slip for `flexo` |
| 976 | `compalint flexo aor` | `complaint flexo aor` | likely retype slip for `complaint` |

## What this accomplishes

With these five deltas — the macro pseudo-language, the `answer`/`exit`/`call`/`govia` convention, the reader/punch/Flexowriter IOTs, the `flexo`/`text` pseudo-ops, and the 6-char folding rule — you can read any routine in `hc1d` by expanding its macros into the core PDP-1 instructions the [PDP-1 primer](../../pdp1m13/docs/02-pdp1-primer.md) already taught, and you know why the re-assembly's addresses can't be trusted. The next section walks the program's top-level structure: the entry point `u`/`ap` (lines 406-407) and the two-pass read-scan-punch pipeline that produces the intermediate tape consumed by [*Music 13*'s data formats](../../pdp1m13/docs/05-data-formats.md).
