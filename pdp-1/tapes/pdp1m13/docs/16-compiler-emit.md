# `1472`-`1605`: the compiler — minimum-time bookkeeping and segment emission (`cc2`/`cc6`/`cc4`)

This block is the back half of the per-segment compile loop `cc` (`1317`). By the time control reaches here the loop at `cc1` (`1323`) has already, for each voice, refilled note/articulation state and (via the `cc2`/`cc5` pair) is sweeping voice index `ij` (`255`) across all four voices. The job of this block is: (1) find the **minimum remaining time** across the four voices — the duration of the next segment; (2) scale that into a player loop count; (3) emit one compiled *segment word group* describing all four voices for that span; and (4) subtract the consumed time from every voice so the next pass measures the remainder. A "segment" is the largest stretch over which nothing changes (no voice starts a new note/articulation), so the player can hold all four pitches and just loop.

Throughout, all times are in **192nds-of-a-whole-note, ×8** (the comment at `dac min`, source line 587, reads "min 192nds * 8"). The `×8` headroom (`sal 3s`, address `1424` in the `cca`/articulation setup) lets articulation gaps land on sub-192nd boundaries without rounding.

## `cc2`/`cc5` — running minimum across voices (skip 0; keep the smaller)

`cc2` is reached from `c0t`/`c0a`/`c9c` (all in `1340`-`1367`) with AC holding **one candidate time** for the current voice `ij`: time-left-in-note, time-left-in-articulation, or `0` (a bar line / no time).

```
1472  cc2,  sza i        / skip if AC != 0
1473        jmp cc5       / 0 doesn't count
1474        sub min       / AC := AC - min
1475        sma           / skip if AC < 0  (i.e. candidate < min)
1476        jmp cc5       / >= min doesn't count
1477        add min       / restore AC := candidate
1500        dac min       / new minimum
1501  cc5,  idx ij        / next voice
1502        sas (4        / skip if ij == 4
1503        jmp cc1       / loop back for next voice
```

- `sza i` (`650100`) skips the next instruction when AC ≠ 0. (Plain `sza` skips when AC = 0; the `i` prefix inverts it.) A candidate of `0` means this voice contributes no time to the segment (it is at a rest/bar line); when AC = 0 the `sza i` does **not** skip, so `jmp cc5` runs and drops the candidate without disturbing `min`.
- `sub min` then `sma` (`640400`, skip if AC < 0) tests `candidate < min`. If the subtraction did **not** go negative, the candidate is ≥ the current minimum, so `sma` does not skip and `jmp cc5` discards it. Note the ones-complement subtraction here is a straight magnitude compare because all times are positive.
- If `candidate < min`, `sma` skips the `jmp cc5`: `add min` undoes the `sub` to recover the candidate value in AC, and `dac min` records the new running minimum.
- `cc5` advances the voice counter with `idx ij` (ones-complement increment, leaving the result in AC). `sas (4` (`522244`, skip if `AC == C(Y)`) compares the incremented `ij` against the literal `4` from the constant pool: it **skips** the `jmp cc1` when `ij == 4`. So while `ij ≠ 4` the `jmp cc1` runs and loops back to `cc1` (`1323`) to process the next voice; when `ij` reaches `4`, all voices have been measured and execution falls into the clamp at `1504`.

`min` (`1133`) was seeded to a large positive value `177700` back at `cc` (`lac (177700`, address `1320`, just after `cc` at `1317`). In ones-complement that value's sign bit is clear, so it reads as a large positive number and the first real candidate always wins.

## `1504`-`1511` — clamp the minimum against `tpx`

```
1504        lac tpx       / max per-segment fract the player can express
1505        sub min
1506        sma           / skip if (tpx - min) < 0, i.e. min > tpx
1507        jmp cc6       / min <= tpx: keep it
1510        add min       / else clamp: AC := tpx
1511        dac min       / min := tpx
```

`tpx` (`1131`, "max fract for tempo") is the largest per-segment time the player's finite loop count can represent. If `min > tpx`, the segment is too long to emit in one go, so `min` is capped at `tpx`; the remainder is picked up by the next `cc` pass (which is exactly why the time-subtraction loop at `c4o` exists). The `lac/sub/sma/add` idiom is the same "if A ≥ B keep A, else use B" magnitude test as `cc2`, run against the cap.

## `cc6` — scale by tempo multiplier `tpm` into `mn2` (loop count / 2)

```
1512  cc6,  lac min
1513        lio tpm       / tempo multiplier (set by tpo, 1606)
1514        jda mpy       / AC,IO := min * tpm  (34-bit signed product)
1515        scl 8s        / shift combined AC:IO left 8, arithmetic
1516        dac mn2       / loop ct / 2
```

- `lac min` / `lio tpm` load the two factors. `tpm` (`1132`) is the master tempo scaling computed once by `tpo` (`1606`) from the front-panel test word and the location-12 tempo fudge; it converts abstract "192nds×8" time into actual player-loop iterations.
- `jda mpy` calls the multiply routine (`mpy`, `32`): `jda` deposits AC into cell `mpy` and resumes at `mpy+1`, returning the signed 34-bit product with the high half in AC and the low half in IO.
- `scl 8s` is a combined arithmetic left shift of AC:IO by 8 (`8s` = `377` octal = 8 one-bits → 8 positions; confirmed in `cpu.ts` case `0o7000`). This selects the correct 18-bit slice of the 34-bit product — the rescale that turns the fixed-point product into an integer loop count. The result left in AC is **half** the player loop count, hence the comment "loop ct / 2" and the name `mn2` (`1134`). The stored value is in units of two iterations because the player's `nxt` (`1740`) doubles it back with `sal 1s` (`665001`, ×2) at address `1786` before negating it into the up-counting loop counter `ct` (`1664`).

## `1517`-`1602` — all-at-bar-line shortcut and combo-fetch adjustment

```
1517        law 4
1520        sad ceb       / skip if 4 != ceb
1521        jmp ca        / all 4 voices ended at a bar line
1522        law i 1       / AC := ~1 = -1 (ones-complement)
1523        add mn2       / -1 to the /2 count = 2 fewer player loops
1524        dac mn2
1525        sma           / skip if mn2 < 0
1526        sza i         / skip if mn2 != 0   (conditions OR together)
1527        jmp cc        / no time there -> recompile this segment
```

- `ceb` (`1135`, "count end bars") was incremented (`idx ceb`, address `1362`) each time a voice reported a bar line during the measure scan at `c9c` (`1357`). `law 4` / `sad ceb` (`501135`, skip if `AC != C(Y)`) compares it to 4: `sad` skips the `jmp ca` only when `4 ≠ ceb`. So `jmp ca` runs only when `ceb == 4` — if **all four** voices hit a bar line simultaneously, control jumps to `ca` (`1226`) to advance the measure rather than emit a degenerate zero-length segment.
- `law i 1` loads the ones-complement immediate `~1` = `777776` = `-1` (not `-2`). `add mn2` therefore subtracts **1** from `mn2`. Because `mn2` is the half-count (the player re-doubles it with `sal 1s`), subtracting 1 here removes **two** real player loops — the **combo-fetch adjustment**: the player spends roughly two extra iterations fetching/unpacking a new segment from compiled memory (`nxt` at `1740`, `xbk` at `1716`), so the emitted half-count is pre-decremented by 1 to keep the audible duration exact. (Source comment: "2 loops for combo fetch.")
- `sma` then `sza i` form an OR'd skip: each can independently arm the skip of `jmp cc`. `sma` arms it when `mn2 < 0`; `sza i` arms it when `mn2 ≠ 0`. The only state in which **neither** arms the skip is `mn2 = 0` (non-negative, and equal to zero) — in that single case `jmp cc` is taken: there is "no time there" and the whole segment is re-measured by jumping back to `cc` (`1317`). For any other `mn2` (positive real time, or a slightly negative over-decremented value) the skip fires and execution falls into the segment emitter at `cc4`.

## `cc4` — pack and emit the segment word group

The player consumes each segment as **two 18-bit words**: word A packs three 6-bit pitch indices (voices 1-3), and word B packs the loop count together with voice 4's pitch. `cc4` builds those two words by loading a 6-bit value into AC and rotating it into IO, then handing IO to `put` (`1644`) which deposits IO into the compiled stream.

```
1530  cc4,  lac t         / voice-1 time-left
1531        sza           / skip next if AC == 0  -> 0 means "rest"
1532        lac p         / voice-1 pitch (loaded only when time != 0)
1533        rar 6s        / rotate AC right 6
1534        rcl 6s        / rotate combined AC:IO left 6 -> push field into IO
1535        lac t+1
1536        sza
1537        lac p+1
1540        rar 6s
1541        rcl 6s
1542        lac t+2
1543        sza
1544        lac p+2
1545        rar 6s
1546        rcl 6s
1547        jsp put       / emit word A: pitch1,pitch2,pitch3
```

For each of voices 1-3 the pattern is `lac t(v)` then `sza`. `sza` (`640100`) skips the following `lac p(v)` when AC == 0 — i.e. when the voice's time-left `t(v)` is **zero**. The source comment at line 605 reads "no time = rest": a voice whose remaining time is `0` keeps the `0` already in AC (the rest value) and does **not** reload its pitch; a voice with time remaining (`t(v) ≠ 0`) does **not** skip, so `lac p(v)` loads its resolved pitch index. (This is the opposite of `sza i`. The pitch arrays `p1..p4` hold the resolved table indices set at `c0p`, `1410`, with index `0` meaning rest; here the `0`-time path simply lets that rest value `0` fall through into the packed field.)

Mechanically the packing is: `rar 6s` (rotate AC right by 6; `6s` = `077` = 6 positions) moves the low 6 bits of AC up to its high end, then `rcl 6s` rotates the 36-bit AC:IO pair left by 6, shifting that 6-bit field out of AC's top and into IO's low end. Three voices → three `rcl 6s` → IO holds `[v1][v2][v3]` across 18 bits. `jsp put` then writes IO as **word A** ("pitch, pitch, pitch", source line 619). `jsp` saves the return linkage in AC and `put` returns to the instruction after the `jsp`.

```
1550        lac t+3
1551        sza
1552        lac p+3
1553  c4m,  rcr 6s        / pitch4 -> IO (rotate combined right 6)
1554        lac mn2       / loop count / 2
1555        rcr 6s
1556        rcr 6s
1557        jsp put       / emit word B: time, pitch4
```

Word B is assembled with **right** rotates (`rcr 6s`) instead of left. After the same `lac t+3 / sza / lac p+3` selects voice 4's value, `c4m`'s `rcr 6s` rotates that 6-bit field down into IO's high end, then `lac mn2` and two more `rcr 6s` rotate the (wider) half-count into the remaining bits of IO. `jsp put` writes IO as **word B** ("time, pitch", source line 627). The opposite rotate direction from word A is intentional: it places the count in the upper field and pitch4 in the lower one, exactly where the player's `nxt` expects them.

The `c4m` label (`1553`) is the named entry of the `rcr` sequence; it is referenced as a patch/jump target elsewhere in the compiler.

> Cross-reference (data-formats / player section): `nxt` (`1740`) unpacks exactly this pair. It reads word A (`lio i ptr`) and extracts each 6-bit pitch index with `law t6+v / rcl 6s` (one per voice, `v = 0..2`), indexing the detuned frequency tables based at `(t6+v)<<6` (`300`/`400`/`500`/`600` octal). It reads word B (`lac i ptr`, address `1772`) with `rcr 6s` to recover the half-count, doubles it with `sal 1s` (×2) and applies `cma` to form the player's up-counting loop counter `ct` (`1664`), then extracts voice 4's pitch with `law t6+3 / rcl 6s`. The matching `rcl/rcr 6s` directions in `cc4` are chosen so each field lands where the player reads it. Word B's count field reaching `0` is the player's end-of-music sentinel (`nxt`, addresses `1774`-`1775`: `sza i / jmp plq` — when the count field is `0`, `sza i` does not skip and `jmp plq` ends playback).

## `c4n`/`c4o` — subtract the consumed time from every voice

Having emitted a segment of length `min`, the compiler must deduct `min` from each voice's remaining time, so the next `cc` pass measures the leftover. Per voice it deducts from the **note time** `t(v)` while the note lasts, and only when the note runs out within this segment does it instead deduct from the **articulation time** `a(v)`.

```
1560  c4n,  dzm ij        / voice index := 0
1561  c4o,  law t         / base address of t array
1562        add ij
1563        dap c4p       / patch:  c4p -> lac t(ij)
1564        dap c4q       / patch:  c4q -> dac t(ij)
1565        add (a-t      / convert t-address to a-address
1566        dap c4r       / patch:  c4r -> lac a(ij)
1567        dap c4s       / patch:  c4s -> dac a(ij)
```

This is classic PDP-1 **self-modifying address arithmetic**. `law t` + `add ij` forms the address `t+ij`; `dap` ("deposit address part") writes only the low 12 bits into the operand fields of `c4p` (`1570`) and `c4q` (`1601`), leaving their opcodes (`lac`/`dac`) intact. `add (a-t` adds the constant offset between the `a` and `t` arrays, then two more `dap`s point `c4r` (`1574`) and `c4s` (`1577`) at `a+ij`.

```
1570  c4p,  lac .         / lac t(ij)   (patched operand)
1571        sub min
1572        sma           / skip if result < 0
1573        jmp c4q       / >= 0: store remaining note time
1574  c4r,  lac .         / lac a(ij)   (patched)
1575        sub min
1576        sma           / skip the dac if result < 0
1577  c4s,  dac .         / dac a(ij)   (patched) -- store remaining artic time
1600        jmp c4x
1601  c4q,  dac .         / dac t(ij)   (patched) -- store remaining note time
1602  c4x,  idx ij
1603        sas (4
1604        jmp c4o       / next voice
1605        jmp cc        / done -> compile next segment
```

The control flow encodes "subtract `min` from note time; if that went negative, the note ended within this segment, so deduct `min` from the articulation time instead — but never drive a time below zero":

- `c4p` loads `t(ij)`, `sub min`. `sma` skips `jmp c4q` only when the result is **negative**.
- If `t(ij) - min ≥ 0` (note still has time left): `sma` does not skip, so `jmp c4q` (`1601`) stores the decremented value back into `t(ij)` via the patched `dac`, then falls to `c4x`. The articulation cell `a(ij)` is left untouched on this path.
- If `t(ij) - min < 0` (note exhausted before the segment ended): `sma` skips `jmp c4q`, falling into `c4r`, which reloads `a(ij)` (articulation/gap time) and subtracts `min`. The `sma` at `1576` then **conditionally skips** the `dac c4s`: when `a(ij) - min ≥ 0` the store runs (writing the decremented articulation time), but when `a(ij) - min < 0` the `dac` is skipped and `a(ij)` is left unchanged (the routine refuses to store a negative time). Either way control reaches `jmp c4x` (`1600`). The note-time cell `t(ij)` is left holding a now-negative value, which the next `cc2` scan treats as not a valid positive candidate, so the voice will fetch a fresh note next pass.
- `c4x` does `idx ij` / `sas (4`: `sas` skips `jmp c4o` when `ij == 4`. So while `ij ≠ 4` the `jmp c4o` (`1561`) loops back for the next voice; when `ij` reaches `4`, the `jmp c4o` is skipped and `jmp cc` (`1317`) starts the next segment.

Note that the four `dap`s at `c4o` re-patch on every voice iteration, so a single pair of patched instruction templates (`c4p`/`c4q` and `c4r`/`c4s`) services all four voices — a compact, register-free array sweep.

## What this routine accomplishes

Given four voices each carrying a remaining note time, articulation time, and pitch, this block:

1. computes the **segment length** = the smallest nonzero remaining time across the voices (`cc2`/`cc5`), capped at the player's maximum representable per-segment time (`tpx`);
2. converts that length, via the master tempo multiplier `tpm`, into a player loop count (`cc6`: `jda mpy` + `scl 8s` → `mn2`, the half-count), pre-adjusted by subtracting 1 from the half-count (two real loops) for the player's per-segment combo-fetch overhead;
3. short-circuits to measure advance (`ca`, `1226`) when all four voices hit a bar line simultaneously;
4. **emits two compiled words** — word A = pitch indices of voices 1-3, word B = half loop count + voice-4 pitch — packed with `rcl/rcr 6s` so they unpack cleanly in the player's `nxt` (`1740`); and
5. **deducts the segment length** from each voice's note time, spilling into its articulation time only when the note ends mid-segment (`c4o` self-modifying sweep), so the loop at `cc` (`1317`) can measure the next minimum-time segment until a voice needs a new note.

The output is the bank-1/2 compiled stream that the player walks at run time; the "minimum time" strategy guarantees each emitted segment is the maximal interval over which all four square-wave frequencies are constant, which is precisely what lets the unrolled player loop (`lup`, `2014`) hold a fixed `ct` and produce stable pitch.
