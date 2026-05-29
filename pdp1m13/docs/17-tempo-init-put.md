# `1606`-`1662`: tempo, pointer init, and the segment writer (`tpo`/`ini`/`put`)

Three small `jda`/`jsp` subroutines that the compiler calls during setup: `tpo` (`1606`) turns the front-panel tempo into the player's fixed-point loop counters, `ini` (`1635`) initializes the two compile-output pointers, and `put` (`1644`) appends one word to the compiled stream while transparently hopping core banks when a block fills.

## `tpo` (`1606`): derive `tpm` / `tpx` from the test-word tempo

`tpo` is a `jda` subroutine: a caller does `lac <seed>; jda tpo`. `jda` stores AC into the name cell (`tpo` at `1606`) and resumes at `tpo+1`, so cell `1606` doubles as the argument cell — it holds the seed value for the run. The whole routine is a chain of fixed-point multiplies and divides that scales the raw tempo into the units the player loop wants.

```
1606  tpo,  0           / arg cell: the tempo seed (deposited here by jda)
1607        dap stx     / patch return address into stx
1610        lac tpo     / AC := seed
1611        lio tpg     / IO := test-word tempo (front panel)
1612        jda mpy     / AC,IO := seed * tpg   (34-bit signed product)
1613        jda dvd     / divide that product ...
1614         law 252    /   divisor = 252 octal, xct-executed by dvd
1615        hlt         / overflow return: stop the machine
```

- `1607 dap stx` — self-modify primitive. `dap` deposits only AC's address field into `stx` (`1634`), preserving its `jmp` opcode. The value in AC here is the return linkage that the `jda` which *called* `tpo` placed there: `jda` sets `AC := return linkage` immediately before transferring control, so on entry at `tpo+1` AC holds the caller's return address. `dap stx` stashes that address into the final `jmp .` at `1634`. This is the standard `jda`/`dap`/`jmp .` return idiom.
- `1610 lac tpo` reloads AC with the seed (overwriting the return link, which is now safe in `stx`).
- `1611 lio tpg` loads the test-word tempo. `tpg` (`26`) is the tempo taken from the front-panel **test word**; the browser sets it via the worklet, valid range **`0o40`-`0o1377` octal**. This is "1st factor: from TW."
- `1612 jda mpy` calls the multiply helper (`mpy` at `32`): multiplicand in AC, multiplier in IO, returning the signed 34-bit product as AC(high),IO(low). So `AC,IO := seed * tpg`.
- `1613 jda dvd` calls the divide helper. By the `dvd` convention the **inline** word at `1614` (`law 252`) is `xct`-executed by `dvd` as the divisor load — here an immediate `law 252` supplies the divisor `252` octal directly — and the two words **after** it are the overflow and normal return points (in that order). `dvd` divides the AC,IO dividend (the product just formed) by `252` and returns quotient in AC, remainder in IO.
- `1614 law 252` is the divisor word consumed by `dvd` (executed via `xct i`, not reached in normal program flow).
- `1615 hlt` is the **overflow return**: `dvd` lands here only if the divide overflowed, halting the machine. Under valid tempos the divide succeeds and `dvd` returns to the *next* word (`1616`), so this `hlt` is never reached.

```
1616        lio tpf     / 2nd factor: location 12 (tempo fudge)
1617        jda mpy     / multiply running value by tpf
1620        scl 5s      / arithmetic shift AC:IO left 5
1621        lio (1131   / 3rd factor: literal 1131
1622        jda mpy     / multiply
1623        scl 9s      / arithmetic shift AC:IO left 9
1624        dac tpm     / store tempo multiplier
```

- `1616 lio tpf` loads `tpf` (`12`, "tempo fudge") as the next multiplier. `tpf` is a hand-tuned correction constant at fixed location `12`.
- `1617 jda mpy` multiplies the quotient from the previous step by `tpf`.
- `1620 scl 5s` is shift-combined-arithmetic-left by 5 (`5s` = 5 one-bits in the operand → 5 places). `scl` shifts the combined AC:IO left while preserving AC's sign, rescaling the fixed-point product after the multiply (a `jda mpy` leaves the result split across AC:IO, so the code reshifts to keep the binary point fixed).
- `1621 lio (1131` loads the literal constant `1131` (octal) from the constant pool as the next multiplier. This is a pure fixed-point tuning coefficient, not the address `1131` (which happens to be `tpx`) — it is consumed as data via the literal `(1131`.
- `1622 jda mpy` multiplies by `1131`.
- `1623 scl 9s` rescales again, this time by 9 places (`9s` = `777` octal = 9 one-bits).
- `1624 dac tpm` stores the result as **`tpm`** (`1132`), the tempo multiplier the player uses.

The cumulative scaling is `tpm ≈ ((seed·tpg / 252) · tpf <<5 · 1131) <<9`, all in ones-complement fixed point. The exact musical units aren't important here; the structure is: combine the user's test-word tempo (`tpg`) with the seed and two tuning constants (`tpf`, `1131`), reshifting after each multiply to keep the fixed-point scale, to land on a per-segment loop-count multiplier.

```
1625        cla         / AC := 0
1626        lio (17760  / "7770 and a null bit" : the reciprocal numerator
1627        rcl 9s      / rotate AC:IO left 9 -> brings 17760 up into AC
1630        jda dvd     / divide ...
1631         lac tpm    /   divisor = tpm, xct-executed by dvd
1632        hlt         / overflow return
1633        dac tpx     / store max-fraction
1634  stx,  jmp .       / return (address patched by dap stx)
```

- `1625 cla` clears AC; `1626 lio (17760` loads the literal `17760` octal. The source annotates this "7770 and a null bit": `17760` is `7770` shifted left one bit (`7770 << 1`), i.e. a numerator pre-scaled by a low-order zero so the following rotate lands it correctly in fixed point.
- `1627 rcl 9s` rotates the combined AC:IO left by 9. With AC=0 and IO=`17760`, this moves the constant up into AC, forming the 35-bit dividend `AC,IO` for the divide.
- `1630 jda dvd` divides `17760` (suitably positioned) by `tpm`. As before, the inline word `1631 lac tpm` is the divisor consumed by `dvd`, `1632 hlt` is the overflow return, and normal control resumes at `1633`.
- `1633 dac tpx` stores **`tpx`** (`1131`), the "max fraction" — effectively `17760 / tpm`, the reciprocal-like companion to `tpm`. Together `tpm` and `tpx` parameterize how many player-loop iterations a note of a given written duration runs.
- `1634 stx, jmp .` returns; its operand was patched at `1607` by `dap stx`.

## `ini` (`1635`): set the compile-output pointers

```
1635  ini,  dap inx     / save return addr into inx
1636        lac (10000  / AC := 10000 (start of core bank 1)
1637        add nog     / + nog (700) = 10700
1640        dac cb      / cb := 10700  (compile write pointer)
1641        law not     / AC := address "not" (tape buffer base)
1642        dac ib      / ib := not
1643  inx,  jmp .       / return
```

`ini` is a `jsp` subroutine (`dap inx` / `jmp .` return idiom). It points the compiler at the start of its output region:

- `cb` (`253`), the **compile write pointer**, is set to `(10000 + nog)`. `10000` octal is the base of **core bank 1** and `nog` (`15`, value `700`) is the bottom of the available compile area within a bank, so the first compiled word goes to `10700`. The compiled segment data lives in banks 1-2; `cb` walks it.
- `ib` (`25`), the tape-buffer read pointer, is set to `not` (`2304`), the base of the raw notes/bars buffer in bank 0 (`law not` loads the address as an immediate).

## `put` (`1644`): append IO to the compiled stream, with bank-wrap

```
1644  put,  dap pux     / save return addr into pux
1645        dio i cb     / store IO at C(cb)  (indirect: extend-mode 16-bit ptr)
1646        idx cb       / cb := cb + 1
1647        sas eb       / skip next if cb == eb (block full)
1650  pux,  jmp .        / NORMAL EXIT (block not full)
```

`put` is a `jsp` routine that writes the word currently in IO to the next slot of the compiled stream:

- `1645 dio i cb` stores IO **indirectly** through `cb`. The player/compiler runs in **extend mode**, so this is a single-level 16-bit indirect — the pointer can address banks 1-2, not just bank 0.
- `1646 idx cb` increments the pointer (ones-complement increment, `-0` normalized to `+0`), leaving the new value in AC.
- `1647 sas eb` skips the next instruction when `AC == C(eb)` — i.e. when the just-incremented `cb` equals `eb` (`254`), the end of the current block. `sas` is *skip if equal*; do not confuse it with `sad` (skip if not equal) used later at `1656`.

So the control flow is the intuitive one:

- **Block not full (`cb != eb`)**: `sas` does **not** skip → `1650 pux, jmp .` executes → return. This is the common path; the bank-wrap code below is bypassed.
- **Block full (`cb == eb`)**: `sas` skips over `1650` and falls into the wrap code at `1651`, which advances `cb`/`eb` into the next core bank before returning.

`eb` is initialized to the top of the current bank (set by `pla` at `1671` as `ptr + nof - nog`, and reset here on each bank crossing), so the equality test fires exactly when the write pointer has just stepped onto the bank-top sentinel.

```
1651        add (10000     / cb + 10000 (next bank)
1652        sub nof        / - nof (7776, per-bank top)
1653        add nog        / + nog (700, per-bank bottom)
1654        dac cb         / cb := wrapped pointer in next bank
1655        sub nog        / test value: cb - nog
1656        sad (nbk*10000 / skip if AC != nbk*10000 (=30000)
1657        jmp cpx        / FULL, FAIL: out of banks
1660        add nof        / restore
1661        dac eb         / eb := new block end (next bank top)
1662        jmp pux        / rejoin exit
```

When a block fills, `put` advances `cb` into the next core bank: `add (10000` moves up one bank (`10000` octal = 4096 words), `sub nof` / `add nog` adjust off the old bank's top (`nof` = `7776`) and onto the new bank's bottom (`nog` = `700`), and `1654 dac cb` commits the new pointer. Then:

- `1655 sub nog; 1656 sad (nbk*10000` checks whether we have run past the last available bank: it forms `cb - nog` and compares against `nbk*10000`. `nbk` is an assembly-time constant (`nbk=3`, the number of core banks), so the intended literal is **`30000` octal** (3 banks × `10000`). `sad` is *skip if not equal*, so it skips the next instruction when `AC != 30000`; if equal we have exhausted the available banks and `1657 jmp cpx` bails out to `cpx` (`1316`, the "full, fail" exit).
- `1660 add nof; 1661 dac eb` set `eb` to the new block's end (next bank's top), so the next `sas eb` in `put` triggers at the right place.
- `1662 jmp pux` rejoins the normal exit at `1650`.

Note the listing artifact at `.lst` line 790: the re-assembler flagged **`IC in expression`** on `sad (nbk*10000` and left the constant unresolved, so the literal-pool word for that operand reads `000000` in this listing rather than `30000`. This is harmless — the original assembly evaluated `nbk*10000` to `30000` octal, which is the value the running program uses; only the modern re-assembly choked on the `nbk*10000` form.

| Symbol | Octal addr | Role |
|---|---|---|
| `tpg` | `26` | tempo from front-panel test word (input, `40`-`1377`) |
| `tpf` | `12` | tempo "fudge" tuning constant |
| `tpm` | `1132` | derived tempo multiplier |
| `tpx` | `1131` | derived "max fraction" (`≈17760/tpm`) |
| `cb` | `253` | compile write pointer (banks 1-2) |
| `eb` | `254` | end of current compile block |
| `ib` | `25` | tape-buffer read pointer (`not`, `2304`) |
| `nog` | `15` | bank bottom (value `700`) |
| `nof` | `14` | bank top (value `7776`) |
| `nbk` | — (assembly constant) | bank count (`nbk=3`) |

## What this routine accomplishes

`tpo` converts the user's front-panel tempo (`tpg`) into the fixed-point loop-count parameters `tpm`/`tpx` that the player uses to time note durations, via a multiply/divide/shift chain with two tuning constants (`tpf`, `1131`) and a reciprocal step against `17760`. `ini` resets the compiler's output cursor `cb` to the base of core bank 1 (`10700`) and the tape cursor `ib` to the note buffer. `put` is the single chokepoint through which every compiled word is emitted: it stores via the extend-mode indirect `cb`, advances, and when a block fills (`cb == eb`) it transparently steps `cb`/`eb` into the next core bank — or jumps to `cpx` (`1316`) if all banks are exhausted. The combination of cross-bank pointer math here and the extend-mode indirect store is exactly what lets the compiled segment data span core banks 1-2 that the player later walks with `hop`/`gap`/`xbk`.
