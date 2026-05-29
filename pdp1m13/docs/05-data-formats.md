# Data formats: the tape, the note stream, and the compiled segment stream

*PDP-1 Music 13* moves data through three distinct on-tape/in-core formats. They are best understood as a pipeline:

```
intermediate music TAPE  -->  rdp/rdm/rdg  -->  per-voice NOTE words in core (the "not" buffer, 2304)
per-voice NOTE words     -->  cc / c9c / cc3 (Music 13's compile pass)
                         -->  COMPILED SEGMENT stream in banks 1-2 (written by put, read by nxt at play time)
```

This is the most reference-heavy part of the program, so each format is given with a bit-field table. Several decode details are *inferred from how the code shifts and masks the bits* rather than stated in a header comment; those are flagged explicitly.

## 1. The intermediate music tape format

This tape is *Music 13*'s input, not its output: it is produced by the separate **Harmony Compiler**, which compiles a human-authored score (a custom transcription language) down to this note/bar format. *Music 13* reads it and runs a *second* compilation pass (format 3, below).

The tape is read by `rdp` (`1024`), `rdm` (`1056`), and the shared section reader `rdg` (`1114`). A tape holds, **per voice**, two *sections*: a **notes** section and a **bars** section. Each section has the same envelope:

| Order | Tape words | Read by | Meaning |
|---|---|---|---|
| 1 | one word | `rdg` (`rpb`) | **note count** N (a positive count) |
| 2 | N words | `rd1`/`rd3` (`rpb`) | the N data words (note words, or bar-pointer words) |
| 3 | one word | `rd1`/`rd3` tail | **checksum** = arithmetic (`add`) sum of the N data words |

Each word is assembled from paper tape by `rpb` (`rpb` = `730002`, three tape lines into one 18-bit word).

`rdg` is the section preamble (`jsp rdg`):

```
1114  dap rgx        / save return
      rpb            / read the count word
      dio ct
      lac ct
      sma            / count must be non-zero (sma|sza i skip past hlt unless count==0)
      sza i
      hlt            / "count too small"
      cma            / NEGATE the count (ones-complement)
      dac ct
      dzm sum        / zero the running checksum
1126  jmp .          (rgx)
```

So the count word is read positive and immediately **negated into `ct`** (`ct` is the single loop-counter cell at `1664`, shared by the tape-read loops and the player). `sma` (skip if AC<0) and `sza i` (skip if AC!=0) OR together, so the `hlt` is taken only when the count is exactly 0. The count is stored *negative* because the read loops use `isp ct` (increment-and-skip-when-non-negative): the loop counts *up* from `-N` toward 0, taking the skip exit at the last iteration. Ones-complement negate is bitwise NOT, so `-0` cannot occur for a valid positive count.

**Notes section** (`rd1`, inside `rdp`). Before the loop, `off` (`256`) is set to the current buffer pointer `ib` — the address where this voice's notes begin:

```
1024  lac nof / noe  -> dac top   / pick memory top (SW3 leaves room for DDT)
      law i 4; add ij; sma; jmp stp   / stop once 4 voices read (skip jmp while ij<4)
      jsp rdg                         / read count -> -ct, zero sum
      lac ib; dac off                 / off = base of THIS voice's notes
rd1:  rpb                             / read one note word
      dio i ib                        / store it in the tape buffer
      lac i ib; add sum; dac sum      / accumulate checksum
      idx ib                          / advance buffer ptr
      sad top; hlt                    / "too much data" guard
      isp ct; jmp rd1                 / loop N times
      rpb; dio ct                     / read checksum word
      lac sum; sas ct; hlt            / "checksum error" (sas skips the hlt iff sum==checksum)
```

**Bars section** (`rdm`/`rd3`). Same envelope, but each data word is a **bar pointer** that is rebiased by `off`:

```
1056  jsp rdg
      law b; add ij; dap rd2          / address b(ij) (voice's bar-list head)
      lac ib; dac .  (rd2)            / remember where bars start
rd3:  rpb; dio i ib
      lac i ib; add sum; dac sum      / checksum over the RAW pointer
      lac i ib
      sma                             / sma skips the add when the pointer is negative...
      add off                         / ...so a NON-negative pointer is biased by the note base
      dac i ib                        / store the (possibly biased) pointer back
      idx ib; sad top; hlt
      isp ct; jmp rd3
      rpb; dio ct; lac sum; sas ct; hlt
      idx ij; stf 5                   / next voice; flag5 = "got some data"
```

Key point: a bar pointer on tape is a **relative offset into this voice's note list**; `rdm` converts it to an *absolute* core address by adding `off` (the voice's note base). The checksum is computed over the *raw* (unbiased) pointer, before `+off`. `sma` skips if AC<0, so the `add off` runs only for a **non-negative** pointer — a *negative* bar pointer is left unbiased. That is the encoding for a special/sentinel bar pointer (the compiler later treats the bar-list specially; the exact negative-pointer semantics are not spelled out in a comment, so treat "negative bar pointer = not relocated" as the only certain claim).

`b`, `n`, `t`, `a`, `p` are the four-element per-voice arrays at `750`/`754`/`760`/`764`/`770`. `b(ij)` holds the head of voice `ij`'s bar list; the note words themselves live contiguously in the `not` buffer (`2304`) pointed at by `ib`.

## 2. The per-voice note word

The compiler's note loop is `cc` (`1317`) → `c0t`/`c0n` (`1340`/`1346`) → `c9c` (`1357`) → `cc3` (`1370`). It classifies each note word by its **top three bits** (mask `700000`):

| Classification test | Constant | Meaning |
|---|---|---|
| top 3 bits == `700000` | `(700000)` at `2265` | **tempo directive** (handled inline at `c0n`; low 15 bits = tempo) |
| whole word == `600000` | `(600000)` at `2260` | **bar line** (handled at `c9c`: counts `ceb`, zeros this voice's time) |
| anything else | — | a **real note** (unpacked at `cc3`) |

`c0n` (`1346`) fetches the word and tests for the tempo tag first:

```
1346  lac i .  (c0n)     / fetch note word via the self-modified pointer
      and (700000        / isolate the top 3 bits
      sas (700000        / sas SKIPS the next instr iff top3 == 700000
      jmp c9c            / reached only when top3 != 700000 -> not a tempo word
      xct c0n            / (top3==700000) re-fetch the FULL word
      and (77777         / low 15 bits = a tempo value
      jda tpo            / set tempo (tpg/tpm/tpx)
      idx . (c1n); jmp c0n   / advance the note ptr, fetch the next word
```

So a word whose top three bits are exactly `700000` is **not** a note: its low 15 bits (`& 77777`) are a tempo argument fed to `tpo` (`1606`), after which the loop advances and fetches the next word. `sas` skips on equality, so the in-line `jmp c9c` is reached only for words whose top 3 bits are *not* `700000`.

`c9c` (`1357`) then distinguishes a **bar line** (full word `600000`) from a real note via `sas (600000)`, and `cc3` (`1370`) unpacks a real note. **The field layout of a real note is defined entirely by the sequence of `rcl` (rotate combined AC:IO left) extractions in `cc3`.** At entry AC holds the note word; the first two `rcl 9s` rotate the combined 36-bit AC:IO a full 18 places, parking the note word in IO. Each subsequent `cla; rcl Ns` then pulls the next N high bits of IO up into AC:

```
1370  rcl 9s
      rcl 9s            / whole 18-bit note word now in IO (rotated full circle)
      xct c1n           / advance the note pointer
      cla
      rcl 2s            / top 2 bits -> articulation (high half of index)
      clf 6
      spi               / spi skips if IO sign clear; the IO sign now holds note bit 2 ...
      stf 6             / ... so flag6 = TRIPLET when note bit 2 == 1
      ril 1s            / rotate the triplet bit off the top of IO
      rcl 2s            / next 2 bits -> articulation (low half of index)
      add (cxt
      dap c0x           / patch c0x's address: (cxt + 4-bit artic index)
      cla
      rcl 6s            / next 6 bits = PITCH
      sad (1; cla       / pitch index 1 is also a rest -> force 0
      dac . (c0p)       / store pitch
      ...
      cla
      rcl 7s            / next 7 bits = DURATION in 64ths
      dac tem
```

Reconstructing the **bit field layout of a real note word** from those rotates (bit 0 = MSB; the high bits are consumed first because IO starts holding the full word and each `rcl` shifts the top bits out into AC):

| Bits (from MSB) | Width | Field | Extracted by | Use |
|---|---|---|---|---|
| 0–1 | 2 | **articulation** (high half) | first `rcl 2s` | high 2 bits of the 4-bit cxt index |
| 2 | 1 | **triplet** | `spi`→`stf 6` | sets flag 6 = triplet; selects duration scaling |
| 3–4 | 2 | **articulation** (low half) | second `rcl 2s` (after `ril 1s`) | low 2 bits of the 4-bit cxt index |
| 5–10 | 6 | **pitch** | `rcl 6s` → `c0p` | index into voice's detuned table; `0` and `1` are rests |
| 11–17 | 7 | **duration** | `rcl 7s` → `tem` | duration in 64th notes |

That accounts for all 18 bits (2+1+2+6+7). The four articulation bits are split: the first `rcl 2s` takes note bits 0–1, the intervening `ril 1s` discards the triplet bit (note bit 2, already captured into flag 6), and the second `rcl 2s` takes note bits 3–4 — so the 4-bit `cxt` index is formed from note bits {0,1,3,4}. There is no separate "real note" tag bit: a real note is simply any word that is neither tempo-tagged (top 3 == `700000`) nor the bar-line word `600000`. The exact width/order of pitch (6) and duration (7) are certain from `rcl 6s`/`rcl 7s`; the partition of the articulation/triplet bits across the two `rcl 2s` and `ril 1s` is the inferred part.

**Duration math** (`cca`, `1415`+):

```
1415  cla; rcl 7s; dac tem      / dur in 64ths
      sal 1s                     / *2
      szf i 6                    / szf i 6 SKIPS the add when flag6 is SET (i.e. triplet)
      add tem                    / NON-triplet: +tem -> *3
      clf 6                      / now have dur in 192nds
      sal 3s                     / *8 -> "precise artic" units
      sma; sza i; jmp c0n        / zero duration -> skip this note
      dac tem
```

`sal 1s` is arithmetic shift left by 1 (×2). `szf i 6` skips when flag 6 is **set**, so the `add tem` runs only for a **non-triplet** note: a normal note ends up ×3, while a **triplet skips the add and stays ×2**. Both land in a common unit of **192nds of a whole note**: a normal field is in 64ths (×3 → 192nds), a triplet field is in triplet-64ths/"96ths" (×2 → 192nds). The final `sal 3s` (×8) gives headroom for fractional articulation scaling. The trailing `sma; sza i; jmp c0n` ORs "skip if AC<0" with "skip if AC!=0", so `jmp c0n` is reached only when AC==0 (a zero-duration note is dropped and the next word fetched).

**Articulation dispatch — the `cxt` table** (`1443`). `cc3` computed `c0x` = `(cxt + index)` and now does `xct .` (execute one instruction from the table). Each table entry is one *executable* instruction per articulation class; it scales the duration in `AC` to produce the **release (silent) time**, from which the **sounding** time is derived:

```
1443  cxt:  sar 3s     / e  -> AC := dur >> 3  (release = 1/8; long note, short gap)
      sar 2s            / q  -> dur >> 2  (release = 1/4)
      sar 1s            / h  -> dur >> 1  (release = 1/2; most separation)
      hlt
      jda c58           / s  -> release = 5*dur/8 (staccato; via c58, below)
      hlt; hlt; hlt
      cla               / l  -> AC := 0   (legato: no release, full duration sounds)
      hlt; hlt; hlt
      hlt               / bar line slot
      hlt; hlt; hlt
```

`sar Ns` is arithmetic shift right (sign-preserving divide by 2^N). The classes labelled in the source are **e, q, h, s, l, bar line**. The entry computes the *release time* = how much of the note is silenced at the end: `e` removes 1/8, `q` removes 1/4, `h` removes 1/2 (most separation), `l` removes nothing (`cla`, full legato), and `s` uses the `c58` helper to remove 5/8 (staccato):

```
1463  c58:  0
      dap c5x
      lac c58; sar 2s   / x/4
      add c58           / + x  -> 5x/4
      sar 1s            / /2   -> 5x/8   (so s removes 5/8 of the note: staccato)
1471  jmp . (c5x)
```

After `c0x` produces the release time, `cc3` finishes:

```
1431  c0x:  xct .           / run the chosen cxt entry -> AC = release time
      spa; cla              / clamp negative to 0
      dac . (c1a)           / store release time into a(ij)
      cma; add tem          / note time = dur - release  (cma negates, then +tem = tem - release)
      spa; cla              / clamp
      dac . (c1t)           / store sounding time into t(ij)
      jmp c0t
```

So each note expands into two per-voice quantities: **`t(ij)` = sounding (note-on) time** and **`a(ij)` = release (note-off/silent) time**, both in the ×8 · 192nd unit. A pitch of `0`/`1` (rest) instead patches `c0x` to `(cla)` (the rest branch at `1413`: `law (cla; dap c0x`), so a rest is never "split" into note+release.

## 3. The compiled segment stream (banks 1-2)

The compiler emits a stream of fixed-shape *segments* into core banks 1-2. Each segment is **two words** written by two `jsp put` calls in `cc4` (`1530`); the player `nxt` (`1740`) consumes exactly two words per segment.

`put` (`1644`) appends `IO` to the compiled area, advancing `cb` and wrapping across banks at the bank boundary `eb`:

```
1644  put:  dap pux
      dio i cb           / store IO at the write pointer (extend-mode, 16-bit)
      idx cb
      sas eb             / sas SKIPS the normal return iff cb == end-of-bank...
1650  jmp . (pux)        / normal return (taken when cb != eb)
      add (10000; sub nof; add nog   / ...hop to start of next bank
      dac cb
      sub nog; sad (nbk*10000); jmp cpx   / if past bank 3 (30000 octal) -> "full, fail"
      add nof; dac eb
      jmp pux
```

**Segment word 1 — three packed pitches.** In `cc4`, for voices 0,1,2 the code picks the pitch index (or 0 if that voice currently has no sounding time) and packs three **6-bit pitch indices** into one word with `rar 6s`/`rcl 6s`:

```
1530  cc4: lac t;   sza; lac p     / voice0: sza skips lac p when t==0 -> rest (pitch 0), else pitch
      rar 6s; rcl 6s               / append the 6-bit pitch into IO
      lac t+1; sza; lac p+1
      rar 6s; rcl 6s               / voice1
      lac t+2; sza; lac p+2
      rar 6s; rcl 6s               / voice2
      jsp put                      / store word1 = (pitch0,pitch1,pitch2)
```

**Segment word 2 — voice-3 pitch + loop count.**

```
      lac t+3; sza; lac p+3
1553  c4m: rcr 6s                  / voice3 pitch into IO (top 6 bits)
      lac mn2; rcr 6s; rcr 6s      / mn2 = loopct/2 packed into the low 12 bits
      jsp put                      / store word2 = (pitch3, loopct/2)
```

`mn2` is `loopct/2` (computed at `cc6`, `1512`: `min * tpm` via `jda mpy`, then `scl 8s`). Halving it lets the count fit beside the pitch; the player multiplies it back by 2.

Resulting **two-word segment layout** (widths from the `rcl 6s`/`rcr 6s` counts; exact bit offsets are inferred from the rotate sequence):

| Word | Field | Width | Notes |
|---|---|---|---|
| 1 | pitch voice 1 | 6 | index into voice-1 detuned table |
| 1 | pitch voice 2 | 6 | index into voice-2 detuned table |
| 1 | pitch voice 3 | 6 | index into voice-3 detuned table |
| 2 | pitch voice 4 | 6 | index into voice-4 detuned table |
| 2 | loopct/2 | 12 | segment length; `*2` at play time gives `ct` |

The stream is terminated not by a magic word but by a **segment whose loop-count field is 0**: at the end of compilation `cpl` writes two zero words (`cli; jsp put` twice, `1136`+), and the player detects the terminator by testing that loop-count field (see below). (The `600000` constant is used in the *note* stream as the bar-line word and as the end-of-voice bar pointer; it is **not** a sentinel in the compiled segment stream.)

**Player consumption — `nxt` (`1740`).** `nxt` reads one segment (two words) and sets up the four voice frequency increments `f1..f4` (`20`..`23`) and phase accumulators `p1..p4` (`2047`,`2076`,`2117`,`2132`). The self-modify idiom here is the heart of the table lookup:

```
1740  nxt:  lio i ptr        / word1 (3 pitches) into IO
      law t6                  / t6 = 3
      rcl 6s                  / bring voice-1's 6-bit pitch up; AC = (t6<<6)|pitch
      dap .+1                 / PATCH the next instruction's address to that table cell
      lac .                   / lac (t6*100 + pitch) -> the freq increment
      dac f1
      sal 1s; add p1; dac p1  / advance voice-1 phase (by 2*increment)
      law t6+1; rcl 6s; dap .+1; lac .; dac f2   / voice-2 (table at 400)
      ...
      law t6+2; rcl 6s; dap .+1; lac .; dac f3   / voice-3 (table at 500)
      idx ptr
      lac i ptr               / word2 = (pitch3, loopct/2)
      rcr 6s                  / rotate pitch3 out into IO; AC = loopct/2
      sza i; jmp plq          / loopct/2 == 0 -> end of stream (plq: loop on SW6, else stop)
      sal 1s; cma; dac ct     / ct = ~((loopct/2)*2) = -loopct  (negated for isp counting)
      law t6+3; rcl 6s; dap .+1; lac .; dac f4   / voice-4 (table at 600)
      sal 1s; add p4; dac p4
      idx ptr
      sad eb; jmp xbk         / ptr reached end-of-bank -> advance to next core bank
```

The `law t6+v ; rcl 6s ; dap .+1 ; lac .` quartet is the key idiom: `t6 = 3`, and `(t6+v) << 6` is exactly the base address of voice *v*'s detuned table (`tab = t6*100 = 300`; voices at `300/400/500/600`, 64 entries each — see the detuned-table builder `tun`). `rcl 6s` ORs the 6-bit pitch index into the low bits, `dap .+1` writes that composed address into the very next `lac .`, and `lac .` fetches the **frequency increment** for (voice, pitch). `sal 1s` doubles the increment before adding it into the phase accumulator (the player's square-wave generation; an increment of 0 = rest = no phase motion = no flag toggling).

`ct` is set to `~((loopct/2) × 2)` = `-loopct`, negated so the play loop's `isp ct` counts up to 0 and then falls through to the next `nxt`. The end test is `sza i` (skip if AC != 0): when the segment's word-2 loop-count field is `0`, `sza i` does **not** skip, so `jmp plq` runs and ends the song (or loops on SW6). When `ptr` reaches `eb` (the bank boundary), `sad eb` fails to skip and `nxt` jumps to `xbk` (`1716`), which adds `hop`/`gap` to step the pointer to the start of the next core bank and re-enters the unrolled loop — this is how the player walks compiled data across banks 1-2 in extend mode.

## Cross-reference summary

| Routine | Octal | Role |
|---|---|---|
| `rdg` | `1114` | read section preamble: count → `-ct`, zero `sum` |
| `rdp`/`rd1` | `1024` | read a voice's notes section; sets `off` |
| `rdm`/`rd3` | `1056` | read a voice's bars section; biases non-negative pointers by `off` |
| `cc`/`c0t`/`c9c`/`cc3` | `1317`/`1340`/`1357`/`1370` | classify & unpack note words |
| `cxt`/`c58` | `1443`/`1463` | articulation scaling dispatch |
| `cc4`/`c4m` | `1530`/`1553` | pack a segment (two `jsp put`) |
| `put` | `1644` | append word to banks 1-2, wrap at bank boundary |
| `nxt`/`xbk`/`pla` | `1740`/`1716`/`1671` | play: unpack segment, set `f`/`p`, walk banks |

Constants used as tags: `(700000)`=`2265` (tempo tag, top 3 bits), `(600000)`=`2260` (bar-line note word / end-of-voice bar pointer), `(77777)`=`2266` (tempo-value mask), `(177700)`=`2264` (the "no minimum yet" sentinel in `cc`).
