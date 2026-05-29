# `174`-`206`: reading flags 5 and 6 from memory (`gfg`)

PDP-1 program flags are a shared, transient resource: this program toggles flags 1-4 continuously to make sound, clears every flag with `clf 7` at the read-in entry `beg` (`700`), and even reuses flag 6 as a scratch "triplet" bit while compiling. So the live hardware flags 5 and 6 cannot be trusted to remember anything across phases. But *PDP-1 Music 13* uses flags 5 and 6 as the two-bit lifecycle state machine described in the program header — `(flag5,flag6)` = `(0,0)` loaded, `(1,0)` voice(s) read, `(1,1)` compiled — and that state must survive across Start/Continue presses. The program therefore keeps a *persistent memory copy* of each flag in a data cell (`f5`/`f6`), treats those cells as the source of truth, and re-derives the live hardware flags from them on entry to each phase. `gfg` is the **read side** of that mechanism: it copies cells `f5`/`f6` back into the live program flags 5 and 6. (The write side lives in `beg`/`con`/`go` near `731`-`1000`, which `dzm`/`idx` these cells as the program advances; see the `jsp gfg` callers at `con` and `go`.)

## The two backing-store cells

```
174  f5,  0
175  f6,  0
```

`f5` (`174`) and `f6` (`175`) are plain one-word data cells, assembled as `000000`. They hold the saved state of flags 5 and 6. Elsewhere the compiler/reader writes these cells when it advances the state machine (e.g. `dzm f5`/`idx f5` to count voices read); here we only consume them. A nonzero value means "flag was set"; zero means "flag was clear". (The actual value stored isn't a single bit — `f5` is `idx`-incremented as voices are read, so it can exceed 1 — only its zero/nonzero status matters to `gfg`. See the `sas` discussion below.)

## Subroutine entry and the return-address stash

```
176  gfg,  dap gfx
177        cla
```

`gfg` is a `jsp` subroutine (called as `jsp gfg`). On entry, `jsp` has already left the return linkage in AC. The first instruction is the standard idiom:

- `176  dap gfx` — assembled `260206`. `dap` deposits only the **address part** (low 12 bits) of AC into the cell `gfx` (`206`), preserving that cell's opcode/indirect bits. `gfx` is the exit instruction `jmp .`; patching its address field turns it into "jump back to the caller". This is the classic self-modifying-code return: `dap gfx` writes the return target into the `jmp` at `gfx`. The opcode-preserving mask (`& 0o770000` in the emulator's `dap` at `cpu.ts:268`) is exactly why only the address is overwritten and the `jmp` opcode survives.

- `177  cla` — assembled `760200` (operate group, bit `0o200` clears AC, per `cpu.ts:204`). AC is set to 0. This matters for the comparisons that follow: every `sas` below compares against a **zero** AC, so each test reduces to "is the saved cell nonzero?"

## Restoring flag 5

```
200  clf 5
201  sas f5
202  stf 5
```

- `200  clf 5` — assembled `760005` (operate group, `clf` with flag field `5`; in the emulator this clears bit `1 << (6-5)` = `02` octal of the flag register, `cpu.ts:208-221`). Start from a known state: program flag 5 is forced **off**.

- `201  sas f5` — assembled `520174`. `sas` (skip if AC equals `C(Y)`, `cpu.ts:398`) compares AC against `C(f5)`. Because `cla` set AC = 0, this skips the next instruction precisely when `f5 == 0`, i.e. when the saved flag was clear.

- `202  stf 5` — assembled `760015` (`stf` flag `5`, sets bit `1 << (6-5)` = `02`). This is the "flag 5 should be on" branch.

Putting it together: if `f5` is **zero**, `sas` skips over `stf 5`, leaving flag 5 cleared by the earlier `clf 5`. If `f5` is **nonzero**, `sas` does *not* skip and `stf 5` runs, setting flag 5. Net effect: program flag 5 ends up matching the truthiness of the saved cell `f5`. The `clf`-then-conditional-`stf` shape is the standard PDP-1 way to drive a flag from a value: there is no "set flag from AC" instruction, so the code clears unconditionally and re-sets only when needed.

## Restoring flag 6

```
203  clf 6
204  sas f6
205  stf 6
```

Identical logic for flag 6:

- `203  clf 6` — `760006`, force flag 6 off (clears bit `1 << (6-6)` = `01` octal).
- `204  sas f6` — `520175`, skip the next instruction if `C(f6) == 0` (AC is still 0 from the `cla` at `177` — nothing in between touched AC).
- `205  stf 6` — `760016`, set flag 6 (bit `01`), reached only when `f6` is nonzero.

So flag 6 likewise comes to mirror the saved cell `f6`. Flag 6 (`01`) is the same bit the AudioWorklet polls to detect "compilation finished", which is why keeping its persistent value coherent matters.

## Return

```
206  gfx,  jmp .
```

`gfx` (`206`) is the exit. As assembled it reads `600206` (`jmp` to itself), but `dap gfx` at entry overwrote its address field with the caller's return address, so at run time it jumps back to the instruction after the `jsp gfg`. This is the `jsp`/`dap` return convention used throughout the program: the call site supplied the linkage, entry stashed it into this `jmp`, and the routine ends by executing it.

## What this routine accomplishes

`gfg` re-materializes the persistent lifecycle state — held in the ordinary memory cells `f5` (`174`) and `f6` (`175`) — into the live PDP-1 program flags 5 and 6. Those hardware flags are unreliable between phases: `beg` (`700`) clears them all with `clf 7`, the player constantly toggles flags 1-4 to synthesize sound, and the compiler borrows flag 6 as a scratch triplet bit. For each flag `gfg` clears unconditionally, then (with AC pre-zeroed by `cla`) uses `sas` to set the flag only when the corresponding cell is nonzero. It is the read half of the `(flag5,flag6)` state machine: callers invoke `jsp gfg` at the `con` (`731`) and `go` (`1000`) entry points to recover "where in the load → read → compile → play lifecycle am I?" after a Start/Continue, while the matching write-side code updates `f5`/`f6` when the program transitions between those states.
