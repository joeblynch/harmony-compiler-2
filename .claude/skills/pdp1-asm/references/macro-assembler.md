# MACRO Assembler Reference (language + this repo's toolchain)

How to write PDP-1 assembly source that the real DEC MACRO assembler accepts, and how to
assemble it in this repository. Distilled from the F-36BP *MACRO Assembly Program* manual
(1962, `pdp-1/tapes/macro/docs/PDP-1_Macro.pdf`), verified against the `pdp1m13.lst` /
`hc1d.lst` listings and `cli/assemble.ts`. All numbers octal unless marked decimal.

Contents:
1. The toolchain in this repo (commands, halt PCs, errors)
2. Source file shape (title / body / start)
3. Syllables, expressions, and the five statement contexts
4. Symbols vs pseudo-instruction names (the 3-char / 4-char rule)
5. Automatic storage: constants, variables, dimension
6. Pseudo-instructions (start, radix, repeat, character/flexo/text, noinput, expunge)
7. Macro-instructions (define … terminate)
8. MACRO's permanent vocabulary (complete table)
9. Character set: writing `.mac` files in ASCII (stand-ins, dropped chars, dialect traps)
10. Operating conventions (test word, error printouts, parity)

---

## 1. The toolchain in this repo

```
npm run pdp1 -- assemble <source.mac> [-o out.rim]
```

runs the **real 6/63 MACRO assembler tape** (`pdp-1/tapes/macro/digital-1-1a-s-mb_6-63_MACRO.bin`)
inside the cycle-accurate emulator (`src/pdp1`), with the emulated paper-tape reader,
punch, and typewriter. The pipeline (`cli/assemble.ts`):

1. Your ASCII `.mac` source is converted to a FIO-DEC tape by `cli/fiodec.ts`
   (byte-exact port of Peter Samson's `ascii2fiodec`), plus 64 lines of blank trailer.
2. MACRO is loaded via `readIn()` and halts **ready** at PC `01430`.
3. Source tape mounted; Continue runs **pass 1** → halt at `01403`.
4. Source tape rewound; Continue runs **pass 2** (punches readable title lettering, the
   binary input routine, object blocks of ≤100 words each) → halt at `01361`.
5. Continue punches the **jump block** (start address) → halt at `01377`.
6. The punch output is written to the `.rim` file (default
   `public/tapes/<name>_hc2.rim`; `public/tapes/pdp1m13.rim` stays canonical).

Any other halt aborts: **error stop** `03706` (an error line was typed — the message is
in the typewriter output), **reader empty** `01505` (source tape ran out — usually a
missing stop code after `start`). A CPU exception naming an unimplemented IOT means the
emulator lacks a device MACRO needs (exit code 2, diagnostic names the instruction).

MACRO's error printout format is `aaa bbbb ccc dddd eee` — three-letter code, octal
address, symbolic address, last pseudo-instruction encountered, offending symbol.
Codes (manual pp. 26–28; the 6/63 image's actual list is in `cli/assemble.ts`):

| Code | Meaning |
|---|---|
| `usα` | Undefined symbol (taken as zero). α = where: `a` pseudo-arg, `w` word, `c` constant, `p` parameter assignment, `m` macro definition, `l` location assignment, `r` repeat count, `s` start, `d` dummy-symbol assignment |
| `mdt` | Multiple definition of an address tag (disagrees with previous; not redefined) |
| `mdd` / `mdm` / `mdv` | Multiple definition in dimension / of a macro name (first 6 chars clash; **is** redefined) / of a variable |
| `ilp` | Parity error on the source tape (character ignored) |
| `ipi` | Illegal pseudo-instruction (rest of line ignored) |
| `ilr` | Illegal repeat (negative count; ignored) |
| `ids` | Illegal dummy symbol in a macro definition |
| `ilf` | Illegal format |
| `sce` / `tmc` / `tmv` / `tmp` | Storage capacity exceeded / too many constants / variables / parameters — assembly cannot proceed |
| `zpa` | Illegal parameter assignment |

After an error printout on pass 1, Start and Continue both resume pass 1. On pass 2,
Start resumes normally; **Continue resumes with punching suppressed**. Test word
bit 17 = auto-continue after every error (the CLI warns if set, since error stops then
can't be detected by halt address). Sense switch 6 up suppresses MACRO's own parity
checking of the source tape.

---

## 2. Source file shape

```
title line                      / punched in readable lettering on the object tape
...body: expressions...
start beg                       / end of source; punches "jmp beg" start block
```

- The **title** is the first line, terminated by the first carriage return that follows
  any non-CR character. A middle dot (`·`, ASCII `;` in this repo) in the title
  truncates the punched lettering to the characters before it.
- The **body** is a free-format string of expressions. Position and alignment mean
  nothing; `+` and space are equivalent, `tab` and `cr` are equivalent, and redundant
  delimiters collapse (3 spaces = 1 space).
- The **start line** `start expr` ends scanning and must be followed by a **stop code**
  on the physical tape (the CLI's fiodec conversion appends it; in ASCII sources the
  file just ends after the start line).
- Begin the program at a `hlt` (or start it behind one) so that after read-in the
  operator's Continue launches it — the manual's own advice, and the pattern of every
  program in this repo (`u, halt` in hc1d; the `stp`/`con` halts in m13).

## 3. Syllables, expressions, and the five statement contexts

An **expression** is one or more **syllables** joined by `+`, `-`, or space. MACRO sums
syllable values in 18-bit one's complement (`-` adds the complement). Order never
matters. Special rule: if the sum is zero but any syllable was not `+0`, the value is
**minus zero** `777777` (this is why `-0` and `-1+1` assemble to 777777).

Syllable kinds: **symbols**, **integers** (digits under the current radix, taken
modulo 2¹⁸−1), the **current-location period** `.`, **constant syllables** `(expr`,
and the pseudo-instruction syllables `character`/`flexo`/`octal`/`decimal` (the radix
pseudos have value zero and may sit inside expressions: `octal 44+decimal 27`).

Instructions are just sums: `lac i a+2` = `200000+10000+a+2`. The permanent symbol
`i` = `10000` is the defer/indirect bit — also used to make wait-mode IOT variants:
`rpa-i` = `730001-10000` = `720001` (no-wait `rpa`).

What an expression *does* depends on the character that ends it:

| Form | Name | Effect |
|---|---|---|
| `expr` + tab/cr | **Storage word** | Emit the 18-bit value at the current location; location += 1 |
| `expr/` | **Location assignment** | Set current location to the address part of expr (`100/`, `tab+120/`) |
| `expr,` | **Address tag** | Define the (single, undefined) symbol as the current location — a label. If already defined, value is checked and `mdt` printed on disagreement. Location unchanged |
| `sym=expr` | **Parameter assignment** | Define sym = value of expr (`n=100`, `sna=sza i`, `cai=cla+cli-opr`) |
| `/…` to tab/cr | **Comment** | Ignored (a slash *starting* an expression is a comment; a slash *after* one is a location assignment). **A tab inside a comment ends it** — the rest of the line assembles as code. Use spaces inside comment text (pdp1m13.mac's header comments needed their tabs converted to spaces to assemble under real MACRO) |

`.` is the current location: `sza / jmp .-1` skips a self-loop; `dap .+1` patches the
next instruction. Idioms `jmp .`, `lac .`, `dac .` mark patch slots (see
optimizations.md Part IV).

## 4. Symbols vs pseudo-instruction names — the 3-char / 4-char rule

- A **symbol** (label, parameter) is **one to three** letters and digits with at least
  one letter: `lup`, `p1`, `t6`, `cc2`, `9s`. This is why every label in the m13/hc1d
  listings is ≤3 characters. Value = 18 bits; undefined symbols read as −0 and print
  `us`.
- A **pseudo-instruction or macro name** is **four or more** letters and digits with a
  letter among the first four: `start`, `define`, `lookup`, `putback`, `x2to1`. Only
  the **first six characters** are significant (`complaint` ≡ `compla`), and any
  pseudo may be abbreviated to four (`termin` for `terminate`, `consta` for
  `constants`).

So the length of a name决定s *what it is*: `move` can only ever be a macro, `mov`
could only be a symbol. Never define a 4+-character label or a ≤3-character macro.

## 5. Automatic storage assignment

**Constants — `(expr`.** An expression in parentheses is a *constant syllable*; its
value is the **address** where MACRO stores the enclosed word. The closing `)` is
optional before comma/tab/cr (universal in real sources: `sad (dac tbe`). Constants
nest to 8 levels (`lac (add (com`). Equal-valued constants are stored **once**. They
are placed where the `constants` pseudo appears (put it once, just before `start`;
m13 uses the abbreviation `consta`). Pass 1 reserves one word per left paren, so the
constants area is followed by a small unused gap — don't place code by hand
immediately after it.

**Variables — overbar.** A symbol typed with an overbar on its first appearance
(`s̄ym`) is a *variable*; the `variables` pseudo (once, after all defining
appearances) allocates all of them sequentially, contents undefined, punching nothing.
In this repo's ASCII sources the overbar's stand-in ordering through `ascii2fiodec`
is untested — **prefer explicit `name, 0` allocations or location-counter reservations
(`b, b+4/`), exactly as pdp1m13.mac and hc1d.mac do.**

**Tables — `dimension name(len), …`.** Reserves blocks (lengths must be definite on
pass 1, names previously undefined) at the `variables` location, punching nothing.
The repo sources instead reserve with address arithmetic: `tab, tab+n/`.

## 6. Pseudo-instructions

| Pseudo | Effect |
|---|---|
| `start expr` | End of source; punch start block (`jmp expr`) |
| `octal` / `decimal` | Set radix for integers (default octal, reset to octal at each pass; usable inline as zero-valued syllables) |
| `constants` | Deposit all constant words seen since the last `constants` |
| `variables` | Allocate all variables and `dimension` blocks here |
| `dimension a(n), b(m)` | Reserve named blocks (see §5) |
| `repeat n, range` | Assemble the rest of the line (to the cr) n times. n must be non-negative and definite on pass 1; n=0 skips. Range may hold several tab-separated expressions — `repeat 18, sad (z   jsp q   z=z+z` generates a powers-of-2 test chain; `repeat 4, opr` pads; `repeat n, .-b` builds a 0..n−1 table |
| `character pX` | 6-bit concise code of X positioned by p = `r`/`m`/`l` (right/middle/left): `char ra`=61, `char mb`=6200, `char lc`=630000. A syllable — combine freely: `-char rx`, `law char r0` |
| `flexo abc` | Three concise codes packed in one word (`flexo dec` = 646563). Used for 3-letter error codes |
| `text .Any string.` | Pack a string 3 chars/word; delimiter is the first character after `text` (conventionally `.`), which cannot occur inside |
| `noinput` | Don't punch the binary input routine on the object tape |
| `expunge` | Erase the entire symbol table (including the permanent vocabulary) on pass 1 — for symbolic data tapes |

## 7. Macro-instructions

```
define
        move A,B        / name ≥4 chars; dummy symbols contain an UPPER-CASE letter
        lac A
        dac B
        terminate       / (termin)
```

- Call: `move x, y` — arguments are expressions matched by position; an omitted
  argument is **zero**. Arguments may contain constant syllables and
  `character`/`flexo`/`octal`/`decimal`. A `.` in an argument list = location where
  the macro *name* was scanned.
- The body is storage words; dummy symbols are syllables in it. Expansion substitutes
  argument values and copies the words. **A macro is words, not text** — each use
  costs its full length in core (see optimizations.md 10.2 for the hc1d macro suite
  and its per-macro word costs).
- **`R`** is an implicit dummy: the current location at expansion. Address parts
  inside a body are written `a+R` where `a,` is a tag inside the definition (tags
  inside definitions get values 0,1,2,… = offset in the body, are entered in the
  global symbol table, and so may be defined in only one macro). Using `.` inside a
  body implies `R` automatically — `jmp .-3`, `dap .+2`, `idx .-2` work as expected
  and are the common style (hc1d's `copy`/`search`).
- Macros may call macros (cascading), and dummy-symbol assignments create derived
  dummies: `C=A+B-100`, `X=X+X+X+X`.
- Definitions cost no object-program space and must precede use; put them at the top.

## 8. MACRO's permanent vocabulary (F-36BP Appendix 1)

Instruction symbols are *just predefined symbols* — redefinable (MACRO prints the old
value if you do), combinable, and usable as data. Values:

```
add 400000   sub 420000   mul/mus 540000   div/dis 560000    and  20000
ior  40000   xor  60000   lac 200000   dac 240000   dap 260000   dip 300000
lio 220000   dio 320000   dzm 340000   idx 440000   isp 460000   sad 500000
sas 520000   xct 100000   law 700000   cal 160000   jda 170000   jfd 120000
jmp 600000   jsp 620000   iot 720000   opr 760000   nop 760000   hlt 760400
xx  760400   cla 760200   cma 761000   clc 761200   cli 764000   lat 762200
lap 760300   clf 760000   stf 760010   clo 651600
skp 640000   sza 640100   spa 640200   sma 640400   szo 641000   spi 642000
szs 640000   szf 640000   szm 640500   spq 650500
ral 661000   rar 671000   ril 662000   rir 672000   rcl 663000   rcr 673000
sal 665000   sar 675000   sil 666000   sir 676000   scl 667000   scr 677000
rpa 730001   rpb 730002   tyo 730003   tyi 720004   ppa 730005   ppb 730006
dpy 730007   rrb 720030   cks 720033   esm 720055   lsm 720054
cfd 720074   cdf 720074   (1962 names; the F-16A/6/63 spellings lem 720074 and
                           eem 724074 assemble in the repo sources — m13 uses eem)
i 10000      1s 1   2s 3   3s 7   4s 17   5s 37   6s 77   7s 177   8s 377   9s 777
```

Notes worth exploiting:

- **`1s`…`9s` are the shift counts** (n ones): `sal 3s` = 665007. There is no other
  legal way to spell a count — `sal 3` would shift **twice** (3 = two ones).
- **The tape/punch/display symbols include the wait bit** (73…); subtract `i` for the
  no-wait form (`rpa-i` = 720001). `tyi` is the exception (720004).
- **`xx` = `hlt`** — the conventional patchable placeholder ("this will be modified").
- **`clf`/`stf`/`szf`/`szs` take their flag/switch number as an added address**:
  `clf 6` = 760006, `szs i 10` = 650010.
- Composed conveniences: `szm` = skip on minus **or** zero (640500), `spq` its
  reverse, `clc` = `cla+cma` (AC := 777777), `lap` = 760300 (includes the clear),
  `lat` = 762200 (includes the clear), `clo` = 651600 (clears overflow, never skips).
- The 1962 manual lists `mus`/`dis`; the 6/63 tape era uses hardware `mul`/`div` at
  the same octal values. `pdp1m13.mac` spells them `mul`/`div` (and probes at runtime
  which hardware it's on — optimizations.md 8.1).

## 9. Character set: writing `.mac` files in ASCII

Sources here are ASCII files converted by `cli/fiodec.ts` (see the FIO-DEC appendix in
cpu-instructions.md). The Flexowriter glyphs use these ASCII stand-ins:

| ASCII | Flexowriter | | ASCII | Flexowriter |
|---|---|---|---|---|
| `:` | → (upper-case 0) | | `~` | overbar (lc 56) |
| `{` | ~ (uc 3) | | `%` | \| (uc 56) |
| `}` | ⊃ (uc 4) | | `;` | · center dot (lc 40) |
| `\|` | ∨ (uc 5) | | `_` | underline (uc 40) |
| `&` | ∧ (uc 6) | | `#` | × (uc 73) |
| `!` | ↑ (uc 9) | | `@` | stop code |

- **Lower case is the working case** — labels, mnemonics, numbers. Upper case exists
  (macro dummy symbols **must** contain an upper-case letter: `A`, `B`, `N`).
- **`*` has no FIO-DEC code and no meaning to real MACRO** (expressions join by
  `+ - space` only). It is *macro1 dialect*: `tab=t6*100` and `sad (nbk*10000` in
  `pdp1m13.mac` assemble only under `macro/macro1`; the CLI drops `*` with a warning
  and the product must be precomputed (`tab=300`, `sad (30000`). The same goes for
  any other ASCII punctuation without a code — the converter warns and drops, and
  the assembled program will differ.
- `\r` is stripped; tabs are real and significant only as delimiters.

## 10. Operating conventions (console, test word)

When Start is pressed with the test address = 0, MACRO examines the **test word**:
bit 0 = obey the rest; bit 1 down/up = pass 1/pass 2; bit 2 down = reset location;
bits 3/4/5 (pass 2) = punch object tape / punch input routine / punch title;
bit 17 = auto-continue after error printouts. Example from the manual: TW `670000`,
Start = re-run pass 2 on a just-assembled tape. The CLI exposes the test word as an
option and warns about bit 17. Multiple source tapes may be processed per pass
(Start between tapes) to share library tapes — the CLI drives the single-tape case.

For the operating-side details of the machine itself (read-in, Start at 4, sense
switches, flags), see cpu-instructions.md and optimizations.md Parts VIII–IX.
