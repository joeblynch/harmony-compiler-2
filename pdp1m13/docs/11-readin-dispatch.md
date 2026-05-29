# `700`-`747`: read-in entry, hardware detection, and the Continue dispatch (`beg`/`stp`/`con`)

This block is the program's spine: the one-time RIM read-in entry (`beg`, `700`), a self-test that patches the multiply/divide routines to use either hardware or software (`703`-`723`), a front-panel status/halt point (`stp`, `724`), and the **Continue** dispatcher (`con`, `731`) that decides — from the flag-5/flag-6 state machine — whether to read another voice, recompile, or play.

## `beg` (`700`): one-time read-in entry

The RIM loader's last action drops the PC here exactly once, when the program tape is read in. The source even labels it: `/come here on readin only`.

```
700  beg,  clf 7      / clear ALL program flags (1..6)
701        dzm f5     / flag-state cell f5 := 0  (nothing read in)
702        dzm f6     / flag-state cell f6 := 0  (nothing compiled)
703        jsp ini    / call ini (1635): initialize pointers
```

- `clf 7` (operate group, `760007`) clears all six program flags at once. Since flags 1-4 are the four audio voices and flags 5-6 are status, this guarantees a silent, blank slate.
- `dzm f5` / `dzm f6` zero the two software shadow cells `f5` (`174`) and `f6` (`175`). These mirror the (flag5, flag6) state pair from the header table; `gfg` (`176`, called later from `con`) re-derives the live program flags from them. Setting both to 0 selects the **`(0,0)` "program loaded"** row of the state machine.
- `jsp ini` calls the pointer-initialization subroutine `ini` (`1635`). `jsp` saves return linkage in AC and jumps; `ini` resets the compile/read buffer pointers before any voice is read.

## `703`-`712`: probe for hardware multiply

`mul` and `div` are *optional* PDP-1 hardware. Where they are absent, the program must fall back to the step-ops `mus`/`dis` (a 21-/22-iteration software shift-add). The probe runs the real opcode once and inspects the result to decide which path to wire in.

```
704        law 10     / AC := 10 (octal immediate)
705        cli        / IO := 0
706        mul (10    / AC,IO := AC * C(literal 10) = 10 * 10 = 100 (octal)
707        lio (skp   / IO := skp   (640000 = "never skip")
710        sza        / skip next if AC == 0
711        lio (skp i / IO := skp i (650000 = "always skip")   [skipped when mul present]
712        dio mps    / store IO into cell mps (patch the mul dispatch)
```

- `law 10` loads the small immediate `10` into AC; `cli` clears IO. The `mul (10` multiplies AC by the literal `10` held in the constant pool (the `(` syntax assembles to `542247`, an address into `consta`).
- **Why `sza` distinguishes hardware from software:** real `mul` returns the signed 34-bit product as AC(high):IO(low). The product `10 * 10 = 100` octal is tiny, so it lands entirely in the low word IO; the **high word AC comes back 0**. (This matches the emulator's `mul`, which shifts the magnitude right by `WORD_LENGTH-1` into AC — for a small product that high part is 0.) The non-existent-hardware case would instead execute the bits of `mul (10` as the `mus` step-op, which would leave a non-zero AC. So **`AC == 0` means genuine `mul` hardware is present.**
- The two `lio (...)` instructions stage a skip-constant in IO: first `skp` (`640000`), then — only if `sza` did **not** skip, i.e. AC was non-zero (software case) — overwrite it with `skp i` (`650000`). After the probe, `dio mps` deposits whichever constant survived into the patch cell `mps` (`35`).
- The two constants encode opposite skip behavior in this core: `skp` (`640000`) has no condition bits set, so it **never skips**; `skp i` (`650000`) sets the indirect bit, which inverts the (empty) condition, so it **always skips**. The `mps` cell sits just before the multiply routine's hardware shortcut: with hardware present, `mps` = `skp` never skips and control falls through to `jmp mpu` (the hardware path at `mpu`, `111`); without hardware, `mps` = `skp i` always skips over that `jmp` and into the `repeat 21, mus mp2` software loop.

## `713`-`723`: probe for hardware divide

```
713        cla        / AC := 0
714        lio (200   / IO := 200 (octal)  -> sets up a 35-bit dividend
715        div (10    / divide (AC,IO) by literal 10; SKIPS on success
716        opr        / no-op landing slot (the div "overflow" return)
717        lio (skp   / IO := skp   (640000)
720        spa        / skip next if AC >= 0 (sign bit clear)
721        lio (skp i / IO := skp i (650000)            [skipped when div present]
722        dio dvs    / store IO into cell dvs (patch the div dispatch)
723        dzm npt    / npt := 0  (number of parts read = 0)
```

- `cla` / `lio (200` build a clean dividend: AC(high) = 0, IO(low) = `200`. `div (10` divides by the literal `10`. Hardware `div` **skips on success** and leaves a positive quotient in AC; on overflow it does **not** skip and leaves AC unchanged. The `opr` at `716` is the harmless instruction landed on by the (here unused) non-skip/overflow return; on success the skip jumps past it to `717`.
- **Why `spa` distinguishes hardware from software:** with real `div`, the small dividend yields a small **positive quotient**, so AC is non-negative and `spa` skips. If hardware were absent, the `div (10` bits would instead run as the `dis` step-op, leaving AC in a state whose sign bit is set (negative). So **`AC >= 0` means genuine `div` hardware is present.** As before, `spa` skipping leaves IO = `skp` in place; otherwise `lio (skp i` overwrites it, and `dio dvs` patches `dvs` (`125`) — the analogous skip-gate guarding `jmp dvu` (the hardware divide at `dvu`, `162`) versus the `repeat 22, dis dv1` software loop.
- `dzm npt` zeroes `npt` (`16`), the running count of parts (voices) read in, completing first-time initialization.

> **Emulator note:** this core implements `mul` (opcode `0o54`) and `div` (opcode `0o56`) but does **not** implement the step-ops `mus`/`dis`. Both probes therefore behave exactly like real hardware (`AC == 0` after `mul`, `AC >= 0` after `div`), so `mps`/`dvs` are always patched to `skp` and **the hardware path is always taken**; the `repeat 21`/`repeat 22` software blocks never execute. The `mus`/`dis` mnemonics show as `UD` (undefined) on lst lines 58 and 118 — a re-assembly artifact, harmless to runtime behavior.

## `stp` (`724`): front-panel status, then HALT

```
724  stp,  lio ib     / IO := C(ib): tape buffer ptr (where read up to)
725        szf 6      / skip next if flag 6 is CLEAR
726        lio cb     / IO := C(cb): where compiled up to   [skipped if flag6 set]
727        lac npt    / AC := number of parts read
730        hlt        / HALT
```

This is a status display, meant for a human reading the PDP-1's console lights: it leaves a useful pair in the AC/IO lights before halting. `lio ib` loads the read pointer `ib` (`25`); then `szf 6` (`640006`, skip if flag 6 clear) conditionally swaps in the compile pointer instead — **if flag 6 is set (a song is compiled), `szf 6` does not skip and `lio cb` (`253`) runs**, so IO shows the compile high-water mark; if nothing is compiled it skips and IO keeps the read pointer. `lac npt` puts the voice count in AC, then `hlt` (operate group, the `0o400` bit) stops the processor.

In the browser worklet `hlt` literally clears the CPU `running` flag — this is how the worklet detects "nothing to play" / end-of-phase and is the breakpoint-style stop the driver expects after a Start@4 read pass.

## `con` (`731`): the Continue dispatch

This is where pressing **Continue** lands (the worklet's compile phase reaches here via `go` -> `con`). It re-establishes extend mode, rebuilds the live flags from the shadow cells, and then runs the (flag5, flag6) state machine.

```
731  con,  eem        / Enter Extend Mode
732        jsp gfg    / call gfg (176): set program flags from f5/f6 memory cells
733        szf i 5    / skip if flag 5 is SET  (the "i" inverts szf)
734        jmp stp    / else -> stp: nothing to play, halt
```

- `eem` (`724074`) enters Extend mode so all subsequent indirect references are single-level full-16-bit pointers — required for the player to walk compiled data across core banks 1-2.
- `jsp gfg` calls `gfg` (`176`), which loads the live program flags from the `f5`/`f6` shadow cells set by `beg` (and updated by reads). After this the hardware flags reflect the current state-machine row.
- `szf i 5` is `szf 5` with the indirect/invert bit: **skip if flag 5 is set**. Flag 5 = "voice(s) read". If flag 5 is clear we are in row **`(0,0)` "program loaded"** — nothing has been read, so there is nothing to play; control falls to `jmp stp` and halts. If flag 5 is set (rows `(1,0)` or `(1,1)`) we skip the `jmp stp` and proceed.

```
735        szs 20     / skip if sense switch 2 is OFF
736        clf 6      / clear flag 6 (force recompile)    [run only if SW2 ON]
737        szf i 6    / skip if flag 6 is SET
740        jsp cpl    / else compile (sets flag 6 on success)  [run if flag6 clear]
```

- `szs 20` tests **sense switch 2** ("recompile"): it skips when SW2 is **off**. With SW2 on it does *not* skip, so `clf 6` runs and clears flag 6 — discarding any "already compiled" status to force a fresh compile. (The worklet drives SW2 for its `recompile` message.)
- `szf i 6` skips if flag 6 is **set** (already compiled, row `(1,1)`). If flag 6 is set we are compiled, so we skip the compile call and go straight to play. If flag 6 is clear (row `(1,0)`, "voice(s) read" but not yet compiled, or just forced clear by `clf 6`), `jsp cpl` calls the compiler `cpl` (`1136`). `cpl` sets program **flag 6 on success** — this is the same `01`-bit the AudioWorklet polls to learn that compilation finished.

```
741        dzm f6     / f6 := 0
742        szf 6      / skip if flag 6 is CLEAR
743        idx f6     / f6 := f6 + 1   (only if flag 6 SET)
744        szf i 6    / skip if flag 6 is SET
745        jmp stp    / else -> stp (compile failed: nothing to play)
746        jsp tun    / call tun (212): build the 4 detuned freq tables
747        jmp pla    / jump to the player pla (1671)
```

- `dzm f6` then the `szf 6` / `idx f6` pair **copies the live flag-6 bit back into the shadow cell `f6`**: zero it, and if flag 6 is now set (`szf 6` does not skip) `idx f6` increments it to 1. This persists the post-compile state so a later `gfg` can restore it. (`idx` is ones-complement increment with `-0` normalized to `+0`.)
- `szf i 6` re-checks flag 6: if it is **not** set, compilation failed (or never happened), so `jmp stp` halts with the status display. If flag 6 is set we have a playable song and skip the `jmp stp`.
- `jsp tun` calls `tun` (`212`), which builds the four slightly detuned per-voice frequency tables at `300`/`400`/`500`/`600` from the base table `pt` (`2137`). This is done just before playback because the detune amount depends on `tuw`.
- `jmp pla` enters the player `pla` (`1671`) — the unrolled per-voice phase-accumulator loop that toggles flags 1-4 to make sound. This is exactly the address the worklet breakpoints at before single-stepping for audio.

## State-machine mapping

| (f5, f6) | row meaning | path taken in `con` |
|---|---|---|
| (0, 0) | program loaded | `szf i 5` fails (flag 5 clear) -> `jmp stp` (halt; nothing to play) |
| (1, 0) | voice(s) read | flag 5 set, flag 6 clear -> `jsp cpl` (compile), then `jsp tun` + `jmp pla` (play) |
| (1, 1) | compiled | flag 5 set, flag 6 set -> skip `cpl`, fall through to `jsp tun` + `jmp pla` (play again) |
| any, SW2 on | recompile request | `clf 6` forces flag 6 clear, so `jsp cpl` re-runs before playing |

## What this routine accomplishes

`beg` (`700`) initializes the machine exactly once at read-in: it clears all flags, zeros the `(f5,f6)` state to "program loaded", and resets pointers via `ini`. It then **self-configures** the multiply and divide routines by running each opcode once and inspecting AC (`AC == 0` after `mul`, `AC >= 0` after `div` ⇒ hardware present), patching `mps` (`35`) and `dvs` (`125`) with `skp`/`skp i` to select the hardware shortcut or the software step loop — in this emulator the hardware path always wins. `stp` (`724`) is a console status-and-halt point. `con` (`731`) is the Continue brain: it enters extend mode, rebuilds the flags, and runs the `(flag5, flag6)` state machine to dispatch among *halt (nothing read)*, *compile-then-play*, and *play-again*, honoring sense-switch 2 to force recompilation, before handing off to the detune builder `tun` (`212`) and the audio player `pla` (`1671`).
