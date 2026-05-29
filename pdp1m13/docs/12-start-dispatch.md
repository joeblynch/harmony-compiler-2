# `750`-`1023`: per-voice arrays, the Start dispatch (`go`), and voice init (`rdi`)

This section covers three things in order: the five per-voice state arrays (`750`-`773`), the `go` entry point at `1000` that the front-panel **Start@4** lands in, and the all-voices reset path `rdi` (`1015`-`1023`).

## The per-voice arrays `b`/`n`/`t`/`a`/`p` (`750`-`773`)

The source defines five labels, each immediately followed by a `+4/` re-origin. The construct

```
b,
b+4/
```

declares `b` at the current location counter and then advances the counter to `b+4`, reserving the four cells `b`, `b+1`, `b+2`, `b+3` without emitting any words for them (they're left at their loaded value; the program zeroes them explicitly later). The listing shows the running addresses: `b=750`, `n=754`, `t=760`, `a=764`, `p=770` (each block is 4 cells, one per voice; voice index `ij` runs 0..3). The listing line for `b+4/` carries the assembled value `000754` — that's just the location counter (`= n`), not a stored word.

| Array | Addr (octal) | Per-voice role | Comment in source |
|---|---|---|---|
| `b` | `750`-`753` | bar pointer — where this voice is reading in the compiled bar stream | `/bar pointer` |
| `n` | `754`-`757` | note pointer — current note within the bar | `/note pointer` |
| `t` | `760`-`763` | time left in the current note | `/time left in note (192 * 8)` |
| `a` | `764`-`767` | time left in the current articulation | `/time left in artic (192 * 8)` |
| `p` | `770`-`773` | pitch (frequency-table index for this voice) | `/pitch` |

The `192 * 8` comment on `t` and `a` documents the time unit: a whole note is `192` ticks (`192` is divisible by `2,3,4,6,8…`, so it represents halves, quarters, triplets, etc. exactly), and the `*8` is the sub-tick resolution used for articulation/duration accounting. These two arrays are countdown timers, decremented as a voice plays. (This `192 * 8` reading is an interpretation of the source comment; the comment itself only states the unit.)

Note these five arrays are *playback*/compile bookkeeping; they are distinct from the audio-generating phase accumulators `p1`-`p4` (`2047`+) and frequency increments `f1`-`f4` (`20`-`23`) described elsewhere. `p` here is a *pitch index*, not a phase.

## `go` — the Start@4 dispatch (`1000`-`1014`)

Pressing **Start** with the front-panel address set to `4` runs the entry vector at `4`-`7` (four `opr` no-ops, assembled `760000`), which falls through to `10  jmp go` and lands here at `go` (`1000`). `go` is also where the assembler's "set test address to here" directive (`1000/`) points the default start address.

```
1000  go,  szs i 10   /come here on Start
1001       jmp con    /switch 1 to read tape
```

`szs i 10` is a skip-on-sense-switch with the indirect/invert bit set (assembled `650010`). Plain `szs 10` (operand `0o10`; the sense-switch field is `(0o10 & 0o70) >> 3 = 1` → SW1) means "skip if SW1 is **off**"; the `i` prefix inverts it to **"skip if SW1 is ON"** (confirmed in `cpu.ts`: the skip group sets `skip` when `!(ss & 1<<(6-sense))`, then `skip ^ indirect` decides the actual skip). So:

- **SW1 ON** → skip `jmp con` and fall through to `eem` at `1002`. The browser worklet turns SW1 *on* during the read phase, so this is the "read a voice from tape" path.
- **SW1 OFF** → execute `jmp con` (`con` = `731`), the compile-and-play continue path.

This is the front-panel branch between *reading tape* and *compiling/playing*. With SW1 on we continue:

```
1002       eem            /enter extend mode
1003       jsp gfg         /get flags from memory
```

`eem` (`724074`) sets the Extend-mode flag (`cpu.ts` sets `this.extend = 1`). The compiled data lives across core banks 1-2, so the player/reader runs in extend mode for full 16-bit single-level indirects that can cross 4K banks.

`jsp gfg` calls the "get flags 5,6 from memory" subroutine at `gfg` (`176`). `gfg` reconstructs program flags 5 and 6 from their software shadow cells `f5` (`174`) and `f6` (`175`), because the live program flags don't survive a Start (the front panel restores PC, not the flags — and the player constantly toggles flags 1-4, while `beg` cleared all flags at read-in). `gfg` is:

```
176  gfg,  dap gfx     /patch its own return jump
177        cla          /AC := 0
200        clf 5        /force flag 5 off
201        sas f5       /SKIP next if AC == C(f5), i.e. if f5 == 0
202        stf 5        /reached only when f5 != 0  -> set flag 5
203        clf 6
204        sas f6
205        stf 6
206  gfx,  jmp .       /return (address patched by dap gfx)
```

The intent: flag *n* is set iff its shadow `fn` is non-zero. With `AC = 0`, `sas f5` **skips when AC == C(f5)**, i.e. when `f5 == 0`, jumping over the `stf 5` and leaving the flag cleared by the preceding `clf 5`. When `f5 != 0` it does **not** skip, so `stf 5` runs and the flag is set. Net effect: `flag5 = (f5 != 0)`. Same for flag 6. The `dap gfx` / `gfx, jmp .` pair is the standard `jsp` return idiom: the entry `dap gfx` writes the caller's return address into the address field of the `jmp .` at `gfx`, leaving its opcode intact. (See the dedicated `174`-`206` (`gfg`) section for the full treatment.)

Back in `go`, with flags 5 and 6 now reflecting the loaded state, the program runs the **lifecycle state machine** that decides whether this Start is reading the *first* voice or a *subsequent* voice. Note that **each skip skips exactly one instruction**, so the conditional in `szf 6` covers only the single `clf 5` that follows it:

```
1004       szf 6        /skip 1005 if flag 6 CLEAR
1005       clf 5
1006       dzm f5
1007       szf 5        /skip 1010 if flag 5 CLEAR
1010       idx f5
1011       clf 6
1012       dzm f6
1013       szf 5        /skip 1014 if flag 5 CLEAR
1014       jmp rdp      /read a (subsequent) voice
```

Walking it with the documented `(flag5,flag6)` states (`00`=loaded, `10`=voice(s) read, `11`=compiled):

- `szf 6` (`1004`) skips **one** instruction — `clf 5` (`1005`) — when **flag 6 is clear**. So `clf 5` runs only when flag 6 is *set* (state `11`, a finished compile): a Start after a completed song clears the live flag 5 so the run below begins reading a fresh first voice. When flag 6 is clear (`00` or `10`), only `clf 5` is skipped — the live flag 5 keeps whatever `gfg` just restored.
- `dzm f5` (`1006`) executes **unconditionally** (it is not under the `szf 6` skip): the `f5` *shadow* is always zeroed here. The live flag 5, by contrast, was only cleared in the `11` case above.
- `szf 5` (`1007`) skips `idx f5` (`1010`) when **flag 5 is clear**. So:
  - first voice (flag 5 clear, states `00` and the post-`clf 5` `11`): `idx f5` is skipped; the shadow `f5` stays `0`.
  - subsequent voice (flag 5 set, state `10`): `idx f5` runs, incrementing the just-zeroed shadow to `1` so it is non-zero again.
  (The genuine *per-voice accumulation* of the voice count happens later in `rdp` at `1111`-`1112`, which does `idx f5` and `idx npt` after each voice is read; here `f5` is merely zeroed and, in the subsequent-voice case, set back to `1`.)
- `clf 6` / `dzm f6` (`1011`-`1012`) then force flag 6 and its shadow to 0: reading a voice means we are no longer in the "compiled" state, so the lifecycle drops back to `(1,0)` = "voice(s) read".
- `szf 5` (`1013`) is the actual branch that selects the read path: it skips the `jmp rdp` at `1014` when **flag 5 is clear**, landing on `rdi` at `1015`; when flag 5 is set it falls into `jmp rdp` (`rdp` = `1024`). Because `idx f5` only ran in the subsequent-voice case, this resolves to: first voice → `rdi` (`1015`); subsequent voice → `rdp` (`1024`).

So the dispatch resolves to: **first voice → `rdi` (`1015`, full init then read); subsequent voice → `rdp` (`1024`, read into the next slot)**, with `f5`/`f6` updated to reflect the new `(1,0)` "voice(s) read" lifecycle state.

## `rdi` — initialize all voices (`1015`-`1023`)

```
1015  rdi,  jsp ini     /initialize pointers
1016        dzm npt     /number of parts := 0
1017        dzm ij      /start with voice 0
1020        dzm b
1021        dzm b+1
1022        dzm b+2
1023        dzm b+3
```

`jsp ini` calls the pointer-init subroutine at `ini` (`1635`). `ini` resets the two compile/read cursors: `cb` (compile write pointer) := `10000 + nog` = `10700` octal = start of the bank-1 compile output area, and `ib` (tape-buffer pointer) := `not` (`2304`, the raw note buffer; loaded via `law not`). It uses the same `dap inx` / `inx, jmp .` return idiom.

The four `dzm` then clear the global accounting cells and the bar-pointer array:

- `dzm npt` (`16`) — number of parts/voices read so far := 0.
- `dzm ij` (`255`) — voice index := 0, so reading starts with voice 0.
- `dzm b … dzm b+3` (`750`-`753`) — zero all four bar pointers, so every voice starts with no bar data.

Only the `b` array is cleared here (the other arrays `n`/`t`/`a`/`p` are initialized later, per-voice, as data is read in `rdp`). After `1023` control falls straight into `rdp` (`1024`, `lac nof`), which reads the first voice's data from the tape into the per-voice slot selected by `ij`.

## What this routine accomplishes

It is the **front-panel Start@4 dispatcher**. Reading flags from the software shadows `f5`/`f6` (via `gfg`, `176`), it implements the loaded → voice-read → compiled lifecycle: SW1 routes between *read tape* (here) and *compile/play* (`con`, `731`); the flag-5/flag-6 logic distinguishes the **first** voice (take `rdi` at `1015` to reset `npt`, `ij`, the compile/tape cursors via `ini`, and the four bar pointers) from a **subsequent** voice (jump straight to `rdp` at `1024`, reading into the next voice slot), and updates `f5`/`f6` so the machine now reads as "voice(s) read" `(1,0)`. The per-voice arrays `b`/`n`/`t`/`a`/`p` (`750`-`773`) are the bookkeeping state these reads populate and the player later consumes.
