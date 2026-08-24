# `114`-`173`: the divide routine (`dvd`)

`dvd` is the program's general-purpose signed divide. The header comment states it "assumes positive operands" — the player only ever feeds it non-negative dividends and divisors (frequencies, tempos, durations). It is the dual of the multiply routine `mpy` (`32`) and, like that routine, it has a **runtime-patched dispatch cell** so it can use the optional hardware `div` instruction when present or fall back to a software step loop when not.

In this emulator the hardware path is *always* taken, because the core implements `div` (`cpu.ts` opcode `0o56`) but not the `dis` step-op. Everything from `127` to `161` is the software fallback and never executes at runtime; it is annotated below for completeness.

## The 3-return calling convention

```
/ lac hi-dividend, lio lo-dividend, jda dvd, lac divisor,
/ overflow return, normal return (quot in AC, remdr in IO)
```

`dvd` is a **`jda` subroutine** with an unusually rich convention. The full inline calling sequence is **six words**: the caller stages a 35-bit dividend in `AC:IO` with the first two, then four more follow:

| Caller word | Role |
|---|---|
| `lac hi-dividend` | high 18 bits of dividend → AC |
| `lio lo-dividend` | low bits of dividend → IO |
| `jda dvd` | call: stores AC into `dvd` (`117`), AC := return linkage, PC := `dvd+1` (`120`) |
| `lac divisor` | **not executed in line** — `dvd` reaches over and `xct`s it to fetch the divisor |
| *overflow return* | reached if the quotient would not fit (divide overflow) |
| *normal return* | reached on success; quotient in AC, remainder in IO |

So the word immediately after `jda dvd` is *data the routine reads*, and the two words after *that* are the two possible return points. The routine selects which of the two it lands on. This is the same self-relative trick used elsewhere, but here it walks a return pointer (`dv0`) forward to step over the in-line divisor word and select between the two return words.

## Data cells and entry

```
114  dv0,	0
115  dv1,	0
116  dv2,	0
117  dvd,	0
```

- `dv0` (`114`) — the **return pointer**, patched at entry and then incremented to step over the caller's words.
- `dv1` (`115`) — holds the divisor once fetched.
- `dv2` (`116`) — scratch for the quotient.
- `dvd` (`117`) — the `jda` argument cell; receives the high dividend, and in the software path is reloaded with the remainder for return.

```
120  dap dv0	/works extended
121  xct i dv0
122  dac dv1	/divisor
123  idx dv0
124  lac dvd
```

`jda dvd` left the return linkage in AC: the address of the caller word right after `jda dvd`, i.e. the `lac divisor` cell. The opening four instructions consume it:

- `120  dap dv0` — `dap` deposits only AC<6:17> (the address bits) into `dv0`, preserving `dv0`'s opcode field (currently `0`). `dv0` now contains the address of the caller's `lac divisor` word. The comment "works extended" notes that the linkage carries the full bank-spanning address and that `dv0` is used as an *indirect* pointer below, which under Extend mode is a single-level full-width address — so the routine works correctly even when the caller lives in a different core bank.
- `121  xct i dv0` — `xct` executes the single instruction *at the address `dv0` points to* (indirect). That instruction is the caller's `lac divisor`, so this loads the divisor into AC without the routine having to know where it lives. This is how the divisor is passed: as an in-line instruction the callee borrows.
- `122  dac dv1` — store the divisor into `dv1` (`115`), where both the hardware and software paths expect it.
- `123  idx dv0` — `idx` increments `dv0` (ones-complement +1, `-0` normalized), advancing the return pointer from the `lac divisor` word to the **overflow-return** word. `dv0` now points one short of the normal return. (`idx` also lands the incremented value in AC, but `124` immediately reloads AC.)
- `124  lac dvd` — reload AC with the high dividend that `jda` stashed in `dvd` (`117`). The hardware `div` needs the dividend back in `AC:IO`; IO still holds the low half from the caller's `lio`, so AC is all that needs restoring.

## The patched dispatch (`dvs`)

```
125  dvs,	hlt	/skp for div, skp i for dis
126  jmp dvu
```

`dvs` (`125`) is assembled as `hlt` (`760400`) but is **overwritten at startup** by `beg`'s hardware-probe. It is set to one of two assembler constants:

- `skp` (`640000`) — never skips in this core → fall through to `126 jmp dvu`, the **hardware** path.
- `skp i` (`650000`) — always skips → skip `jmp dvu` and enter the **software** step loop at `127`.

Because this emulator has hardware `div`, the probe patches `dvs` to `skp` and `126 jmp dvu` is taken every time.

## Software path (`127`-`161`) — not executed here

```
127  sub dv1
130  sma
131  jmp dve	/if overflow
132  repeat 22, dis dv1
154  add dv1
155  dio dv2	/temp
156  cli
157  rcr 1s
160  dac dvd
161  jmp dvw
```

This is a classic **non-restoring division** built from the `dis` divide-step op:

- `127 sub dv1 / 130 sma / 131 jmp dve` — a pre-check: subtract the divisor from the high dividend; `sma` skips only if the result is negative (i.e. the divisor is larger than the high half, so the quotient fits). If the result is **not** negative the quotient would overflow, so `jmp dve` bails to the overflow tail at `171` (`dve`). This mirrors the hardware check `acMagnitude >= divisorMagnitude`.
- `132 repeat 22, dis dv1` — the listing assembles this as 18 copies (`132`-`153`) of the word `000115` (= `dv1`'s address). `dis` is the divide-step op; `repeat 22` (octal `22` = 18 decimal) lays down 18 of them to peel off the quotient bits one at a time. The assembler that produced this listing did not know the `dis` mnemonic — listing line 118 shows the **`UD undefined`** error marker under the `^` — so it emitted the bare operand `000115`. This is a harmless re-assembly artifact; the routine is dead code in this emulator regardless.
- `154 add dv1` — restore step for the non-restoring algorithm (the final partial remainder may be off by one divisor).
- `155 dio dv2` — park IO (which holds accumulated quotient bits) into scratch `dv2`.
- `156 cli / 157 rcr 1s` — clear IO, then rotate the combined `AC:IO` right one place (`1s` = 1 position): a final alignment fix-up on the remainder.
- `160 dac dvd` — store the corrected remainder back into `dvd` (`117`), matching what the software return wiring (`172 lio dvd`) expects.
- `161 jmp dvw` — join the software return tail at `dvw` (`170`).

## Hardware path (`162`-`167`)

```
162  dvu,	div dv1
163  jmp i dv0	/if overflow
164  dac dv2
165  idx dv0
166  lac dv2
167  jmp i dv0
```

- `162 div dv1` — the optional hardware divide. `AC:IO` (high dividend / low dividend) divided by `C(dv1)` (the divisor). In `cpu.ts` (opcode `0o56`): if `acMagnitude >= divisorMagnitude` it is a **divide overflow** — the quotient won't fit in 18 bits — and the instruction does *nothing* (AC, IO, PC untouched) and does **not** skip. Otherwise it writes quotient → AC, remainder → IO, and **skips** the next instruction.
- `163 jmp i dv0` — the **overflow return**. On overflow `div` did not skip, so control reaches this word. `dv0` currently points at the caller's overflow-return word (set up by the single `idx dv0` at `123`), and `jmp i dv0` jumps there indirectly. (Indirect under Extend mode is single-level full-width, so this works across banks.)
- `164 dac dv2` — reached only on success (the skip from `div` lands here). Stash the quotient (in AC) into `dv2` (`116`).
- `165 idx dv0` — advance the return pointer one more, from the overflow-return word to the **normal-return** word.
- `166 lac dv2` — reload the quotient into AC (the intervening `idx` clobbered AC), re-staging the result for return.
- `167 jmp i dv0` — return to the caller's **normal-return** word with the quotient in AC.

Note the hardware path returns with quotient in AC and remainder already in IO (left there by `div`), so it does **not** route through the `dvw`/`dve` tail — it returns directly via `163` (overflow) or `167` (normal).

## Software return tail (`170`-`173`)

```
170  dvw,	idx dv0
171  dve,	lac dv2
172  lio dvd
173  jmp i dv0
```

This tail serves the **software** path only:

- `170 dvw, idx dv0` — entered from the software path (`161`). `idx dv0` bumps the return pointer from the overflow-return word to the normal-return word (the software path had only advanced `dv0` once, at `123`). Falls through into the body below.
- `171 dve, lac dv2` — the **overflow target** for the software path (`131 jmp dve`), entered with `dv0` still pointing at the overflow-return word (no extra `idx`). This same word also loads the quotient from `dv2` into AC.
- `172 lio dvd` — load the remainder (stored at `dvd` by `160`) into IO.
- `173 jmp i dv0` — indirect return through `dv0` to whichever caller word it now points at (normal return after `dvw`, overflow return after `dve`).

So both software exits funnel through `173`, distinguished only by how many times `dv0` was incremented before arriving — `dvw` does the extra `idx` for the success case, `dve` skips it for the overflow case.

## What this routine accomplishes

`dvd` divides a 35-bit `AC:IO` dividend by an in-line divisor and returns to one of two caller-supplied addresses — overflow or normal — with the **quotient in AC and remainder in IO**. Its cleverness is in the calling convention: `jda` passes the high dividend, the divisor is fetched by `xct i dv0` directly out of the caller's instruction stream, and the return pointer `dv0` is walked forward by `idx` to select between the overflow and normal return words. The `dvs` cell is self-modified at startup to dispatch to either the hardware `div` (`dvu`, `162`) or a software non-restoring loop (`127`-`161`). On this emulator hardware `div` exists, so the `skp`-patched `dvs` always falls through to `jmp dvu`, the software `dis`/`repeat` block (which the listing's assembler couldn't even resolve — hence the `UD undefined` at listing line 118) never runs, and the `dvw`/`dve` tail is dead. The live exits are `163` (overflow) and `167` (normal).
