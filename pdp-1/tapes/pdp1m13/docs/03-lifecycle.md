# Lifecycle: load, read, compile, play

PDP-1 Music 13 is not one program you run once; it is a small state machine you *re-enter*. The user (here, the AudioWorklet) presses **Start** or **Continue** on the front panel, and where the program goes depends on two persistent bits — program flags 5 and 6 — that record how far the current song has progressed. This section explains those three entry points, the (flag5, flag6) state table, and how the browser drives the whole thing.

## The (flag5, flag6) state machine

The source header (`.mac` lines 173-176) is the canonical table:

| flag5 | flag6 | meaning        | Continue does      | Start@4 does           |
|:-----:|:-----:|----------------|--------------------|------------------------|
|  0    |  0    | program loaded | (nothing)          | read **first** voice   |
|  1    |  0    | voice(s) read  | compile & play     | read a **subsequent** voice |
|  1    |  1    | compiled       | play again         | read first voice (start over) |

- **flag 5** ("voice(s) read") = at least one voice tape has been read into the buffer.
- **flag 6** ("compiled") = the read voices have been compiled into banks 1-2 and are ready to play.

The two bits are not just live program-flag state; they are *backed by core memory* so they survive a halt. Cells `f5` (`0o174`) and `f6` (`0o175`) hold the saved copies. On every entry the program reconstructs the live flags from these cells via the `gfg` subroutine (`0o176`):

```
0176  gfg, dap gfx     /save return
      cla              /AC := 0
      clf 5            /assume flag 5 clear
      sas f5           /skip the next instr if AC == C(f5), i.e. if f5 == 0
      stf 5            /...so set flag 5 only when f5 != 0
      clf 6
      sas f6
      stf 6
0206  gfx, jmp .       /return
```

`sas Y` skips the following instruction when `AC == C(Y)`. With `cla` having set `AC = 0`, `sas f5` skips the `stf 5` exactly when `f5 == 0` — so a zero `f5` leaves flag 5 clear, and a nonzero `f5` falls through to `stf 5`, setting it. (Ones-complement note: the read and compile paths keep these cells normalized via `dzm`/`idx`, so the `== 0` test is unambiguous.) Conversely those paths persist progress by writing memory: `dzm f5`/`dzm f6` to reset (in `beg`), `idx f5`/`idx f6` to advance.

## Three entry points

```
                  RIM read-in (program tape loaded)
                          |
                          v
                  beg (0700)  --- one-time cold start ---
                  clf 7; dzm f5; dzm f6; jsp ini;
                  detect HW mul/div; dzm npt; -> stp (0724) halt
                          |
            +-------------+-----------------------------+
            |                                           |
       Start @ addr 4                              Continue
            | (4: jmp go)                               | (con, 0731)
            v                                           v
       go (1000)                                   eem; jsp gfg
       szs i 10  --SW1 OFF--> jmp con              (flag5,flag6) ->
       (SW1 ON: fall through to read path)          0,0: jmp stp (idle)
            |                                        1,0: compile (cpl) then
       eem; jsp gfg; advance f5/f6;                       jsp tun; jmp pla
       -> rdp (1024) read one voice                  1,1: (recompile? else) jmp pla
            |
       -> stp (0724) halt, await next press
```

**1. RIM read-in -> `beg` (`0o700`).** This runs exactly once, when the paper-tape RIM loader finishes reading the program in. The vector at address 4 is `jmp go`, but the assembler's `start beg` directive (`.mac` line 923) makes read-in land at `beg`, not `go`. `beg` does cold-start housekeeping: `clf 7` clears all program flags, `dzm f5`/`dzm f6` declare "nothing read, nothing compiled", `jsp ini` resets the buffer/output pointers (below), then it probes for optional hardware mul/div and patches the `mps`/`dvs` cells accordingly. It ends by falling into `stp` (`0o724`), which loads `ib` (or `cb` if flag 6 is set) into IO and `npt` into AC for the operator to read on the panel lights and **halts**. State is now (0,0).

**2. Start @ 4 -> `go` (`0o1000`).** Pressing Start with the address switches at 4 executes `jmp go`. The first thing `go` does is consult **sense switch 1**:

```
1000  go, szs i 10     /skip the next instr if SW1 is ON
          jmp con      /SW1 OFF -> the "play" path
          eem          /SW1 ON -> the "read tape" path
          jsp gfg
          ...advance f5/f6 based on current state...
          jmp rdp      /read one voice  (skipped into rdi for "first voice")
```

So **SW1 selects read-vs-play**: SW1 ON means "this Start press reads one more voice tape" (the `szs i 10` skip jumps over `jmp con` into the read path); SW1 OFF means "I'm done feeding voices, go compile/play" (it falls into `jmp con`). On the read path `go` restores the flags with `gfg`, then juggles `f5`/`f6` to advance the saved state. The exit from this block is a self-modify-style skip idiom: the final `szf 5` (`0o1013`) **skips** the `jmp rdp` at `0o1014` whenever flag 5 ends up clear, landing on `rdi` (`0o1015`) instead. That happens in the two "read first voice" states:

- **(0,0) loaded** and **(1,1) compiled (start over)**: flag 5 is left clear, so the skip falls into `rdi`, which `jsp ini`s the pointers and `dzm`s `npt`/`ij`/the four `b` cells — a full reset — then falls through into `rdp`. The (1,1) case additionally clears flag 6 first (forgetting the old compile).
- **(1,0) voice(s) read**: flag 5 stays set (and `idx f5` counts it), so `jmp rdp` runs and the existing buffer is preserved — this Start appends the next voice.

`rdp` (`0o1024`) then reads one voice's notes and bars through `rpb`, checksums them, and on success does `stf 5; idx f5; idx npt` before returning to `stp` to halt. Each Start@4 with SW1 on therefore appends one voice and counts it in `npt`.

**3. Continue -> `con` (`0o731`).** Continue resumes from the `stp` halt and reaches `con` (also where `go` jumps when SW1 is off). `con` is the compile-and-play driver:

```
0731  con, eem             /extend mode: 16-bit indirect across banks
           jsp gfg         /reload flags 5,6 from memory
           szf i 5         /skip if flag 5 SET (something was read)
           jmp stp         /nothing to play -> idle
           szs 20          /skip if SW2 OFF (SW2 = recompile)
           clf 6           /...SW2 ON forces a recompile by clearing "compiled"
           szf i 6         /skip if already compiled
           jsp cpl         /not compiled -> compile (sets flag 6 on success)
           ...persist f6 (dzm/idx) ...
           jsp tun         /build the 4 detuned frequency tables
           jmp pla         /play (0o1671)
```

The (1,0) state therefore *compiles then plays*; the (1,1) state skips the compile and *plays again* (unless SW2 asks for a recompile). Compilation walks the raw note/bar buffer and emits the player's compact segment stream into core **banks 1-2**, which is why `con` enters **extend mode** (`eem`) first: the player and `put` routine use single-level 16-bit indirect pointers (`ptr`, `cb`, `eb`) to hop bank-to-bank.

## Progress counters: npt, ib, cb

Three cells track how far each phase has gotten, and `ini` (`0o1635`) resets the two pointers:

| cell | addr | role |
|------|------|------|
| `npt` | `0o16` | number of parts (voices) read so far; bumped by `idx npt` per voice, zeroed at cold start and at "read first voice" |
| `ib`  | `0o25` | tape-buffer write pointer; `ini` sets it to `not` (`0o2304`), the raw notes/bars area in bank 0 |
| `cb`  | `0o253`| compiled-data write pointer into banks 1-2; `ini` sets it to `0o10000 + nog` (bank 1, offset `0o700`) |
| `eb`  | `0o254`| end-of-block, the high-water mark within the current bank; advanced by `put`/`pla` |

```
1635  ini, dap inx
           lac (10000
           add nog          /cb = 10000 + nog = 10700  (bank 1 + nog offset)
           dac cb
           law not
           dac ib           /ib = note buffer (2304)
1643  inx, jmp .
```

So a session's bookkeeping reads cleanly off the panel at the `stp` halt: `ib` = how much tape has been consumed, `cb` = how much compiled output exists, `npt` = how many voices are loaded.

## How the browser worklet drives it

`src/audio-worklet/pdp1-audio.ts` operates the front panel through the `PDP1` API, mapping each operator action onto the lifecycle above:

1. **init** (`initPDP1`): set start `address = 4`, mount `pdp1m13.rim`, call `readIn()`. RIM read-in lands at `beg` (`0o700`), runs the cold-start path, and halts at `stp`. State (0,0).
2. **per-voice read** (`loadMusic`): turn **SW1 on** (`setSenseSwitch(1, true)`), mount the song `.bin`, then call `start()` once per voice (`for i < tape.voices`). Each `start()` is a Start@4 -> `go`; SW1 ON routes to the read path (`rdi`/`rdp`), reading and checksumming one voice and advancing `f5`/`npt`. After the loop, state is (1,0).
3. **compile** (`compile`): set the test word to the song's octal tempo, turn **SW1 off**, set a **breakpoint at `pla` (`0o1671`)**, then `start()`. This is a Start@4 with SW1 off, so `go` diverts to `con`, which (state 1,0) calls `cpl`, sets flag 6, builds the detuned tables via `tun`, and reaches `pla`. The breakpoint stops the CPU exactly at the playback entry, *before* any audio loop runs. The worklet confirms success by reading flag 6 (`programFlags & 0o1`).
4. **play / sample audio**: clear the breakpoint and switch the emulator into **single-instruction mode** (`singleInstruction = true`). From here `process()` calls `pdp1.continue()` one instruction at a time, accumulating microseconds, and samples program flags 1-4 into the L/R audio buffers at the worklet's sample rate. The `clf`/`stf` on flags 1-4 inside the player loop (`lup`, `0o2014`, and its unrolled copies) *are* the four square waves.
5. **recompile** (`recompile` message): turn **SW2 on** and re-run the compile path; in `con`, `szs 20` does not skip when SW2 is on, so `clf 6` runs and the (1,1) state falls back through `cpl` to re-emit banks 1-2 at a new tempo.

A "next song" reuses the machine without re-reading the program: `loadMusic` first clears the prior song by Start@`0o700` — that address is `beg`, the cold-start entry (it re-zeros `f5`/`f6`/`npt` and re-inits the pointers, *not* the symbol `nog`, whose value 700 only happens to coincide) — then resets `address = 4`, and repeats steps 2-4.

## To play a song (step-by-step)

```
init:     address=4; mount pdp1m13.rim; readIn        -> beg, halt at stp   (state 0,0)
read v1:  SW1=on;  mount song.bin; start              -> go -> rdi/rdp, read (state 1,0)
read vN:  start  (repeat per voice)                   -> go -> rdp, read     (still 1,0)
compile:  testWord=tempo; SW1=off; bp=pla; start      -> go -> con -> cpl    (state 1,1)
          ...CPU stops at pla (0o1671) with flag6 set...
play:     bp=null; singleInstruction=on; step CPU     -> pla -> nxt -> lup, audio
```

The whole performance is the player loop spinning per-voice phase accumulators (`f1..f4` + `p1..p4`) and toggling flags 1-4 on phase overflow — sampled by the worklet into sound. When the segment stream runs out, the player jumps back through `plq` (`0o1667`); SW6 (`szs i 60` at `plq`) decides whether to loop or halt — SW6 ON re-enters `pla` to repeat, SW6 OFF falls into `jmp stp` and halts, which the worklet sees as `playback-ended`.
