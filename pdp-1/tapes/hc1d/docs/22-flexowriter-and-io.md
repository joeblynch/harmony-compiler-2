# Flexowriter codes, I/O, and the `flexo`/`text` directives

This is a **reference** section, not a walkthrough. The note/bar handlers (sections `s1`–`s4`, `pc`/`pv*`, `er`) all funnel through a small set of paper-tape and typewriter routines, and they speak in **FIODEC** (Flexowriter) character codes throughout. Collecting those here once lets the walkthrough sections cite a single table instead of re-deriving codes inline.

It also documents the two **assembler pseudo-ops** the program uses for text — `flexo` and `text` — neither of which the on-disk macro/macro1 reimplementation supports (which is why the re-assembly reports **171 detected errors** in `hc1d.err` and why its octal addresses cannot be trusted; see [the primer's assembler note]).

Three reminders before the tables:

- Everything is **octal**, and the machine is **ones-complement** (`cma` = bitwise NOT, and a distinct `−0` = `777777` exists). See [`../../pdp1m13/docs/02-pdp1-primer.md`](../../pdp1m13/docs/02-pdp1-primer.md) for the core instruction semantics referenced below (`lac`/`dac`/`rcl`/`ril`/`rcr`/`sad`/`sas`/the skip group). This file does not re-teach them.
- This MACRO assembler is **significant to six characters and folds case to upper** (documented once in the primer); spellings like `complaint`→`COMPLA` and `flexo`→`FLEXO` resolve to the short tokens. That rule is applied silently here.
- The IOTs `tyo`, `rrb`, `rpa`, `cks`, `ppa`, `ppb` are **not implemented by the TS emulator** (`src/pdp1/cpu.ts`); their semantics below are from standard PDP-1 / Flexowriter knowledge and are flagged **(not emulator-verified)**. Of this whole I/O group the emulator implements only `rpb` and `eem` (in the `iot` group, opcode `72`) plus `lat` (which is actually in the *operate* group, opcode `76`, not an IOT).

---

## 1. FIODEC character chart

FIODEC ("Flexowriter In-Out DEC code") is the 6-bit character set the PDP-1's Flexowriter typewriter and paper-tape punch use. hc1d works in the **lower-case** set: a single 6-bit code can mean a lower-case letter, a digit/symbol, or a control function (case/ribbon shift). The chart below is assembled from three in-source sources, each cited:

- the **`s2z` translation table** comments (`hc1d.mac` lines 1147–1167) — the canonical letter/symbol decode, since each row has an author `/`-comment;
- the **pseudo-command name strings** `pn1`…`pnh` (lines 1255–1271), whose decoded ASCII is *confirmed* (`pn4 = 65 45 64 0 = "end"`, etc.);
- **scattered literals** used as masks or typed characters (`(21`, `(34`, `(35`, `(36`, `(77`, `(700`, …).

Codes with no `/`-comment anywhere in the source are marked **inferred** (consistent with the confirmed codes but not pinned by a comment) or **unknown** (genuinely undetermined — *not guessed*).

> Note: `s2z` (lines 1147–1167) lists only the 21 codes hc1d actually translates from input — `22 43 65 61 62 63 57 54 55 64 44 45 47 24 26 73 27 21 00 50 70` — so several letters (`o`=46, `r`=51, `i`=71, `k`=42, `y`=30) are **not** in `s2z` and are pinned only by the `pn*` name strings.

| Octal | Char / function | Source / note |
|---|---|---|
| `00` | space | `s2z` (line 1165, `/ space`); typed blank by `ets` (`type (0`, line 605) |
| `21` | `/` slash = **measure bar** (and title terminator) | `s2z` (line 1164, `// \|`); the program's most-tested literal (`trnl (21`, `trel (21`). Per the spec the bar the copyist types is the **slash `/`** ([*MusicCompiler-a.pdf*](../prs-docs/MusicCompiler-a.pdf), pp. 1, 8), confirmed by the title reader `pg` (line 420) reading until `21`. Earlier drafts rendered this `\|`; the `// \|` source comment is Samson marking the slash as a bar-line |
| `22` | `s` | `s2z` 1147 (`/s`); `pn1 = 22` (`"s"`) |
| `23` | `t` | not in `s2z`; pinned by `pn6/pn7/pnb/pnh` (e.g. `pn7 = 23 65 45 46 51` = `"tenor"`) |
| `24` | `u` | `s2z` 1160 (`/u`); `pn9 = 24 …` (`"units"`) |
| `25` | `?` | inferred (gap in lower-case letter run; not commented) |
| `26` | `w` | `s2z` 1161 (`/w`); `pne = 64 46 26 45` (`"down"`) |
| `27` | `x` | `s2z` 1163 (`/x`) |
| `30` | `y` | not in `s2z`; confirmed by `pna = 42 65 30` (`"key"`) and `pnc = 63 46 47 30` (`"copy"`) |
| `31`,`32`,`33` | **unknown** | appear only as raw values in the `nt` tone table (lines 1582–1587); no character comment |
| `34` | **black-ribbon shift** | typed by `blk` (`type (34`, line 639); see §2 |
| `35` | **red-ribbon shift** | typed by `red` (`type (35`, line 632); see §2 |
| `36` | error-prefix character | typed by `ec3` (`type (36`, line 615) at the head of every diagnostic; also a sentinel in `rp` (`sad (36`, line 367). FIODEC glyph **inferred/unknown** — used here as a marker, not for its glyph |
| `42` | `k` | not in `s2z`; pinned by `pna = 42 65 30` (`"key"`) |
| `43` | `l` | `s2z` 1148 (`/l`); `pn2 = 43` (`"l"`) |
| `44` | `m` | `s2z` 1157 (`/m`); `pnh = 23 65 44 47 46` (`"tempo"`) |
| `45` | `n` | `s2z` 1158 (`/n`); `pn4 = 65 45 64` (`"end"`) |
| `46` | `o` | not in `s2z`; pinned by `pn7 = 23 65 45 46 51` (`"tenor"`) and `pn8 = 61 43 23 46` (`"alto"`) |
| `47` | `p` | `s2z` 1159 (`/p`); `pnc = 63 46 47 30` (`"copy"`) |
| `50` | `q` | `s2z` 1166 (`/q`); `png = 50` (`"q"`) |
| `51` | `r` | not in `s2z`; pinned by `pn6 = 23 51 65 62 43 65` (`"treble"`) and `pnb = 51 65 22 23` (`"rest"`) |
| `54` | `-` (minus) | `s2z` 1154 (`/-`) |
| `55` | `)` / `=` (case pair) | `s2z` 1155 (`/) =`) |
| `57` | `(` / `+` (case pair) | `s2z` 1153 (`/( +`) |
| `61` | `a` | `s2z` 1150 (`/a`); `pn5 = 62 61 22 22` (`"bass"`) |
| `62` | `b` | `s2z` 1151 (`/b`) |
| `63` | `c` | `s2z` 1152 (`/c`); `pnc = 63 …` (`"copy"`) |
| `64` | `d` | `s2z` 1156 (`/d`); `pn4 = 65 45 64` (`"end"`) |
| `65` | `e` | `s2z` 1149 (`/e`); `pn3 = 65` (`"e"`) |
| `66`,`67` | **unknown** | raw values in `nt` (line 1587); no character comment |
| `70` | `h` | `s2z` 1167 (`/h`); `pnf = 70` (`"h"`) |
| `71` | `i` | not in `s2z`; confirmed by `pn9 = 24 45 71 23 22` = `"units"` (the `71` field is the `i`) |
| `72` | comment-end char | tested in `rch`/`rcu` (`trnl (72, rcu`, line 500); glyph **inferred** |
| `73` | `.` (period) | `s2z` 1162 (`/.`) |
| `74` | comment-bracket char | tested in `rch` (`trnl (74, rcc`, line 496) to detect a comment region; glyph **inferred** |
| `75`,`76` | **unknown** | raw values in `nt` (line 1587); no character comment |
| `77` | line-terminator / mask | `cr` types it (`type (77`, line 453) to start a fresh line (the routine is named for carriage-return; the glyph is the FIODEC carriage-return/delete code — **inferred**); also used as a 6-bit field mask via `law 77` (line 363) feeding `and t1` (line 364) and as a sentinel `sad (77` (line 365) |

Non-character mask literals that appear alongside FIODEC in the I/O code:

| Literal | Meaning |
|---|---|
| `(700` | punch/feed **status mask** — `and (700; sad (700` waits for the punch ready in `fee` (lines 381–382) and `ppp` (393–394) **(not emulator-verified)** |
| `(36` | error-prefix marker (see chart) |
| `(34` / `(35` | black / red ribbon shift (see §2) |
| `(13` | reader sentinel in `rp` (`sad (13`, line 369) — the FIO-DEC **"stop code"**, octal 13, written `@` in ASCII; it is a page-break / end-of-tape mark that **separates the voices** on a multi-voice tape ([*music-workflow.pdf*](../prs-docs/music-workflow.pdf), step 3). `rp` treats it as a tape control code triggering a re-read (`jmp rt2`) |
| `(117777` | field mask used outside the text path (`band (117777`, line 792) — listed only to disambiguate it from a FIODEC code; **not** a character |
| `(400000` | sign bit / `−0`-related literal (`addi (400000`, line 793) — not a character |

> The `nt` canonical-tone table (lines 1582–1587) reuses some of these octal *values* as **semitone numbers**, not characters — e.g. `31`, `32`, `66`, `67`, `73`, `75`, `76` appear there purely as pitch data. That is why those codes have no FIODEC comment: in hc1d they are never typed. (`73` is also the FIODEC period; in `nt` it is just a pitch value.)

---

## 2. The red/black ribbon mechanism

The Flexowriter has a two-color ribbon. hc1d types **normal output in black** and **errors in red**, so that a diagnostic stands out on the printed listing. The ribbon color is a *typewriter mode*, switched by typing one of two control codes (not by any per-character bit):

- `35` = **shift to red**
- `34` = **shift to black**

Because a shift code is sticky (it changes the ribbon until the next shift), hc1d tracks the current color in the variable `rb` and only emits a shift when the color actually needs to change. From the source comment (`rb, 0  /red, blk: +1 blac, -1 red.`, line 1570): **`rb = +1` means currently black, `rb = −1` means currently red.**

```
red,	answer rex          / subroutine: switch ribbon to red
	testm rb, rex       / lac rb; spa; jmp rex  -- if rb < 0 (already red) just return
	type (35            / lio (35; tyo  -- type the red-shift code  (not emulator-verified)
	sett rb, -1         / lac (-1; dac rb  -- remember we are now red
rex,	exit red            / patched jmp back to caller
```

```
blk,	answer blx          / subroutine: switch ribbon to black
	testp rb, blx       / lac rb; spa; jmp blx  -- if rb >= 0 (already black) just return
	type (34            / type the black-shift code  (not emulator-verified)
	sett rb, +1         / remember we are now black
blx,	exit blk
```

(`answer`/`exit` is hc1d's subroutine convention and `testm`/`testp`/`type`/`sett` are macros; see the macro glossary in the primer. `testm rb, rex` = `lac rb; spa; jmp rex` = "load `rb`, jump to `rex` if it is **minus**".)

The two are idempotent: calling `red` when already red, or `blk` when already black, types nothing. The error routine `er` (§4) brackets the red text between a `call red` and a `call blk`; the surrounding diagnostic framing (the `(36` prefix, the offending source characters) is typed in whichever color is appropriate, with `red`/`blk` toggled mid-message so that just the bad characters print in red while context prints black. The skip-and-jump guards make that interleaving cheap.

---

## 3. The I/O IOT reference

These are the in-out instructions the front-end uses. Most are in the `iot` opcode group (`72`); the exception is `lat`, which lives in the **operate** group (opcode `76`) and merely ORs the front-panel test word into AC. Only `rpb`, `eem`, and `lat` are implemented in `src/pdp1/cpu.ts` (the `iot` case there decodes just `eem`=`0o4074` and `rpb`=`0o0002`; everything else in `72` falls through unsupported). The rest are **(not emulator-verified)** and described from standard PDP-1 behavior. Treat every concrete bit-level claim as historical/inferred.

| IOT | Name | Group | Best-known effect | hc1d uses | Emulator? |
|---|---|---|---|---|---|
| `rpa` (often `rpa-i`, the indirect/clear form) | Read Paper-tape Alphanumeric | `iot` `72` | Strobe **one 6-bit line** from the tape reader into the reader buffer; the `-i` variant also clears IO first. **(not emulator-verified)** | `rpr` (line 340), `rp` (351) | no |
| `rrb` | Read Reader Buffer | `iot` `72` | Copy the reader buffer (the line just strobed) into **IO**. **(not emulator-verified)** | `rpr` (339), `rp` (350) | no |
| `cks` | Check Status | `iot` `72` | Read I/O device status flags into IO so a skip can test them; `rp` uses it to wait for the reader (`cks; ril 1s; spi i; jmp rt2`, lines 346–349). **(not emulator-verified)** | `rp` (346) | no |
| `rpb` | Read Paper-tape **Binary** | `iot` `72` | Assemble **one 18-bit word from 3 tape lines** (only lines with bit `200` set count; bit `100` ignored). | *(player path; here the reader uses the line-at-a-time `rpa`/`rrb` form instead)* | **yes** |
| `tyo` | Type Out | `iot` `72` | Send the low 6-bit FIODEC character in **IO** to the typewriter/punch — prints **one character**. **(not emulator-verified)** | every `type`/`print`/`write` (e.g. lines 132, 320–324) | no |
| `ppa` | Punch Paper-tape Alphanumeric | `iot` `72` | Punch **one 6-bit line** (low 6 bits of IO). Used to feed blank tape. **(not emulator-verified)** | `fee` (line 384) | no |
| `ppb` | Punch Paper-tape **Binary** | `iot` `72` | Punch **one line in binary mode**; three `ppb`s emit one 18-bit word. **(not emulator-verified)** | `ppp` (lines 396, 398, 400) | no |
| `lat` | Load Accumulator from Test word | **operate** `76` | `AC := AC OR testword` — a front-panel/switch read. Here it reads the punch/feed control switches (`lat; and (700`). | `fee` (380), `ppp` (392) | **yes** |
| `eem` | Enter Extend Mode | `iot` `72` | Sets the Extend flag (16-bit indirect). | *(setup)* | **yes** |

### Reading: `rpr`, `rp`

The simplest reader is `rpr` (lines 338–342): `rrb` (buffer→IO), `rpa-i` (strobe next line + clear), then it self-patches its own exit (`dap .+1`) and returns. `rp` (lines 344–375) is the production reader used by `ap`/`pf`/`rch`: it spins on `cks` until the reader flag is up (`spi i` = skip on the IO flag, inverted), pulls the line with `rrb`/`rpa-i`, then runs a **decode/validate** state machine that rejects control codes (the `sad (77`, `sad (36`, `sad (13` tests, lines 365–370) and halts on a truly bad character (`rtb`, line 372). One **6-bit FIODEC line per call** is returned in AC; the higher-level `rch` (line 483) reassembles those characters into the source-character buffer `f`.

### Typing: the `type`, `print`, `write` macros

All output is built from `tyo`. Three macros layer on top (definitions in the macro block):

```
type Q   =>  lio Q; tyo                       (type ONE FIODEC char held in cell/literal Q)
print F  =>  lac F; rcl 6s; tyo;              (type THREE chars packed in one 18-bit word F:
             rcl 6s; tyo; rcl 6s; tyo          rotate-combined-left 6 each time to step
                                               through the three 6-bit fields)
```

`print` is how a 3-character FIODEC packed word (the format produced by the `flexo` directive, §4) is typed: `rcl 6s` rotates the combined AC:IO left 6 bits so each successive `tyo` sees the next character in the low 6 bits of IO. `write P` (`law P; jda wr`, line 126) calls the `wr` subroutine (lines 329–336), which walks a packed-string table starting at P and `print`s each word (via `print i wre` indirected through its self-patched pointer, advancing with `idx wre` until `sas wr` detects the end) — that is how the canned messages typed via the `text` directive (§4) are printed.

### Punching: `fee`, `ppp`

`fee` (lines 377–387) **feeds N blank lines** of tape: it clears IO (`cli`) and loops `ppa` (punch one alphanumeric line of zero) N times (the count, supplied negative via `feed N` = `law i N; jda fee`, is counted up by `isp fee`), after first checking the front-panel switch (`lat; and (700; sad (700; jmp fex`) so the operator can skip feeding.

`ppp` (lines 389–401) **punches one 18-bit word as three binary lines**: it loads the word into IO and emits `ppb; ril 6s; ppb; ril 6s; ppb` — three `ppb`s with a 6-bit IO rotate between each, the mirror image of how `rpb` *reads* a word. This is the routine that writes the **intermediate music tape** the player later consumes: `pv4` (the `end` handler, lines 1309–1341) drives `ppp` to punch the note count, each note word, a checksum, then the bar count, each bar word, and a checksum. That on-tape envelope — count, N data words, arithmetic checksum, per voice — is exactly the format documented from the **consumer** side in [`../../pdp1m13/docs/05-data-formats.md`](../../pdp1m13/docs/05-data-formats.md) ("The intermediate music tape format"). hc1d's `ppp`/`feed` are the **producer** of that format; the `feed 400`/`feed 6`/`feed 300` calls in `pv4` punch the blank-tape gaps between sections that the player's reader tolerates.

---

## 4. The `flexo` and `text` assembler pseudo-ops

These are **MACRO assembler directives**, executed at assembly time to lay down packed FIODEC constants in the object program. They are *not* runtime instructions, and they are *not* among the macros defined in the `define … termin` block — the original assembler provided them built-in.

### `flexo` — pack a 3-character mnemonic into one word

Every diagnostic identifies itself by a **3-letter mnemonic** assembled with `flexo`:

```
s1z,	error flexo tmf       / error => lac (flexo tmf); jda er
te9,	complaint flexo mts   / complaint => lac (flexo mts); jda er1
```

`error X` and `complaint X` (= `compla`, the 6-char fold) are macros that do `lac (U); jda er` / `lac (U); jda er1` respectively. Their argument is `flexo tmf`, etc. The `flexo` directive takes the following token (here `tmf`, `mts`, `nps`, `bbl`, …) and **packs its three FIODEC characters into the low 18 bits of one word**, 6 bits each. At runtime the `er` routine stores that word in `arg` (`arg, 0  /er: flexo name of error`, line 1563) and types it with `print arg` (line 618), which is precisely the three-`tyo` unpack described in §3. So the round trip is: `flexo abc` packs `a`,`b`,`c` at assembly time → `print arg` types `a`,`b`,`c` at run time.

The mnemonics are intentionally cryptic 3-letter codes (`tmf`, `tff`, `unc`, `ert`, `nps`, `bbl`, `mtl`, `mts`, `aor`, …) — they are looked up by the operator in a printed crib sheet. They are **never given a symbolic definition** in the source; the *only* place each one exists is as the argument to a `flexo` at its single use site, so there is nothing to cross-reference and no address to cite.

> One genuine retype slip touches this path: line 976 reads `compalint flexo aor` — **likely a retype slip for `complaint`** (the intended macro). Because the fold is to six chars, `complaint`→`COMPLA`, but `compalint`→`COMPAL`, a *different* token, so it does **not** resolve. The re-assembly chokes on it (`hc1d.err` line `976:16 … undefined symbol "FLEXO"`, because the bad macro name swallows part of the line). Documented as written; not corrected.

### `text` — pack a string, 3 characters per word

`text` lays down an entire message as a run of packed words (3 FIODEC chars each), terminated so that `wr`/`print` can walk it:

```
s3x,	call cr
	write eha
	text /Table overflow.  Subdivide source program./
eha,	call cr
	goto u
```

The `/…/` delimiters bracket the literal string; `text` packs it into the words between the `write` and the following label (`eha` here), which `wr` then types via repeated `print`. The light-hearted banner

```
	write erq
	text /
To err is human---to forgive, divine.

/
```

(lines 573–576) is typed at the top of the first error of a run (the `write erq`/`text` pair sits just before `erq,`).

### Why the re-assembly fails on these

The on-disk **macro/macro1 reimplementation does not implement `flexo` or `text`** and is stricter about blank columns. Consequently `hc1d.err` reports, for every such line, the directive as an *undefined symbol* and then chokes on its argument:

```
hc1d.mac(573:2)   : error:  undefined symbol "TEXT"   at Loc = 00455
hc1d.mac(574:1)   : error:  undefined symbol "TO"     at Loc = 00456   (the string body, mis-parsed as code)
…
hc1d.mac(645:7)   : error:  undefined symbol "FLEXO"  at Loc = 00617
hc1d.mac(645:13)  : error:  undefined symbol "TMF"    at Loc = 00617
```

It even tries to assemble the bare title line (`undefined symbol "HARMON"…` at line 1, `Loc = 00100`). Because each `text` block emits the **wrong word count** when mis-parsed (its string body is treated as instructions), the assembler's location counter **drifts** from that point on. **This is the reason the `.lst` octal addresses are unreliable and why this entire doc set headlines sections by symbolic label + `hc1d.mac` line range, never by octal address.** The **171 detected errors** are an artifact of the modern reimplementation, not of bugs in the historical program.

---

## What this accomplishes

This file pins down the *vocabulary* of hc1d's outside world: the FIODEC codes it reads from and types to the Flexowriter, the IOTs that move bytes across the reader/punch/typewriter, the red/black ribbon convention that colors diagnostics, and the two assembler directives (`flexo`, `text`) that bake FIODEC constants into the program. Together with the producer-side punch routines (`ppp`/`feed`), it is the bridge between hc1d's internal note/bar buffers and the on-tape format the player consumes ([`../../pdp1m13/docs/05-data-formats.md`](../../pdp1m13/docs/05-data-formats.md)).

Next: the error and diagnostic machinery (`er`/`er1`, the `complaint`/`error` distinction, and how a flagged source character is echoed back in red).
