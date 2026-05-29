# `1663`-`2013`: the player — setup, bank hopping, and note fetch (`pla`/`xbk`/`nxt`)

This is the heart of the player. By the time control reaches here, the compiler has already laid out the compiled song as a stream of packed 18-bit words in core banks 1 and 2 (recall `cb` = compile write pointer, starting at `10000+nog`). This section does three jobs:

1. **`pla`** (`1671`) — one-time per-playthrough setup: point a fetch cursor at the start of the compiled stream, work out where each bank ends and how to jump from one bank to the next, and clear the four voice frequencies.
2. **`xbk`** (`1716`) — the bank-crossing fixup: advance the cursor past the unused tail of one bank to the start of the next, *and keep all four phase accumulators continuous* across that discontinuity.
3. **`nxt`** (`1740`) — the per-segment note fetch: unpack the next stream word into four voice pitches (looked up in the detuned tables) plus a loop count, set up `f1`..`f4` and `ct`, then fall into the playing loop `lup` (`2014`).

The actual square-wave generation happens in `lup`/`p1`..`p4` (next section); `nxt` and `xbk` only *feed* that loop.

## The four cursor globals (`1663`-`1666`)

```
1663  ptr,  0   /player fetch pointer
1664  ct,   0   /loop count
1665  hop,  0   /step from end of one bank to start of next
1666  gap,  0   /step from start of bank to end
```

| Cell | Octal | Role |
|---|---|---|
| `ptr` | `1663` | Full 16-bit fetch cursor into the compiled stream (lives in banks 1-2, so it spans the bank field). Walked by `idx ptr`. |
| `ct` | `1664` | Down-counter of *playing-loop iterations* for the current segment, stored as a ones-complement *negative*. `lup` does `isp ct` each pass; when the incremented value reaches a non-negative (sign clear) result the segment is done and control returns to `nxt`. |
| `hop` | `1665` | The increment that carries `ptr` from the *end of block* in one bank to the *first usable word of the next bank*. |
| `gap` | `1666` | The width of the usable region within a bank (start-of-bank to end-of-block); used at `xbk` to recompute `eb` for the new bank. |

These are zero-initialized in the source image; `pla` fills `hop`/`gap`/`ptr` at run time, and `nxt`/`xbk` maintain `ptr`/`ct`/`eb`.

## `plq` (`1667`): loop-on-SW6 or end

```
1667  plq,  szs i 60   / loop play on switch 6
1670        jmp stp
```

`plq` is the *end-of-song rendezvous*. `nxt` jumps here when it reads a zero loop-count terminator (see below).

- `szs i 60` — skip if sense switch 6 is **ON** (the `i` prefix inverts the normal "skip if OFF" sense). SW6 is the "loop playback" switch.
- If SW6 is on, the skip fires and we fall *past* the `jmp stp` straight into `pla` (`1671`) — i.e. we replay the song from the top.
- If SW6 is off, no skip: `jmp stp` halts at the stop entry (`stp` = `724`). Per the header note on line 711, *"jmp pla to play (jmps back to stp when done)"* — `plq`/`pla` are physically adjacent so the loop case is just "don't take the jmp."

## `pla` (`1671`): set up the cursor and bank geometry

```
1671  pla,  lac (10000   /AC := 010000  (literal at 2257)
1672        add nog       /+ nog (700) -> 10700 = first compiled word
1673        sad cb        /skip if AC != cb (where compiler put last data)
1674        jmp stp       /equal -> nothing was compiled -> halt
1675        dac ptr       /ptr := 10700
```

`(10000` is the literal at `2257` (assembled word `010000`), the base of core bank 1. `nog` (`700`) is the bottom of usable memory in each bank, so `10000+nog = 10700` is the **first compiled word of the stream**.

`sad cb` (skip-if-AC-not-equal-to `C(cb)`) is the *empty-song guard*: if the compiler never advanced its write pointer `cb` (`253`) past the start, then `cb == 10700`, the skip does **not** fire, and we execute `jmp stp` — there is no music, so halt. Otherwise we skip the halt and `dac ptr` plants the start address into the fetch cursor.

```
1676        add nof       /AC still 10700; + nof (7776)
1677        sub nog       /- nog (700)
1700        dac eb        /eb := end of block in this bank
```

AC currently holds `10700`. `eb` (`254`) = `10700 + nof − nog = 10000 + nof = 17776`, i.e. the end-of-block address in bank 1. (`nof` = `7776` is the top of usable memory per bank when DDT is absent; `nof−nog` is the bank's usable span, added to the bank-1 start.) `nxt` compares `ptr` against `eb` to detect the end of a bank.

```
1701        lac (10000    /AC := 010000
1702        sub nof       /- nof (7776)
1703        add nog       /+ nog (700)
1704        dac hop       /hop := 10000 - nof + nog
```

`hop` (`1665`) = `10000 − 7776 + 700 = 0702`. This is the **bank-crossing step**: at the end of one bank `ptr` sits at `eb` (= one bank's end-of-block). Adding `hop` advances it by `(10000 − nof) + nog` — past the bank's unused tail (`10000 − nof`, i.e. up to the next bank boundary) and then down to that next bank's first usable word (`+nog`). Because `ptr` is a full 16-bit address, this addition correctly carries into the bank-select field, moving the cursor from bank 1 into bank 2 (verified by `xbk` below; see also the extend-mode discussion).

```
1705        lac nof       /AC := nof (7776)
1706        sub nog       /- nog (700)
1707        dac gap       /gap := nof - nog = 7076
```

`gap` (`1666`) = `nof − nog = 7076` — the *usable span of a bank*. `xbk` adds this to the new bank's start to recompute `eb` for that bank.

```
1710        cla            /AC := 0
1711        dac f1
1712        dac f2
1713        dac f3
1714        dac f4         /clear the four voice frequency increments
1715        jmp nxt        /go fetch the first segment
```

`cla` (operate micro-op, AC:=0) followed by four `dac`s zeroes the per-voice frequency increments `f1`..`f4` (`20`-`23`) so playback starts silent until `nxt` loads real pitches. Then jump to `nxt`.

## `xbk` (`1716`): cross a core-bank boundary, preserving phase

`xbk` is reached from `nxt` (`jmp xbk` at `2013`) when the cursor has just hit `eb`, i.e. the current bank is exhausted. On entry **AC holds the `ptr` value itself** (an address, = `eb`), placed there by the `idx ptr` at the tail of `nxt`; the source comment at `1716` reads "(ptr in AC)". Note this is the *pointer value*, not `C(ptr)` (the word it points at).

```
1716  xbk,  add hop        /AC := ptr + hop  (advance into next bank)
1717        dac ptr        /ptr := next bank's first usable word
1720        add gap        /+ gap (usable span)
1721        dac eb         /eb := new bank's end of block
```

`add hop` carries the cursor from this bank's `eb` to the next bank's first usable word (the `0702` step computed in `pla`, which ripples into the bank-select bits). `add gap` then forms `ptr + gap` = the new bank's end-of-block, stored in `eb`. So after `xbk` the `ptr`/`eb` pair describes the *new* bank exactly as `pla` set them up for the first one.

```
1722        lac f1
1723        add p1
1724        dac p1
1725        lac f2
1726        add p2
1727        dac p2
1730        lac f3
1731        add p3
1732        dac p3
1733        lac f4
1734        add p4
1735        dac p4         /p_v += f_v  for all four voices
```

This block is the subtle part. The playing loop `lup` advances each phase accumulator `p1`..`p4` (`2047`,`2076`,`2117`,`2132`) by its frequency increment `f` once per pass and emits a flag edge when that accumulator overflows into the sign bit. Reaching a bank boundary makes `nxt` detour to `xbk` *instead of* falling into `lup`, so the one `p += f` pass that `lup` would have done for this segment is skipped. The four `lac f / add p / dac p` triples manually perform that missed `p += f` for every voice — note they add the **plain** increment `f` (one `lup` pass), not the *doubled* increment that `nxt`'s per-voice unpack adds. This keeps the waveform phase continuous across the bank gap so there is no audible click. (It advances phase but does **not** toggle the voice flags, since `xbk` runs once per gap, not per audio sample.)

```
1736        nop            /with a cycle to spare!
1737        jmp lup        /resume the playing loop
```

The lone `nop` (`760000`) carries the comment *"with a cycle to spare!"*: it is padding so the `xbk` detour lands the loop period close to a normal `lup` pass, keeping the bank crossing from perturbing pitch. `jmp lup` re-enters the unrolled playing loop.

## `nxt` (`1740`): fetch and unpack the next segment

`nxt` consumes the packed stream. Each segment occupies **two** stream words: the first packs three 6-bit voice-pitch indices (voices 1-3), the second packs the loop count together with the fourth voice's pitch. (Cross-reference the segment word format produced by the compiler in the `cc`/`c4*` section, `1317`-`1602`.)

```
1740  nxt,  lio i ptr      /IO := C(ptr)  -- first packed word
1741        law t6          /AC := t6 (=3) : table selector for voice 1
1742        rcl 6s          /rotate AC:IO left 6 -> top 6 bits of IO into AC<12:17>
```

`lio i ptr` loads the packed word **indirectly through the full 16-bit cursor**. The program runs in **extend mode** (`eem` was executed at startup), so indirect addressing is *single-level but full-width*: the emulator computes `ma = C(ptr) & 0o177777` (cpu.ts, the extend branch of the indirect resolver), meaning `ptr` can point anywhere across banks 1-2 without chaining indirect words. This is exactly why the player can walk a data stream that lives outside bank 0.

The unpack idiom, repeated once per voice (with the per-voice offset `v` = 0..3), is:

```
law t6+v          /AC := 3+v  (zero-based table-base selector for voice v+1)
rcl 6s            /rotate the next 6-bit pitch field of IO up into low AC
dap .+1           /patch the operand of the following lac to the assembled address
lac .             /lac (table_base<<6 + pitch)  -> read detuned frequency
dac f_v           /f_v := that frequency increment (NOT doubled)
sal 1s            /AC <<= 1  (double a copy of the increment, for the phase bump)
add p_v           /+ current phase
dac p_v           /p_v := phase nudged by one doubled increment
```

Step by step for voice 1 (`1741`-`1750`):

- `law t6` puts the **table selector** `t6 = 3` in AC. The detuned tables for voices 1-4 live at `(t6+v)<<6` octal (`v` = 0..3): `300`, `400`, `500`, `600`. (`tab = t6*100 = 300`.)
- `rcl 6s` rotates the combined 36-bit `AC:IO` left by 6 (`6s` = `77` octal = 6 one-bits → 6 places; see the `rcl` case in cpu.ts). The top 6 bits of `IO` (this voice's pitch field) move into the low 6 bits of `AC`. AC now holds `((t6+v) << 6) | pitch` — precisely the address of this voice's entry in its detuned table (`t6+v` is the table base in units of 64, `pitch` the index within it). Index 0 in each table is a rest.
- `dap .+1` (`1743`) is the **self-modify**: `dap` deposits AC's low 12 bits into the *address part* of the next word (`.+1` = `1744`), preserving its opcode. The next word is `lac .` (`1744`), assembled as `lac 1744`; after the `dap` patch its operand becomes the computed table address. This is how a single `lac` reads from a *computed* location without an index register.
- `lac .` (`1744`) now executes as `lac <table entry>`, loading the 18-bit frequency increment into AC.
- `dac f1` (`1745`) stores it as voice 1's increment — *un-doubled*. `f1` is the value the playing loop adds once per pass.
- `sal 1s` (`1746`) shifts AC arithmetic-left by 1 (sign preserved; `sal` case in cpu.ts), i.e. **doubles** the increment in AC (it does not change `f1`).
- `add p1` / `dac p1` (`1747`/`1750`) nudges voice 1's phase accumulator by that doubled increment. This applies a one-time phase bump at the start of each segment so phase stays coherent when the pitch changes.

The identical block repeats for voice 2 (`1751`-`1760`, selector `t6+1`, table `400`) and voice 3 (`1761`-`1770`, selector `t6+2`, table `500`).

```
1771        idx ptr        /ptr := ptr+1  (advance to the SECOND packed word)
              /0 in IO
1772        lac i ptr      /AC := C(ptr)  = (loopct/2, pitch4) packed word
1773        rcr 6s         /rotate AC:IO right 6 -> low 6 bits (pitch4) into IO top, loopct/2 into AC
1774        sza i          /skip if AC != 0
1775        jmp plq        /AC == 0 -> end of song -> plq (loop or stop)
```

- `idx ptr` (`1771`) ones-complement-increments the cursor and stores it back, stepping to the segment's **second** word. (The comment "0 in IO" notes that IO is now empty — the three pitch fields have been rotated out.)
- `lac i ptr` (`1772`) loads that second word indirectly (again full-width, via extend mode). Its layout is **`loopct/2` in the high bits, voice-4 pitch in the low 6 bits**.
- `rcr 6s` (`1773`) rotates `AC:IO` right by 6, dropping the low 6 bits (voice-4 pitch) down into the top of `IO` (where the subsequent `rcl 6s` at `2002` will pick it up) and leaving `loopct/2` in `AC`.
- `sza i` (`1774`) skips if `AC != 0`. A zero loop-count is the **end-of-stream terminator**: if `AC == 0` the skip does *not* fire and `jmp plq` (`1775`) goes to the end-of-song handler (loop on SW6, else halt). Otherwise we skip past it and continue.

```
1776        sal 1s         /AC := (loopct/2) * 2  = loopct
1777        cma            /AC := ~AC  (ones-complement negate)
2000        dac ct         /ct := -(loopct)
```

The loop count is stored halved (each segment count covers two `lup` passes), so `sal 1s` doubles it back to the true iteration count. `cma` (operate, AC:=~AC) **ones-complement negates** it, and `dac ct` stores the negative count into `ct` (`1664`). The playing loop uses `isp ct` ("increment and skip when the result is non-negative"): starting from a negative value, `ct` counts up toward 0, and the segment ends when the incremented value reaches a non-negative result — a classic ones-complement up-counting loop.

```
2001        law t6+3       /selector for voice 4, table 600
2002        rcl 6s         /pitch4 (sitting in IO top after the rcr) -> low AC
2003        dap .+1
2004        lac .          /lac (600 + pitch4)
2005        dac f4         /f4 := voice-4 frequency increment
2006        sal 1s
2007        add p4
2010        dac p4         /p4 phase nudge, as for the other voices
```

This is the same unpack idiom one more time for **voice 4**, selector `t6+3` (table `600`). The voice-4 pitch was parked in the top of `IO` by the earlier `rcr 6s`, so `rcl 6s` brings it into AC; `dap .+1`/`lac .` self-modify-reads its detuned frequency into `f4`, and `sal 1s`/`add p4`/`dac p4` applies the same one-time phase bump.

```
2011        idx ptr        /ptr := ptr+1  (past the second word -> next segment)
2012        sad eb         /skip if ptr != eb
2013        jmp xbk        /ptr == eb -> end of bank -> cross to next bank
```

- `idx ptr` (`2011`) advances the cursor past the just-consumed second word, leaving it at the next segment; AC now holds the new `ptr` value.
- `sad eb` (`2012`, skip-if-AC-not-equal) — AC currently holds the freshly incremented `ptr` value (from `idx`). If `ptr == eb` (we've reached this bank's end-of-block) the skip does **not** fire and `jmp xbk` (`2013`) crosses into the next bank (with AC = `ptr`, exactly what `xbk` expects on entry). If `ptr != eb` the skip fires past the `jmp`, falling into `lup` (`2014`) to play the segment we just unpacked.

## What this routine accomplishes

`pla` initializes a full-width fetch cursor over the compiled note stream in banks 1-2 and precomputes the arithmetic (`hop`, `gap`, `eb`) needed to treat the two banks as one logical stream. `nxt` then repeatedly unpacks two stream words into four detuned-table frequency increments (`f1`..`f4`) plus a ones-complement loop count (`ct`), using the `law t6+v` / `rcl 6s` / `dap .+1` / `lac .` self-modify idiom to index per-voice tables without an index register, and falls into the audio-generating loop `lup` (`2014`). `xbk` handles the seam between banks: it re-points the cursor at the next bank, recomputes `eb`, manually advances all four phase accumulators by their (plain, un-doubled) increments so the waveform stays phase-continuous across the gap, and pads the path with a `nop` so the bank crossing stays close to cycle-neutral — keeping pitch steady. Extend mode is what makes the whole scheme possible: every `lio i ptr` / `lac i ptr` resolves a single-level full 16-bit pointer, so the player can sweep data that lives entirely outside its own bank 0.
