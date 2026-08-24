# `207`-`252`: building the detuned frequency tables (`tun`)

`tun` is a `jsp` subroutine that constructs the four per-voice **detuned** copies of the base equal-tempered frequency table `pt` (`2137`). The base table holds one 18-bit phase increment per chromatic pitch; the player's sound comes from accumulating these increments until the phase overflows, so scaling an increment up or down shifts that voice's pitch slightly sharp or flat. Building four copies with four slightly different multipliers gives the chorus / ensemble shimmer of multiple instruments that are never perfectly in tune. The four copies are written to `tab`, `tab+100`, `tab+200`, `tab+300` (`300`/`400`/`500`/`600` octal per the symbol map).

> Note on assembled addresses: this re-assembled listing evaluated `tab = t6*100` to `000000` instead of `300` (the assembler produced `000000` for the `tab=t6*100` definition on the listing), so the assembled literal `(dac tbe` below reads `dac 400` rather than `dac 700`, and `law tab` assembles as `700000` (operand `0`). The intended runtime base is `tab = 300` (the symbol map / `.mac` value). I quote the source mnemonics and call out where the assembled words differ.

## Scratch cells and entry

```
207  tw0,  0
210  tw1,  0
211  tw2,  0
```

Three scratch words precede the routine: `tw0` (working copy of the detune control, consumed 3 bits at a time), `tw1` (the per-voice multiplier), and `tw2` (the overall detuning bias added to every voice).

```
212  tun,  dap tux
```

`dap tux` is the standard `jsp` return idiom: the caller did `jsp tun`, leaving the return linkage in AC; `dap tux` deposits only AC's low 12 address bits into the exit instruction at `tux` (`246`, a `jmp .`), preserving its opcode bits. The routine will return through that patched `jmp`.

## Decoding `tuw` into `tw2` (the overall detune bias)

```
213        lac tuw      /detuning increments for each part
214        dac tw0
215        and (77
216        rar 6s
217        sar 6s
220        sar 5s       /overall detuning, twice scale of per-part
221        dac tw2
```

- `lac tuw` loads the master detune word `tuw` (`11`). It packs a small signed increment for each voice in 3-bit fields (the high 12 bits), plus a 6-bit low field used for the overall bias.
- `dac tw0` saves the whole word into the working cell `tw0`; the per-voice fields will be peeled off later with `rcl 3s` (`230`).
- `and (77` masks AC to the low 6 bits (`(77` is the literal at `2243` = `000077`). This is the overall-bias field (bits 12-17 of `tuw`). Note this operates on AC; `tw0` still holds the full word.
- `rar 6s` rotates AC right 6 places (`6s` = a 6-bit operand `777`→ popcount 6; the emulator's opcode `66` indirect/`rar` rotates AC right by the number of 1-bits in the operand). The 6-bit field, sitting in bits 12-17, wraps around to **bits 0-5** — the top (sign) end of the word. This positions the field's MSB in the sign bit so the following **arithmetic** shifts can sign-extend it.
- `sar 6s` then `sar 5s` are arithmetic right shifts (sign-preserving, opcode `66` indirect `sar`). The combination `sar 6s` + `sar 5s` shifts right a further 11 places with sign extension, sliding the now sign-aligned 6-bit field back down into the low part of the word as a sign-extended signed quantity. The comment "overall detuning, twice scale of per-part" notes this bias ends up with twice the weight of the individual per-voice increments (the per-voice fields are only 3 bits and are recentered differently below).
- `dac tw2` stores the resulting signed overall-detune bias. It is added into every voice's multiplier below, so the whole ensemble can be pulled sharp or flat together while each voice still gets its own offset.

## Per-voice outer loop setup (`tn1` / `tn2`)

```
222  tn1,  law tab
223        dap to
224  tn2,  law pt
225        dap ti
```

- `tn1`: `law tab` loads the destination table base as an immediate (the **address** the first write should target). `dap to` patches that address into the self-modifying store at `to` (`243`). `tn1` runs once (it is never re-entered); `to` is then advanced in place to sweep through all four tables back-to-back.
- `tn2`: `law pt` loads the source table base `pt` (`2137`) as an immediate; `dap ti` patches it into the self-modifying read at `ti` (`236`). `tn2` is the per-voice re-entry (`252` jumps back here): each voice restarts the source pointer at the top of `pt` while the destination pointer `to` keeps climbing.

## Computing this voice's multiplier `tw1`

```
226        cla
227        lio tw0
230        rcl 3s
231        dio tw0
232        sub (4       /offset of increment
233        add tw2
234        dac tw1
```

- `cla` clears AC.
- `lio tw0` loads the remaining packed detune word into IO.
- `rcl 3s` rotates the combined 36-bit `AC,IO` **left** by 3 (`3s`, popcount 3). The combined-rotate moves the top 3 bits of IO up into the low bits of AC — i.e. it pops one 3-bit per-voice field off the high end of `tw0` into AC, while rotating the rest of `tw0` around in IO.
- `dio tw0` stores the rotated IO back to `tw0`, consuming that field so the next voice's `rcl 3s` peels off the next one. This is the per-voice field extractor: each pass through `tn2` shifts out one 3-bit increment.
- `sub (4` subtracts 4 (literal `(4` at `2244` = `000004`). The 3-bit field is unsigned 0..7; subtracting 4 (its midpoint) recenters it to a signed range −4..+3 around zero ("offset of increment").
- `add tw2` adds the overall bias computed earlier, so the final multiplier = (recentered per-voice offset) + (overall detune).
- `dac tw1` stores it. `tw1` is the constant multiplier applied to every pitch of this voice in the inner loop.

## Inner loop: sweep `pt`, scale each increment, write the detuned copy

```
235  tl,   cla
236  ti,   add .
237        lio tw1
240        jda mpy      /multiply
241        xct tix      /scale
242        xct ti
243  to,   dac .
244        idx to
245        sad (dac tbe
246  tux,  jmp .        /exit
247        idx ti
250        sas (add pt+100
251        jmp tl       /next pitch
252        jmp tn2      /next voice
```

- `tl`: `cla` clears AC at the top of each pitch iteration.
- `ti, add .` is **self-modifying**. As assembled (`00236 400236`) the operand *is* `ti` itself, but `dap ti` (`225`) patched the address field to point at `pt`, and `idx ti` (`247`) bumps that address by one each pitch. So this single instruction reads the current source entry `C(pt+k)` and adds it to the (zeroed) AC, sweeping the whole base table over successive iterations. `ti` is the source-pointer cursor.
- `lio tw1` puts this voice's multiplier into IO.
- `jda mpy` calls the multiply subroutine (`mpy` at `32`): multiplicand in AC (the base increment), multiplier in IO (`tw1`), returning the signed 34-bit product in AC(high), IO(low). `jda mpy` stores AC into cell `mpy` (`32`) and resumes at `mpy+1`. The product = base_increment × small_detune_factor.
- `xct tix` executes the single instruction stored at `tix` (`27`), which is `scl 8s` (assembled `667377`). `scl` is the combined **arithmetic left** shift of `AC:IO` (opcode `66`, non-indirect `scl`, sign-preserving); `8s` = 8 places. This rescales the wide multiply product back down to an 18-bit increment of the right magnitude — `tw1` is a small fixed-point factor, and the `scl 8s` re-normalizes the product. Using `xct` of a named cell keeps the scale factor in one editable place (`tix`).
- `xct ti` executes the instruction at `ti` again. `ti` currently holds `add <current source addr>`, so this re-adds the *original* base increment `C(pt+k)` to the scaled product. Effect: detuned_increment = scaled(base × factor) + base, i.e. the multiplier `tw1` is a small *relative* adjustment added on top of the unmodified base pitch rather than replacing it. (Re-executing `ti` is also why `ti` doubles as a data word holding `add pt+k`.)
- `to, dac .` is the **self-modifying store**, the mirror of `ti`. Assembled `00243 240243` ("`dac .`" = store to itself), but `dap to` (`223`) pointed it at `tab` and `idx to` (`244`) advances it. So it writes the finished detuned increment into the destination table, one slot per pitch. `to` is the destination cursor.
- `idx to` increments the destination address in place (ones-complement increment, −0 normalized to +0), advancing the write pointer to the next table slot; `idx` also leaves the incremented word (`dac <next addr>`) in AC.
- `sad (dac tbe` compares AC (the just-incremented store word from `idx to`) against the literal `(dac tbe` (`2245`, assembled `240400` = `dac 400`; intended `dac tbe` = `dac 700`). `sad` skips when they **differ** and does **not** skip when they are **equal**. So while the destination pointer has not yet reached the end of the last table, `sad` skips over the exit; when the store word equals `dac tbe` (pointer reached the very end), `sad` does not skip and control falls into `tux`.
- `tux, jmp .` is the patched return (`dap tux` at `212`): once all four tables are filled, the routine returns to the caller.
- `idx ti` increments the source address in place (and leaves the incremented `add <next src>` word in AC) — advance to the next base pitch.
- `sas (add pt+100` compares AC (the `add <next source addr>` word from `idx ti`) against the literal `(add pt+100` (`2246`, assembled `402237`). `pt+100` (octal) = `2237`, one past one voice's 64-entry source span. `sas` skips when AC **equals** the limit. So:
  - while the source pointer has *not* reached `pt+100`: `sas` does not skip → `jmp tl` loops back for the next pitch of this voice.
  - when it has reached `pt+100`: `sas` skips the `jmp tl` and falls into `jmp tn2`, which restarts the source at `pt` for the **next voice** (the destination `to` keeps its accumulated position, so the next voice's table follows immediately in core).

## What this routine accomplishes

`tun` reads one packed control word `tuw`, derives an overall detune bias `tw2` (the low 6-bit field, rotated to the sign end with `rar 6s` then arithmetically sign-extended back down by `sar 6s`+`sar 5s`) and four per-voice multipliers `tw1` (3-bit fields peeled off the high end via `rcl 3s`, recentered with `sub (4`, then `add tw2`). For each voice it sweeps the base table `pt` with the self-modifying cursor `ti`, multiplies each base increment by that voice's multiplier (`jda mpy`), rescales (`xct tix` = `scl 8s`), adds the original increment back (`xct ti`), and writes the result through the self-modifying cursor `to` into `tab` + voice·100. The two loop tests compare AC against literal *instruction* words: `sad (dac tbe` (does not skip → fall into `tux`) ends the whole routine when the destination cursor reaches the end of the last table, while `sas (add pt+100` (skips when equal → fall into `jmp tn2`) ends one voice and starts the next. The net product is four contiguous 64-entry frequency tables (`300`/`400`/`500`/`600`), each a slightly mistuned copy of `pt`, which the player later indexes per voice to produce the detuned, chorused ensemble sound.
