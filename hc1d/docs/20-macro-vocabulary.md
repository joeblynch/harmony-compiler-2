# The macro vocabulary

`hc1d.mac` is not written in raw PDP-1 assembly so much as in a small **language built out of macros**. The macro header at the top of the file (line 7) dates the set:

```
/macros  1/6/62  (as amended by Acts of 1/15/62 and 4/30/62)
```

The block from **line 9 to line 325** defines 58 `define … termin` macros (roughly five dozen). Almost every line in the body of the program below line 325 is a *call* to one of these macros, so **reading any routine means expanding its macros back into the underlying PDP-1 instructions**. This file is the Rosetta stone for the rest of the walkthrough: once you can read the macro vocabulary you can read the program.

For the underlying instruction semantics (`lac`, `dac`, `add`, `sub`, `and`, `idx`, `sad`, `sas`, `jmp`, `jda`, `dap`, `law`, `cma`, `sar`/`sal`/`ral`/`rar`/`rcl`/`rcr`, the skip group, ones-complement arithmetic, and the `Ns` shift-count notation) this section defers entirely to [`../../pdp1m13/docs/02-pdp1-primer.md`](../../pdp1m13/docs/02-pdp1-primer.md). It does **not** re-teach core ops; it explains what each macro *expands to* and *why*.

## A note on the assembler: 6 characters, folded to upper case

Before reading any expansion, internalize one rule about this MACRO assembler (confirmed by re-assembling the file): **symbols are significant to only the first SIX characters, and case is folded to UPPER.** That means the body is free to spell a macro name out in full English and still hit the 6-char macro definition:

| As written in the body | First 6 chars | Resolves to macro |
|---|---|---|
| `complement` | `COMPLE` | `comple` |
| `complaint` | `COMPLA` | `compla` |
| `dispatch` | `DISPAT` | `dispat` |
| `diswith` | `DISWIT` | `diswit` |

These are **not** typos — they are the same token. (You can see `complaint flexo mtl` at line 1200 and `dispatch pcd-1` at line 1246 in the body, both resolving by this rule.) This document applies the folding silently from here on (so `complement` *is* `comple`). The genuine retype slips that the symbol dump flags with `?` — `setp1` (line 593, likely meant `step1`), `setpa` (line 860, likely `stepa`), `compalint` (line 976, likely `complaint`), `flex` (line 954, likely `flexo`) — are called out inline where they occur in their owning sections, not here.

## The calling convention: `answer` / `exit` / `call` / `govia`

This is the single most important idiom in the program, so it comes first. hc1d's subroutines do **not** use the player's `jsp`/`jda+dap` pattern verbatim; they use a self-modifying *patched-exit* convention built from three macros.

#### `call S` — invoke a subroutine, argument in AC

```
define	call S
	jda S
	termin
```

`call S` expands to `jda S`. Per the primer, `jda S` deposits the current AC into cell `S`, then loads AC with the **return linkage** (the caller's PC after the `jda`, with the overflow/extend bits in the top two positions) and jumps to `S+1`. So **the argument is passed in AC and lands in the subroutine's first word**; execution begins at the instruction after it, and AC now holds the return address.

#### `answer X` — the subroutine prologue

```
define	answer X
	0
	dap X
	lac .-2
	termin
```

A routine `foo,` begins with `answer foox`, which expands to three words:

1. `0` — the literal cell `jda` overwrites with the caller's AC (the argument). This word *is* `foo`.
2. `dap X` — patch the **low 12 address bits** of the word at label `X` (the routine's exit) with the value `jda` left in AC, namely the **return address** (where the caller continues after its `jda`). `dap` preserves the opcode, so it only edits the jump target.
3. `lac .-2` — reload the deposited argument (the `0` word two cells back) into AC, so the body sees its argument in AC.

#### `exit P` — the patched return

```
define	exit P
	jmp
	termin
```

`exit P` expands to a **bare `jmp` with no address** — its `P` parameter is *ignored*. The address was filled in by the `dap X` in the prologue. So `foox, exit foo` is a `jmp` back to the caller. The label on the `exit` line (`foox`) is exactly the `X` that the prologue's `dap X` patches.

The net contract: **argument in AC on `call`, result in AC on return.**

#### `govia P` — return / dispatch through a cell

```
define	govia P
	jmp i P
	termin
```

`govia P` is `jmp i P`, an indirect jump through cell `P`. This is the *switch-return* idiom: code stores a return label into a cell `P`, then later `govia P` to resume there. (Contrast `exit`, which jumps through a *patched* word; `govia` jumps through a *named* word.)

#### Worked example 1: `cr` (lines 452–454)

```
cr,	answer crx
	type (77
crx,	exit cr
```

Expanded:

```
cr,	0		/ caller's AC deposited here by jda
	dap crx		/ patch the jmp at crx with the return address
	lac cr		/ (.-2) reload the argument
	lio (77		/ type (77  ->  lio (77 ; tyo
	tyo		/   (type the FIODEC char 77) -- not emulator-verified
crx,	jmp cr		/ exit cr  ->  bare jmp, target patched to caller
```

`cr` ignores its argument and just types one character via the literal `(77`, then returns. The source uses FIODEC `77` as a mask/delete pattern (see the FIODEC notes elsewhere); the routine is named `cr` and so evidently effects a carriage return / line break on the Flexowriter, though that mapping is inferred and the `tyo` is **not emulator-verified**. It is a tiny routine but shows the full prologue/epilogue skeleton.

#### Worked example 2: `sbc` (lines 456–463) — argument in, result in AC

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

Expanded and annotated:

```
sbc,	0			/ argument deposited here by the caller's jda
	dap sbx			/ patch exit
	lac sbc			/ reload argument into AC
	idx tbc			/ step1 tbc  : tape-bar count += 1
	idx bc			/ step1 bc   : bar count += 1
	add nl			/ addi nl    : AC := arg + nl  (note location)
	sub (all		/ \ tgrec all,s3x : AC - literal all, then
	sma+sza-skp		/ /  if AC > literal all jump s3x  (capacity overflow)
	jmp s3x			/ /  -- the combined skip fires on minus-OR-zero
	lac bc			/ load bc
	cma			/ complement : AC := one's-complement of bc
sbx,	jmp sbc			/ exit sbc : return, result (negated bc) in AC
```

Note `tgrec` compares against the **literal** `all` (it expands to `sub (all`, not `sub all`) — `all` is the note-array capacity constant, so the comparison is against the constant value, not the contents of a cell named `all`. `sbc` advances the bar counters, checks the running note location against capacity `all` (jumping to the error path `s3x` if exceeded), and returns the **negated** bar count in AC for the caller to use. This is the canonical shape: argument arrives in AC, the body computes, and the result is left in AC at `exit`.

## Data movement

| Macro | Params | Expansion | Intent |
|---|---|---|---|
| `load A` | A | `lac A` | AC := C(A) |
| `store A` | A | `dac A` | C(A) := AC |
| `move A,B` | A,B | `lac A` / `dac B` | copy cell A into cell B |
| `sett A,B` | A,B | `lac (B` / `dac A` | store the **literal** value B into cell A (`(B` is a constant) |
| `zero A` | A | `dzm A` | C(A) := 0 |
| `clear` | — | `cla` | AC := 0 |
| `comple` | — | `cma` | AC := one's-complement of AC (negate) |
| `band U` | U | `and U` | AC := AC AND C(U) |

Note `sett A,B` uses the literal `(B`, so `sett bc,-1` (line 409) deposits `-1` into `bc`, whereas `move A,B` copies a cell's contents.

## Arithmetic and stepping

| Macro | Params | Expansion | Intent |
|---|---|---|---|
| `addi A` | A | `add A` | AC := AC + C(A) (ones-complement add) |
| `subt A` | A | `sub A` | AC := AC − C(A) |
| `step1 J` | J | `idx J` | increment cell J in place (C(J) += 1) |
| `step J,I` | J,I | `lac J` / `add I` / `dac J` | C(J) := C(J) + C(I) |
| `stepa J,I` | J,I | `law I` / `add J` / `dac J` | C(J) += literal I |
| `istepa J,I` | J,I | `law i I` / `add J` / `dac J` | C(J) += literal −I (i.e. subtract I; `law i` loads −I) |
| `grow A,V,C` | A,V,C | `lac A` / `add (V` / `dac C` | C(C) := C(A) + literal V |
| `halve` | — | `sar 1s` | AC := AC >> 1 (arithmetic, sign-preserving) |
| `halfof V` | V | `lac V` / `sar 1s` / `dac V` | C(V) := C(V) >> 1 in place |
| `double Q` | Q | `lac Q` / `ral 1s` / `dac Q` | C(Q) := C(Q) << 1 in place (rotate-left as multiply-by-2) |
| `x2to1` | — | `ral 1s` | AC <<= 1 |
| `x2to3` | — | `ral 3s` | AC <<= 3 |
| `x2to6` | — | `ral 6s` | AC <<= 6 |
| `x2to7` | — | `ral 7s` | AC <<= 7 |
| `x10dec` | — | `ral 1s` / `dac t1` / `ral 2s` / `add t1` | AC := AC·10 (a decimal-accumulate helper) |

`x10dec` deserves a word: starting with AC = *n*, `ral 1s` gives 2*n*; `dac t1` saves 2*n* (without disturbing AC, which still holds 2*n*); `ral 2s` then rotates that **current** AC left two more places, giving 8*n*; and `add t1` forms 8*n* + 2*n* = 10*n* — the standard "multiply by 10" step used when reading a multi-digit decimal field. (The exact rotate accounting on full 18-bit words is inferred from the macro shape; the algorithmic intent — accumulate decimal digits — is clear.)

## Control flow

| Macro | Params | Expansion | Intent |
|---|---|---|---|
| `goto T` | T | `jmp T` | unconditional jump |
| `govia P` | P | `jmp i P` | jump through cell P (switch-return) |
| `call S` | S | `jda S` | call subroutine S (arg in AC) |
| `exit P` | P (ignored) | `jmp` | patched return (address set by `answer`'s `dap`) |
| `answer X` | X | `0` / `dap X` / `lac .-2` | subroutine prologue (see convention above) |
| `halt` | — | `hlt` | halt the machine |

## The skip-and-jump test family (note the inverted sense)

PDP-1 skip instructions *skip the next word* when their condition holds. hc1d wraps **skip + `jmp`** into a single macro whose **name states the jump condition** — which is the *opposite* of the bare skip's condition, because the skip steps *over* the `jmp` when its own condition is true. Keep this inversion in mind: `trze T` jumps to `T` when **AC = 0**, even though it is built on `sza i` (skip on AC ≠ 0, inverted by the `i` modifier so it skips when AC = 0... read carefully below).

#### `tr*` — test the current AC

| Macro | Expansion | Jumps to T when… |
|---|---|---|
| `trze T` | `sza i` / `jmp T` | AC = 0 |
| `trnz T` | `sza` / `jmp T` | AC ≠ 0 |
| `trpl T` | `sma` / `jmp T` | AC ≥ 0 (plus) |
| `trmi T` | `spa` / `jmp T` | AC < 0 (minus) |
| `trel A,T` | `sad A` / `jmp T` | AC = C(A) (equal) |
| `trnl A,T` | `sas A` / `jmp T` | AC ≠ C(A) (not-equal) |
| `ftrel A,T` | `trel A,T` | alias of `trel` |

The bare skips: `sza` skips when AC ≠ 0; `sza i` (indirect/complement modifier) inverts it to skip when AC = 0. Either way the `jmp T` runs only when the skip *does not* fire, so the macro name names the **jump** condition. (`sma` skips when AC < 0; `spa` skips when AC ≥ 0; `sad A` skips when AC ≠ C(A); `sas A` skips when AC = C(A) — each inverted by the trailing `jmp`.)

Truth table for the AC-sign pair (recall ones-complement: `−0` = `777777` is "minus"):

| AC | `trze` | `trnz` | `trpl` | `trmi` |
|---|---|---|---|---|
| `+0` | jump | — | jump | — |
| positive | — | jump | jump | — |
| negative | — | jump | — | jump |

#### `test*` — load a cell, then test (load + `tr*`)

| Macro | Expansion | Jumps to Z/A when… |
|---|---|---|
| `test0 Y,Z` | `lac Y` / `sza i` / `jmp Z` | C(Y) = 0 |
| `test1 Y,Z` | `lac Y` / `sza` / `jmp Z` | C(Y) ≠ 0 |
| `testp Y,Z` | `lac Y` / `sma` / `jmp Z` | C(Y) ≥ 0 |
| `testm Y,Z` | `lac Y` / `spa` / `jmp Z` | C(Y) < 0 |
| `testel Y,Z,A` | `lac Y` / `sad Z` / `jmp A` | C(Y) = C(Z) |
| `testnl Y,Z,A` | `lac Y` / `sas Z` / `jmp A` | C(Y) ≠ C(Z) |

#### `t*` — compare-by-subtraction

These subtract a comparand and test the sign of the difference. The `c`-suffixed variants compare against a **literal** (`(C`); the others against a **cell** (`C`).

| Macro | Expansion | Jumps to T when… |
|---|---|---|
| `tles C,T` | `sub C` / `spa` / `jmp T` | AC < C(C) |
| `tlesc C,T` | `sub (C` / `spa` / `jmp T` | AC < literal C |
| `tgrel C,T` | `sub C` / `sma` / `jmp T` | AC ≥ C(C) |
| `tgrec C,T` | `sub (C` / `sma+sza-skp` / `jmp T` | AC > literal C |

`tgrec` is the subtle one. Its skip word `sma+sza-skp` combines *skip-on-minus* (`sma`) and *skip-on-zero* (`sza`); since each is a member of the `skp` family that shares the base skip opcode, the source subtracts one `skp` so the two subfunction bits OR together cleanly. The combined skip therefore fires when the difference `AC − literal C` is **minus OR zero** — i.e. AC ≤ literal C — so the `jmp T` is taken only when **AC > literal C** (strictly greater). It is hc1d's "strictly exceeds a constant" test, used for capacity checks like `tgrec all, s3x` in `sbc` above.

## Table and dispatch family (self-modifying)

These macros patch a `.+n` word at run time with a computed address, then execute it. Each is marked with which "." it patches. (See the primer on `dap` patching only the low address bits.)

#### `lookup V` — indexed load `tab[i]`

```
define	lookup V
	add (V
	dap .+1
	lac
	termin
```

With an index in AC: `add (V` forms `i + V` (V is a table base literal), `dap .+1` patches the address of the **very next word** (the bare `lac`) to that sum, then `lac` loads `tab[i]`. Idiom: `load i` then `lookup tab`.

#### `dispat U` — computed jump (jump table)

```
define	dispat U
	add (U
	dap .+1
	jmp i
	termin
```

`add (U` forms index+base, `dap .+1` patches the following `jmp i`, then `jmp i` jumps *indirectly* through table entry `(AC+U)` — i.e. transfers to the address stored there. This is the dispatcher behind the pseudo-command table (`pcd`); the body calls it spelled out as `dispatch pcd-1` (line 1246).

#### `diswit L,U` — load then dispatch

```
define	diswit L,U
	add (U
	dap .+2
	lac L
	jmp i
	termin
```

Like `dispat`, but it loads cell `L` into AC first (the `dap .+2` reaches *past* the `lac L` to patch the trailing `jmp i`), so the handler receives `C(L)` in AC. (Spelled `diswith` in the body — same token by the 6-char rule.)

#### `putback U,Q` — indexed store `tab[i] := Q`

```
define	putback U,Q
	add (U
	dap .+2
	lac Q
	dac
	termin
```

`add (U` forms index+base, `dap .+2` patches the trailing bare `dac`, `lac Q` fetches the value, and `dac` stores it at `(index+U)`.

#### `copy H,I,N` — block copy of N+1 words (lines 289–300)

```
define	copy H,I,N
	law H		/ source base
	dap .+3		/ patch the lac below
	law I		/ dest base
	dap .+2		/ patch the dac below
	lac		/ <- read src[k]
	dac		/ <- write dst[k]
	idx .-2		/ bump the lac address
	idx .-2		/ bump the dac address
	sas (dac I+N	/ until dac has reached dst[N]
	jmp .-5		/ loop
	termin
```

A self-modifying copy loop: it patches a `lac`/`dac` pair with the source/dest bases, then walks both forward, incrementing the in-line addresses with `idx`, until the `dac` instruction word equals the literal `(dac I+N)` — copying `N+1` words. (Used to copy the tone tables: `copy nt, kt, 44` and `copy kt, mt, 44` at lines 1362–1363, i.e. nt → kt → mt.)

#### `search W,N,ERR` — linear table search (lines 302–315)

```
define	search W,N,ERR
	dac t1		/ stash search key
	law W		/ table base
	dap .+2		/ patch the sad below
	lac t1		/ reload key
	sad		/ <- compare against W[k]
	jmp .+5		/ match -> exit path (the lac .-6 below)
	idx .-2		/ bump the sad address
	sas (sad W+N	/ past end of table?
	jmp .-5		/ loop
	jmp ERR		/ not found
	lac .-6		/ recover the matched (sad …) instruction word
	add (-sad-W	/ AC := matched position − base = the index
	termin
```

Searches AC through `W[0..N]`. On a miss it jumps to `ERR`; on a hit it falls out to `lac .-6` / `add (-sad-W`, returning the **matched index** (the matched `sad` instruction word minus the table base, via the `(-sad-W` literal). This is how pseudo-command names and tone names are looked up (e.g. `search s2z, 25, s20` at line 848).

## I/O and error macros (not emulator-verified)

These macros emit PDP-1 I/O IOTs or call the I/O subroutines `wr`, `fee`, `ppp`, `er`, `er1`. **The TS emulator does not implement `tyo`, `rrb`, `rpa`, `cks`, `ppa`, or `ppb`**, so all bit-level behavior here is documented from standard PDP-1 / Flexowriter knowledge and is **not emulator-verified**.

| Macro | Params | Expansion | Intent |
|---|---|---|---|
| `type Q` | Q | `lio Q` / `tyo` | type one FIODEC char (low 6 bits of C(Q)) — **not emulator-verified** (`tyo`) |
| `print F` | F | `lac F` / `rcl 6s` / `tyo` / `rcl 6s` / `tyo` / `rcl 6s` / `tyo` | type the **3** FIODEC chars packed in word F (rotate each into position, type) — **not emulator-verified** |
| `write P` | P | `law P` / `jda wr` | type the string/word starting at P, via subroutine `wr` — **not emulator-verified** (`wr` → `print`) |
| `feed N` | N | `law i N` / `jda fee` | punch N blank tape lines via `fee` (`law i N` loads −N) — **not emulator-verified** (`fee` → `ppa`) |
| `compla U` | U | `lac (U` / `jda er` | a "complaint": **non-fatal** diagnostic, U = 3-char FIODEC code — **not emulator-verified** |
| `error U` | U | `lac (U` / `jda er1` | an "error" diagnostic via `er1`, U = 3-char FIODEC code — **not emulator-verified** |

`print` is worth a closer look: it `lac`s the packed word, then three times rotates the combined AC+IO left by 6 (`rcl 6s`) to bring the next FIODEC character into the low six bits of IO and `tyo`s it — so one 18-bit word holds three 6-bit Flexowriter characters. (The exact bit order in which the three chars emerge is inferred; `rcl` is rotate-combined-left, so the high-order character of `F` is delivered first.) The subroutine `wr` (lines 329–335) drives `print i wre` in a loop to type a whole string, and `fee`/`ppp` (lines 377–401) drive `ppa`/`ppb` to feed and punch the output tape. These all sit *outside* the emulated playback path. The shape of that punched output tape is the contract documented from the consumer's side in [`../../pdp1m13/docs/05-data-formats.md`](../../pdp1m13/docs/05-data-formats.md).

## Consolidated macro expansion table

One row per macro, in definition order (lines 9–325). Parameters as written; `(X` denotes a constant-pool literal. The 6-char/upper folding rule means body spellings like `complement`/`complaint`/`dispatch`/`diswith` map onto `comple`/`compla`/`dispat`/`diswit`.

| Macro | Params | Expansion | Notes |
|---|---|---|---|
| `load` | A | `lac A` | |
| `store` | A | `dac A` | |
| `addi` | A | `add A` | |
| `goto` | T | `jmp T` | |
| `govia` | P | `jmp i P` | switch-return |
| `subt` | A | `sub A` | |
| `zero` | A | `dzm A` | |
| `step1` | J | `idx J` | |
| `call` | S | `jda S` | arg in AC |
| `band` | U | `and U` | |
| `halt` | — | `hlt` | |
| `clear` | — | `cla` | |
| `comple` | — | `cma` | = `complement` |
| `halve` | — | `sar 1s` | |
| `x2to1` | — | `ral 1s` | |
| `x2to6` | — | `ral 6s` | |
| `x2to7` | — | `ral 7s` | |
| `x2to3` | — | `ral 3s` | |
| `exit` | P (ignored) | `jmp` | patched return |
| `move` | A,B | `lac A` / `dac B` | |
| `sett` | A,B | `lac (B` / `dac A` | literal B into A |
| `trze` | T | `sza i` / `jmp T` | jump if AC = 0 |
| `trnz` | T | `sza` / `jmp T` | jump if AC ≠ 0 |
| `trpl` | T | `sma` / `jmp T` | jump if AC ≥ 0 |
| `trmi` | T | `spa` / `jmp T` | jump if AC < 0 |
| `trel` | A,T | `sad A` / `jmp T` | jump if AC = C(A) |
| `trnl` | A,T | `sas A` / `jmp T` | jump if AC ≠ C(A) |
| `write` | P | `law P` / `jda wr` | I/O — not emulator-verified |
| `type` | Q | `lio Q` / `tyo` | I/O — not emulator-verified |
| `ftrel` | A,T | `trel A,T` | alias |
| `compla` | U | `lac (U` / `jda er` | complaint (non-fatal) — not emulator-verified; = `complaint` |
| `error` | U | `lac (U` / `jda er1` | error — not emulator-verified |
| `lookup` | V | `add (V` / `dap .+1` / `lac` | indexed load; patches `.+1` |
| `feed` | N | `law i N` / `jda fee` | punch N blanks — not emulator-verified |
| `step` | J,I | `lac J` / `add I` / `dac J` | |
| `stepa` | J,I | `law I` / `add J` / `dac J` | add literal I |
| `istepa` | J,I | `law i I` / `add J` / `dac J` | subtract literal I |
| `grow` | A,V,C | `lac A` / `add (V` / `dac C` | |
| `tles` | C,T | `sub C` / `spa` / `jmp T` | jump if AC < C(C) |
| `tlesc` | C,T | `sub (C` / `spa` / `jmp T` | jump if AC < literal C |
| `tgrel` | C,T | `sub C` / `sma` / `jmp T` | jump if AC ≥ C(C) |
| `tgrec` | C,T | `sub (C` / `sma+sza-skp` / `jmp T` | jump if AC > literal C |
| `test0` | Y,Z | `lac Y` / `sza i` / `jmp Z` | jump if C(Y) = 0 |
| `test1` | Y,Z | `lac Y` / `sza` / `jmp Z` | jump if C(Y) ≠ 0 |
| `testp` | Y,Z | `lac Y` / `sma` / `jmp Z` | jump if C(Y) ≥ 0 |
| `testm` | Y,Z | `lac Y` / `spa` / `jmp Z` | jump if C(Y) < 0 |
| `testel` | Y,Z,A | `lac Y` / `sad Z` / `jmp A` | jump if C(Y) = C(Z) |
| `testnl` | Y,Z,A | `lac Y` / `sas Z` / `jmp A` | jump if C(Y) ≠ C(Z) |
| `halfof` | V | `lac V` / `sar 1s` / `dac V` | |
| `double` | Q | `lac Q` / `ral 1s` / `dac Q` | |
| `dispat` | U | `add (U` / `dap .+1` / `jmp i` | computed jump; patches `.+1`; = `dispatch` |
| `diswit` | L,U | `add (U` / `dap .+2` / `lac L` / `jmp i` | load + dispatch; patches `.+2`; = `diswith` |
| `putback` | U,Q | `add (U` / `dap .+2` / `lac Q` / `dac` | indexed store; patches `.+2` |
| `answer` | X | `0` / `dap X` / `lac .-2` | subroutine prologue |
| `x10dec` | — | `ral 1s` / `dac t1` / `ral 2s` / `add t1` | AC := 10·AC |
| `copy` | H,I,N | self-modifying block copy (lines 289–300) | copies N+1 words |
| `search` | W,N,ERR | self-modifying linear search (lines 302–315) | returns matched index or → ERR |
| `print` | F | `lac F` / (`rcl 6s` / `tyo`)×3 | type 3 packed FIODEC chars — not emulator-verified |

## What this accomplishes

The macro layer (lines 7–325) gives hc1d a compact, readable instruction set on top of the bare PDP-1: typed data moves, arithmetic/stepping helpers, sense-inverted conditional jumps, a family of self-modifying table/dispatch primitives, and an I/O/error vocabulary — all anchored by the `answer`/`exit`/`call`/`govia` subroutine convention (argument in AC, result in AC, return via a `dap`-patched `jmp`). Every routine in the rest of the program is some assembly of these macros, so each later section will quote the **macro-call** form and lean on the expansions tabulated here.

Next: the **I/O and string-output runtime** (`wr`, `rp`/`rpr`, `fee`, `ppp`, and the `er`/`er1`/`red`/`blk` diagnostic machinery, lines 327–641), which is where these macros first hit real paper-tape and Flexowriter hardware.
