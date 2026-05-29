# `30`-`113`: the multiply routine (`mpy`)

This is the signed multiply subroutine. It takes a multiplicand in `AC` and a multiplier in `IO`, and returns a 34-bit signed product spread across `AC` (high half) and `IO` (low half). It is the workhorse behind the detuning math (`tun`/`tn1`/`tn2`) and the tempo/duration arithmetic; the player itself doesn't call it during the per-sample loop, but the compile phase does.

The routine has two bodies: a one-instruction **hardware** path (`mul`) and a longer **software** step-multiply path (`repeat 21, mus mp2`). At startup `beg` (700 octal) probes the machine and patches the cell `mps` (35 octal) to choose between them. In this emulator the hardware path is always taken; the software path is dead code at runtime but is documented below for completeness.

## Scratch cells and entry convention

```
30  mp2,  0      / scratch: |multiplier| during step-multiply, then the magnitude product
31  mpr,  0      / the multiplier argument
32  mpy,  0      / the multiplicand argument (the jda name cell)
```

The routine is a `jda` subroutine. The caller does:

```
        lac <multiplicand>
        lio <multiplier>
        jda mpy
```

`jda mpy` writes `AC` into cell `mpy` (32 octal) and resumes execution at `mpy+1` (33 octal), with the old `PC`+flags (Overflow/Extend in the top bits) placed in `AC` as the return linkage. So the multiplicand lands in `mpy` as both the argument *and* a working copy.

```
32  mpy,  0          / AC (the multiplicand) is deposited here by jda
33        dap mpx    / patch the return jmp with our caller's address
34        dio mpr    / stash the multiplier (passed in IO) into mpr
```

- `33  dap mpx` — `dap` deposits only the low 12 bits of `AC` into `mpx` (113 octal), preserving that cell's opcode bits. `mpx` is `jmp .`, so this patches its address field to the caller's return point. This is the standard `jda`/`dap` return-linkage idiom: the `jda`-supplied linkage in `AC` becomes the target of the closing `jmp`. (Assembled: `33  260113`, i.e. `dap` of address `113`.)
- `34  dio mpr` — copy the multiplier out of `IO` into `mpr` (31 octal). Now both operands live in memory (`mpy`, `mpr`).

## The path selector (`mps`)

```
35  mps,  hlt    / skp for mul, skp i for mus
36        jmp mpu
```

`mps` is self-modified at boot. In the source it assembles to `hlt` (760400) as a placeholder, but `beg` overwrites it (lines 186-190 of `pdp1m13.mac`: `mul (10` / `lio (skp` / `sza` / `lio (skp i` / `dio mps`):

| Machine has | `mps` patched to | Effect |
|---|---|---|
| hardware `mul` | `skp` = 640000 (never skips in this core) | falls through to `36  jmp mpu` (hardware path) |
| only step `mus` | `skp i` = 650000 (always skips) | skips `36  jmp mpu`, falls into the software loop at `37` |

The probe leans on `mul`'s result format: `law 10` / `cli` / `mul (10` multiplies `10` by `10`. With hardware `mul`, the high half (`AC`) of the small product is `0`, so `sza` skips the `lio (skp i`, leaving `IO = skp`; `dio mps` then stores `skp` (a no-skip). Without hardware `mul` the result differs, `sza` does not skip, and `mps` gets `skp i`.

So `mps`/`mpu` form a runtime branch. Because this emulator implements `mul` (opcode 54, see `cpu.ts` `case 0o54`) but **not** the `mus` step-op, the probe in `beg` always selects the hardware path: `mps` becomes `skp` (a no-skip), control reaches `jmp mpu`, and the software block at `37`-`110` never runs.

## Hardware path (`mpu`, 111-113) — the one actually used

```
111  mpu,  lac mpy    / reload multiplicand
112        mul mpr    / AC,IO := mpy * mpr  (signed 34-bit product)
113  mpx,  jmp .      / return (address field was patched by dap mpx)
```

- `111  lac mpy` reloads the multiplicand into `AC` (the multiply needs both operands; `mpr` is supplied as `mul`'s operand `Y`).
- `112  mul mpr` does the whole multiply in one instruction. Per `cpu.ts`, `mul` forms the signed product of `AC` and `C(mpr)`, then places the magnitude's high bits in `AC` and its low bits in `IO`, re-applying the ones-complement sign to both words. The result is exactly the documented "34-bit product, 2 signs."
- `113  mpx, jmp .` returns. The `.` operand was patched by `dap mpx` at `33`, so this jumps back to the caller. This is the self-modifying-return half of the `jda` idiom.

## Software path (`37`-`110`) — dead at runtime, explained for completeness

This is a sign-magnitude shift-and-add multiply, used on PDP-1s that lacked the optional hardware multiply. It multiplies the magnitudes, then re-applies the sign.

Sign-stripping of the multiplicand, then pre-positioning:

```
37        lac mpy    / load multiplicand (reached only if mps skipped jmp mpu)
40        spa        / skip if AC >= 0
41        cma        / else AC := ~AC  (ones-complement -> magnitude)
42        rcr 9s     / rotate combined AC:IO right 9
43        rcr 9s     / rotate combined AC:IO right 9 (total 18) -> magnitude into IO
```

- `40  spa` / `41  cma`: `spa` skips the `cma` when `AC` is non-negative; otherwise `cma` (bitwise complement) turns a negative ones-complement value into its magnitude. Classic two-instruction "absolute value."
- `42`-`43  rcr 9s`: `rcr` rotates the 36-bit `AC:IO` pair right; `9s` = `777` octal = 9 one-bits = 9 positions (see `popcnt(y & 0o777)` in `cpu.ts`). Two of them = 18 positions, moving the magnitude of the multiplicand from `AC` down into `IO` so the step loop can shift it through.

Multiplier magnitude into the scratch counter cell, then the step loop:

```
44  mp1,  lac mpr           / load multiplier
45        spa
46        cma                / |multiplier|
47        dac mp2            / store magnitude in mp2
50        cla                / clear AC (the accumulating product high half)
51        repeat 21, mus mp2 / octal 21 = 17 (decimal) multiply-steps, at 51..71 octal
72        dac mp2            / store the accumulated product
```

- `44`-`46`: same absolute-value idiom applied to the multiplier (`mpr`), result left in `AC`.
- `47  dac mp2`: park `|multiplier|` in `mp2` (30 octal); the step-op reads it from there.
- `50  cla`: zero `AC` to start accumulating the product.
- `51  repeat 21, mus mp2`: the assembler expands this into octal `21` (= 17 decimal) copies of `mus mp2`, occupying addresses `51` through `71` octal. Each `mus` (multiply-step) examines a multiplier bit and conditionally adds the shifted multiplicand, walking the `AC:IO` pair. **The assembler that produced the `.lst` didn't know the `mus` mnemonic**, so listing line 58 shows the `UD undefined` marker and the repeated body assembles as `000030` (the bare operand value `mp2` = 30) rather than a real `mus` opcode. This is a harmless re-assembly artifact; it is also why this block could never execute correctly here even if the path were selected.
- `72  dac mp2`: stash the finished magnitude product. (Because the `repeat` block fills `51`-`71`, this `dac` lands at `72`, not right after `51`.)

Sign recombination:

```
73        lac mpr
74        xor mpy
75        sma        / skip if AC < 0  (i.e. signs differ -> product negative)
76        jmp mp3    / signs alike: product positive, no negation
```

- `73`-`74`: `xor mpy` XORs the multiplier (`mpr`) and multiplicand (`mpy`). Only the sign bit (bit 17) matters: it is 1 exactly when the two operands have *opposite* signs, i.e. the product should be negative.
- `75  sma` skips `76  jmp mp3` when the XOR result is negative (sign bit set, signs differ). So: signs differ -> fall into the negate block at `77`; signs alike -> `jmp mp3` (positive result, skip negation).

Negate-and-reposition (negative product):

```
77        lac mp2    / product magnitude
100       cma        / negate
101       rcr 9s
102       rcr 9s
103       cma
104       rcr 9s
105       rcr 9s
106       jmp mpx
```

This complements and rotates the 36-bit pair to lay the negative 34-bit product out across `AC` (high) and `IO` (low) in the same two-sign format the hardware `mul` produces, then `jmp mpx` returns through the patched exit.

Positive product:

```
107  mp3,  lac mp2   / reload positive product
110       jmp mpx    / return
```

## What this routine accomplishes

`mpy` is a sign-correct multiply that yields a **34-bit signed product** with `AC` holding the high half and `IO` the low half — the format the caller expects for subsequent scaling (`rcr`/`scl`) and for feeding `dvd`. It is entered via the `jda` convention (multiplicand in `AC` -> stored at `mpy` (32); multiplier in `IO` -> copied to `mpr` (31)), patches its own return through `dap mpx` (33 patches `mpx` at 113), and dynamically dispatches on the `mps` cell (35) that `beg` sets at startup. On real hardware the choice between the single `mul` (`mpu`, 111) and the octal-21 (17-step) `mus` loop (`51`) depended on the machine's options; **in this emulator the probe always lands on the hardware path**, so `mp1`/`mp2`/`mp3` and the rest of the step path (`37`-`110`) are dead code and the `mus`-based step loop (with its `UD undefined` listing artifact on line 58) never runs.
