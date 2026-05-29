# How program flags become audio

This program never touches a DAC, a speaker register, or any audio device — the PDP-1 had none. It makes sound by setting and clearing its six *program flags* (one-bit front-panel lamps the program can toggle with the `stf`/`clf` micro-ops) at audio frequencies. The browser emulator closes the loop: the AudioWorklet runs the CPU, watches the flag register, and reconstructs a waveform from how often each flag is on. The historical machine drove an audio amplifier from the same flag bits; here `src/audio-worklet/pdp1-audio.ts` plays that role.

## The four voices are four flags

A program flag `n` occupies bit `1 << (6-n)` of the 6-bit flag register (confirmed in `cpu.ts`: `stf`/`clf` set/clear `1 << (6 - flag)`). The lowest four flags are the audio channels:

| Flag | Octal bit | Voice | Output |
|---|---|---|---|
| 1 | `40` | voice 1 | left, +0.5 |
| 2 | `20` | voice 2 | left, −0.5 |
| 3 | `10` | voice 3 | right, +0.5 |
| 4 | `04` | voice 4 | right, −0.5 |
| 5 | `02` | — | status: "voice(s) read" |
| 6 | `01` | — | status: "compiled" |

The worklet samples the register and sums per voice:

```
left  = (pf & 0o40 ?  0.5 : 0) + (pf & 0o20 ? -0.5 : 0);   // voices 1, 2
right = (pf & 0o10 ?  0.5 : 0) + (pf & 0o04 ? -0.5 : 0);   // voices 3, 4
```

The two voices on a channel contribute with *opposite polarity*: voices 1 and 2 both land on the left output, but voice 1 pushes it positive (+0.5 when its flag is on) and voice 2 pushes it negative (−0.5 when its flag is on); voices 3 and 4 do the same on the right. They are independent square waves at different pitches, not a single signal and its inverse — the opposite signs simply mean the two flag contributions sum on one channel (and partially cancel whenever both flags happen to be on at once). Mixing is plain addition, exactly as written. The result is scaled to 0.6 before output (a fixed volume trim).

## Where the flags get toggled: the player loop

The square waves come straight out of the playing loop at `lup` (`2014` octal). For each voice it adds the voice's frequency increment `f` to its phase accumulator `p`; when the 17-bit phase overflows (the add drives the sign bit), the voice flag is set instead of cleared on that pass. The first voice's slice:

```
2014  lup,  lac f1     ; AC := current voice-1 frequency increment
            add p1     ; AC := f1 + phase1  (ones-complement add)
            spa        ; skip next if AC >= 0 (no phase overflow)
            jda p1     ; OVERFLOW: store wrapped phase into p1, jump to p1+1
            dac p1     ; no overflow: store new phase
            clf 1      ; voice-1 flag OFF this pass
```

`spa` ("skip if AC ≥ 0") branches on the sign of the sum:

- **No overflow (AC ≥ 0):** `spa` skips `jda p1`, so execution falls to `dac p1` (store the advanced phase) then `clf 1` (voice-1 flag OFF).
- **Overflow (AC < 0):** `spa` does *not* skip, so `jda p1` runs. `jda` deposits AC into the cell `p1` (`2047` octal, a `0` data word that doubles as the voice-1 phase accumulator) and resumes execution at `p1+1` (`2050`), which is `stf 1` (voice-1 flag ON). Deliberately storing the still-negative wrapped value keeps the sub-cycle phase correct for the next pass.

So whether voice 1's flag goes on or off, the voice executes one store (`dac` or the `jda`'s deposit) and one flag op (`clf 1` or `stf 1`) — the same number of equal-cost instructions either way. The toggle rate — how often `stf 1`/`clf 1` alternate over many passes — is proportional to `f1`, so a larger increment overflows more often and yields a higher-pitched square wave.

The loop is **unrolled into five parallel copies** (`lup`, `p1` `2047`, `p2` `2076`, `p3` `2117`, `p4` `2132`). Each voice's `jda pN` lands at `pN+1`, the head of the next copy, which continues handling the *remaining* voices before reaching a common tail. The point is that the set-flag and clear-flag branches execute the *same number of instructions* no matter which voices overflow on a given pass. Constant loop time is the whole point: pitch is derived from loop period, so any branch that ran faster or slower would detune a voice. `isp ct` (`1664`) counts loop iterations of the current note segment; `ct` is loaded as a negative count, so each pass bumps it toward zero. While `ct` is still negative `isp` does not skip, so `jmp lup` runs and the loop repeats; when `ct` reaches zero (≥ 0) `isp` **skips** the `jmp lup` and instead runs `jmp nxt` (`1740`) to fetch the next segment.

So `stf`/`clf` on flags 1–4 in this loop *is* the sound. Nothing else generates audio.

## Why instruction timing must be accurate

Because pitch is the flag-toggle frequency, and that frequency is set by how long the player loop takes, the emulator's timing fidelity is a correctness requirement, not a nicety. `cpu.ts` `step()` (`cpu.ts:48`) charges each instruction a memory-access duration plus whatever `decodeAndExecute()` returns for the execute phase, both in microseconds. `pdp1.continue()` (`pdp1.ts:81`) steps instructions and returns the total elapsed simulated microseconds. The worklet's `process()` loop advances the CPU and accumulates `cpuRunDuration`, emitting one audio sample each time simulated time crosses the next sample point:

```
const duration = pdp1.continue() / CHM_CPU_FACTOR;
this.cpuRunDuration += duration;
...
while (this.nextSampleTime <= this.cpuRunDuration && i < leftChannel.length) {
  // pick the flag-register state nearest the ideal sample time, write a sample
  this.nextSampleTime += this.sampleDuration;
}
```

When a sample point falls between two CPU states, the worklet chooses whichever of `priorPF` / current `programFlags` is closer in time to the ideal sample instant — a nearest-neighbor resampling that keeps edges where they belong. If the loop period were even slightly off, every note would be off-pitch.

## CHM_CPU_FACTOR: modeling a real machine that runs slow

`CHM_CPU_FACTOR = 0.92559` (`pdp1-audio.ts:17`) scales the simulated durations to match the specific PDP-1 at the Computer History Museum, which runs about 7.4% slower than nominal spec. Since pitch comes from loop time, this factor *directly tunes the playback pitch* to that machine's recordings (calibrated against a known CHM performance). Each instruction's `duration` is *divided* by the factor (`pdp1-audio.ts:88`); because the factor is below 1, that makes every instruction count as *more* simulated microseconds, stretching the loop period and lowering the toggle frequency to the CHM machine's pitch. Setting it to `1` would play at textbook clock speed and noticeably higher pitch — which is why CLAUDE.md warns not to change it casually.

## The analog filter chain

The flag bits produce hard-edged square waves. The historical PDP-1's output went through a simple RC analog stage, and the client (`src/audio-client.ts`) recreates it in the Web Audio graph after the worklet node:

| Stage | Type | Cutoff | Purpose |
|---|---|---|---|
| RC lowpass | `lowpass`, Q 0.5 | 2 kHz | one-pole roll-off; rounds the square edges, tames harsh harmonics |
| DC blocker | `highpass`, Q √2⁄2 | 30 Hz | removes the DC offset / asymmetry so headphones don't pop and crackle |

The chain is `pdp1Audio → lowpass → highpass → destination` (`audio-client.ts:104`). The lowpass softens the raw bit-toggling into the characteristic mellow PDP-1 timbre; the highpass exists purely to suppress speaker pops from the residual DC component.

## Flag 6 and the breakpoint/single-step sampling protocol

Flag 6 (`01`) is the "compilation done" signal. The worklet's `musicTapeCompiled` getter (`pdp1-audio.ts:72`) just tests `programFlags & 0o1`; `process()` refuses to produce audio until it is set. The lifecycle:

1. `compile()` sets the tempo (test word), toggles sense switches, and arms a **breakpoint at `pla` (`1671` octal)** — the playback entry point — then runs the CPU full-speed. `continue()` returns the moment `pc` equals the breakpoint, so the machine runs the compiler at native speed and stops exactly where note playback begins (just before executing `pla`).
2. After the break, the worklet confirms flag 6 is set, clears the breakpoint, and switches the CPU into **single-instruction mode** (`pdp1.singleInstruction = true`). In that mode `continue()` returns after every single instruction (`pdp1.ts:88`), so the worklet can inspect the flag register at instruction granularity and resample it accurately into audio — full-speed `continue()` would skip over the fast flag transitions that *are* the waveform.

So the compile phase runs fast (no audio needed); the play phase runs one instruction at a time so the audio sampler can see every `stf`/`clf` edge. The per-voice duty cycle (fraction of time each flag was on over a ~60fps window) is also accumulated and posted as `frame-update` messages to drive the UI lamps.
