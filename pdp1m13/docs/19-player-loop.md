# `2014`-`2136`: the player — the sound-generating loop (`lup`, `p1`-`p4`)

This is where the PDP-1 makes sound. There is no DAC, no timer, no sound chip — just four phase accumulators and four `clf`/`stf` instructions toggling program flags 1–4. Those flags are bits `40`/`20`/`10`/`04` of the 6-bit flag register, and the AudioWorklet (`src/audio-worklet/pdp1-audio.ts`) samples them at the audio rate, mapping each to a channel:

| flag | bit (octal) | voice | worklet sample |
|---|---|---|---|
| 1 | `40` | voice 1 | left `+0.5` |
| 2 | `20` | voice 2 | left `-0.5` |
| 3 | `10` | voice 3 | right `+0.5` |
| 4 | `04` | voice 4 | right `-0.5` |

So `stf n` / `clf n` in this loop literally is the square wave fed to the speakers. Pitch is set by *how often* each flag toggles, which is governed by per-loop arithmetic — and therefore by loop timing. That is why this routine is unrolled into five parallel copies (`lup`, `p1`, `p2`, `p3`, `p4`): every path through it executes the **same number of instructions**, so the loop period is constant and pitches are stable. Constant loop time is the whole game, and it is why instruction-level timing accuracy matters in the emulator.

## The phase-accumulator square wave (one voice)

The control path falls into `lup` from the segment setup. Each voice is handled by the same four-step idiom. Voice 1 (`2014`–`2021`):

```
2014  lac f1     AC := frequency increment for voice 1
2015  add p1     AC := f1 + p1   (advance the phase accumulator)
2016  spa        skip next if AC >= 0  (phase did NOT overflow)
2017  jda p1     overflow: store wrapped phase in p1, jump to p1+1
2020  dac p1     no overflow: store new phase
2021  clf 1      no overflow: voice-1 flag OFF
```

Each voice owns a frequency increment `f1`..`f4` (`20`–`23`, set up by `nxt`/the segment loader from the detuned tables) and a phase accumulator `p1`..`p4`. `add p1` advances the phase by the increment. The PDP-1 is ones-complement 18-bit; the sign bit (`400000`) is bit 0. As long as the running phase stays positive the accumulator just climbs.

The trick is the **overflow detection**. When the phase sum crosses into the sign bit (the 17-bit phase "wrapped"), `add` leaves AC negative. `spa` ("skip if AC ≥ 0", `cpu.ts` opcode `64`, bit `0o200`) therefore:

- **AC ≥ 0 (no wrap):** `spa` skips `jda p1`, so we fall to `2020 dac p1` (store the advanced phase) then `2021 clf 1` (flag OFF). Half-cycle low.
- **AC < 0 (wrapped):** `spa` does *not* skip, so `2017 jda p1` runs.

`jda p1` (`cpu.ts` opcode `16` with indirect bit) does two things at once: it **writes AC into `p1`** (storing the wrapped, still-negative phase) and then **jumps to `p1`+1**. Look at the listing: `p1` is the cell at `2047`, assembled as `000000` — it is a data word, used by `jda` to hold the phase. Execution resumes at `2050`:

```
2047  p1,  0       (data cell: jda deposits wrapped phase here)
2050       stf 1   voice-1 flag ON
```

So the overflow path sets the flag **on**, the non-overflow path sets it **off**. Toggling at the wrap rate produces a square wave whose frequency is proportional to the increment `f1`: a bigger increment overflows the 17-bit phase more often, giving a higher pitch. (The `jda p1` write deliberately keeps the *wrapped* negative value in `p1` rather than masking it down — the next pass's `add` continues from the correct sub-cycle phase, so there is no phase jitter at the wrap boundary.)

Note the asymmetry that makes the timing work: the no-overflow path costs `dac p1` + `clf 1`; the overflow path costs `jda p1` (which both stores and jumps) + `stf 1`. The store ops `dac` and `jda` are equal-cost memory-reference instructions, and the flags ops `clf` and `stf` are equal-cost operate-group instructions, so the two paths take the same time — and the `jda` jump lands exactly where the next instruction would have been.

## Why the loop is unrolled: `jda p1` lands in the *next* block's tail

Here is the elegant part. When voice 1 overflows, `jda p1` jumps to `2050 stf 1` — and from there, execution simply **continues straight on through voices 2, 3, and 4** in the `p1` block, which is a complete copy of the loop tail:

```
2047  p1,  0
2050       stf 1     (voice 1: flag ON instead of OFF)
2051       lac f2    \
2052       add p2     |
2053       spa        |
2054       jda p2     | voices 2,3,4 handled identically
2055       dac p2     | to the lup block
2056  p2d, clf 2     /
...
2073       isp ct
2074       jmp lup
2075       jmp nxt
```

Likewise, if voice 2 overflows it executes `jda p2`, landing at `p2`+1 = `2077 p2s, stf 2`, which begins the `p2` block — a copy that handles only voices 3 and 4. Voice 3's `jda p3` lands in the `p3` block (`2120 p3s, stf 3`, handling only voice 4), and voice 4's `jda p4` lands in the `p4` block (`2133 stf 4`, handling nothing further). The block entry points (`p1` `2047`, `p2` `2076`, `p3` `2117`, `p4` `2132`) are exactly the `jda` targets minus one.

The result: no matter which combination of voices overflow on a given pass, control threads through these blocks so that **every voice gets exactly one `add`/`spa`/store and exactly one flag instruction (`clf` if it didn't overflow, `stf` if it did), and the total instruction count per pass is identical.** Whether a flag goes high or low, the loop takes the same time. That fixed period is what keeps all four pitches rock-steady; a conventional `if`-with-branch would make the loop a few cycles longer on overflow passes and detune every voice in proportion to its own duty cycle.

This is also why the `clf`/`stf` cells must be addressable and patchable rather than hard-coded per block — see below.

## Voices wired to channels via patched `clf`/`stf` cells

Several flag instructions carry labels: `p2c` (`2027`), `p2d` (`2056`), `p2s` (`2077`), `p3c` (`2035`), `p3d` (`2064`), `p3e` (`2105`), `p3s` (`2120`). These are the cells the compiler `cpl` (`1136`) patches at compile time to assign voices to channels — including the **SW5 alto/tenor swap** (`szs 50`), which exchanges which voice drives which `clf n`/`stf n` (i.e. which audio channel a part plays on). `cpl` loads the literal instruction words `clf 2`/`stf 2` and `clf 3`/`stf 3` from its constant pool and `dac`/`dio`s the *whole instruction* into these cells (`cpl` lines, `pdp1m13.mac`); `szs 50` selects whether the `clf 3`/`stf 3` set is deposited into the `p2`-block cells (via `cp1`) or the `p3`-block cells. In the as-assembled source these cells hold `clf 2`/`clf 3`/`stf 2`/`stf 3`, but treat the *flag number* in them as runtime-determined: `cpl` rewrites them so that "voice 2" and "voice 3" can be routed to different flag bits depending on part count and the SW5 setting. The `lup`/`p1`/`p2`/`p3`/`p4` skeleton stays fixed; only the flag operands move.

## Segment loop counter and exit

Every block ends identically:

```
2044  isp ct     C(ct) := C(ct)+1; skip next if result >= 0
2045  jmp lup    loop: another pass of the player
2046  jmp nxt    fall through: this segment is done -> fetch next
```

`ct` (`1664`) is the iteration counter for the current note/segment. `isp` (`cpu.ts` opcode `46`) increments `C(ct)` (ones-complement, with `-0` normalized to `+0`) and **skips when the result is non-negative**. `ct` is loaded as a negative count, so each pass bumps it toward zero. While it is still negative, `isp` does *not* skip → `2045 jmp lup` runs and the player makes another pass (one more period of all four square waves). When `ct` finally ticks up to `0` (≥ 0), `isp` skips the `jmp lup` and falls into `2046 jmp nxt` → control leaves the player loop and `nxt` (`1740`) fetches the next compiled segment from banks 1–2. Each of the five blocks carries its own `isp ct` / `jmp lup` / `jmp nxt` tail (at `2044`, `2073`, `2114`, `2127`, `2134`) so that exactly one tail runs per pass and the loop time stays constant regardless of which block the pass exited through.

## What this routine accomplishes

`lup`/`p1`–`p4` is a four-voice software square-wave synthesizer with zero dedicated hardware. Per pass it advances four 17-bit phase accumulators by their per-voice frequency increments; each accumulator's wrap-around sets its program flag high, otherwise low. Program flags 1–4 (`40`/`20`/`10`/`04`) are sampled by the AudioWorklet into the left/right channels, so the flag-toggling rate *is* the audible pitch. The five fully-unrolled, interleaved entry blocks guarantee that every possible overflow combination executes the same number of instructions — a constant loop period — which is the sole reason the four pitches stay in tune. `isp ct` counts the passes that make up one note's duration; when the count expires the loop exits to `nxt` (`1740`) to load the next segment.
