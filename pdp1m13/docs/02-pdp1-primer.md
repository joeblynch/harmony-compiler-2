# A 5-minute PDP-1 primer

This section teaches just enough PDP-1 to read the rest of this walkthrough. Everything here is grounded in the emulator (`src/pdp1/cpu.ts`); where a quirk matters for *PDP-1 Music 13* (e.g. self-modifying loops, ones-complement phase wrap), it is called out.

## The machine model

The PDP-1 is an **18-bit, ones-complement** computer.

- A word is 18 bits. Numbers are **ones-complement**: negate a value by flipping every bit (`cma` in the operate group does exactly `ac = ~ac`). This has a famous consequence — there are *two* zeros: `+0 = 000000` and `−0 = 777777` octal. Most arithmetic ops normalize `−0` back to `+0` (see `add`/`idx` below), but you will see `−0` survive in `law i 0`, `cma` of `+0`, and as a sentinel.
- The **sign bit** is bit 0 (the high bit, mask `400000` octal). "AC < 0" means "sign bit set".

Programmer-visible state:

| Register / state | Width | Role |
|---|---|---|
| **AC** (accumulator) | 18 | main arithmetic/logic register |
| **IO** (in-out) | 18 | second register; tape input, low half of `mul`/`div`, bit packing via combined shifts |
| **PC** (program counter) | 16 | address of next instruction (12-bit address + extension bits) |
| **Overflow** | 1 | set by `add`/`sub` on signed overflow; captured into the link word by `jsp`/`jda` |
| **Extend** | 1 | "Extend mode" flag; once `eem` runs, indirect addressing becomes single-level but 16-bit, so pointers can cross 4K banks |
| **6 program flags** | 6 | software-visible flags `1..6`, set/cleared by `stf`/`clf`, tested by `szf`. *In this program flags 1–4 ARE the four audio voices* (the worklet samples them); flags 5–6 are status bits. |
| **6 sense switches** | 6 | front-panel toggles read by `szs`; the worklet flips these to select read/compile/play modes |
| **18-bit test word** | 18 | front-panel toggles; read by `lat` (AC := AC OR testword). Used here to pass the **tempo** in. |

Memory is core, 4096 words per bank, up to 15 banks; the top address bits select the bank. The music player lives in bank 0 and reads its **compiled** note/segment data out of banks 1–2 (hence Extend mode).

## Instruction-word format

Every instruction is one 18-bit word:

| Bits (octal weight) | Field | Meaning |
|---|---|---|
| bits 0–4 (`760000`) | **opcode** | 5-bit operation |
| bit 5 (`010000`) | **indirect / variant** | for memory-ref ops: indirect addressing. For operate/skip/shift/iot it selects a variant (e.g. `law i`, inverted skip, `rar` vs `ral`). |
| bits 6–17 (`007777`) | **Y** | 12-bit address or immediate operand |

In assembly, the prefix **`i`** sets bit 5:

```
lac ptr      / AC := C(ptr)            (direct)
lac i ptr    / AC := C(C(ptr))         (indirect: ptr holds the address)
law 4        / AC := 4                 (12-bit immediate)
law i 4      / AC := ~4 = 777773       (immediate ones-complement → a small negative)
jmp i dv0    / jump to the address stored in dv0
```

Because Y is only 12 bits, the effective address inherits the bank/extension bits of PC. In `cpu.ts` you can see this: `ma = (pc & EXTENSION_MASK) | y`.

## Instruction cheat-sheet

Every mnemonic this program uses, grouped by category. `Y` = operand address (add `i` for indirect); `C(Y)` = the word at Y.

**Memory-reference** (opcodes `02`–`56`; honor the indirect bit)

| Mnemonic | Effect |
|---|---|
| `lac Y` | AC := C(Y) |
| `dac Y` | C(Y) := AC |
| `lio Y` | IO := C(Y) |
| `dio Y` | C(Y) := IO |
| `dzm Y` | C(Y) := 0 |
| `dap Y` | **deposit address part**: replace only the low 12 bits of C(Y) with AC<6:17>; the opcode bits of C(Y) are **preserved**. The self-modify primitive. |
| `add Y` | AC := AC + C(Y) (ones-complement, end-around carry; sets Overflow; `−0` normalized to `+0`) |
| `sub Y` | AC := AC − C(Y) |
| `and Y` / `xor Y` | bitwise AND / XOR into AC |
| `idx Y` | C(Y) := C(Y)+1; AC := result (ones-complement increment, `−0`→`+0`) |
| `isp Y` | like `idx`, then **skip** next instruction if result ≥ 0 (sign clear). The "increment-and-skip-while-non-negative" loop counter. |
| `sad Y` | skip if AC ≠ C(Y) |
| `sas Y` | skip if AC = C(Y) |
| `mul Y` | AC,IO := AC × C(Y), signed 34-bit product (AC high, IO low). *Optional hardware.* |
| `div Y` | (AC,IO)/C(Y) → AC=quotient, IO=remainder; **skips on success**; on overflow does NOT skip and leaves AC,IO unchanged. *Optional hardware.* |
| `xct Y` | execute the single instruction stored at C(Y) |

> **mul/div note.** Both are optional hardware; at startup `beg` (700 octal) probes for them and patches `mps`/`dvs` to take either the hardware path or a software step-loop. This emulator implements `mul`/`div` (opcodes `54`/`56` in `cpu.ts`) but **not** the step-ops `mus`/`dis`, so at runtime the hardware path is always taken and the software `repeat` blocks never run.

**Operate group** (opcode `76`; micro-ops OR together in one word)

| Mnemonic | Effect |
|---|---|
| `cla` | AC := 0 |
| `cli` | IO := 0 |
| `cma` | AC := ~AC (ones-complement negate) |
| `lat` | AC := AC OR testword (reads the front-panel toggles) |
| `clf n` / `stf n` | clear / set program flag n (n=1..6; n=7 = all flags). **On flags 1–4 this is the sound.** |
| `hlt` | halt |
| `nop` / `opr` | no-op |

**Skip group** (opcode `64`; conditions OR together; `i` prefix **inverts**)

| Mnemonic | Skip if… |
|---|---|
| `sma` / `spa` | AC < 0 / AC ≥ 0 |
| `sza` | AC = 0 |
| `spi` | IO ≥ 0 |
| `szf n` | program flag n is **clear** |
| `szs n` | sense switch n is **off** |

Inverted forms: `sza i` skip if AC ≠ 0, `szf i n` skip if flag n **set**, `szs i n` skip if switch n **on**. Two assembled constants are used as unconditional building blocks:

| Constant | Octal | Behavior in this core |
|---|---|---|
| `skp` | `640000` | **never** skips (no condition bits set) |
| `skp i` | `650000` | **always** skips (inverted, still no conditions) |

These are exactly how the mul/div probe patches a cell to "take" or "fall through" a branch (`skp` → fall into `jmp mpu`/`jmp dvu`; `skp i` → skip it).

**Shift / rotate group** (opcode `66`)

| Mnemonic | Effect |
|---|---|
| `ral` / `rar` | rotate AC left / right |
| `ril` | rotate IO left |
| `rcl` / `rcr` | rotate combined 36-bit AC:IO left / right |
| `sal` / `sar` | arithmetic shift AC left / right (sign preserved) |
| `scl` | arithmetic shift combined AC:IO left |

The "**Ns**" notation gives the shift distance: the operand is N one-bits, and the CPU shifts by the **population count** of those bits (`popcnt` in `cpu.ts`). So `9s = 777` octal = 9 places, `8s` = 8, `6s` = 6, `1s` = 1, etc. `rcl`/`rcr`/`scl` move bits across the AC/IO boundary and are used here to pack/unpack 6-bit fields and to rescale `mul` results.

**IOT group** (opcode `72`)

| Mnemonic | Octal | Effect |
|---|---|---|
| `eem` | `724074` | Enter Extend Mode (see below) |
| `rpb` | `730002` | Read Paper-tape Binary: assemble one 18-bit word into IO from 3 tape lines (only lines with bit `200` count; bit `100` ignored) |

**Jumps & calls** (opcodes `60`/`62`/`16`)

| Mnemonic | Effect |
|---|---|
| `jmp Y` | PC := Y |
| `jsp Y` | AC := return linkage (address after the `jsp`, plus Overflow/Extend in the top bits); PC := Y. Subroutine **call** that passes the return address in AC. |
| `jda Y` | C(Y) := AC; AC := return linkage; PC := Y+1. "Jump and deposit AC": stores the argument at the name cell and starts code at Y+1. |

## Indirect chaining vs. Extend mode

With Extend **off**, an indirect reference **chains**: the CPU keeps following the indirect bit through as many words as have it set (multi-level), each time taking only the 12-bit address and inheriting PC's bank. In `cpu.ts` that's the `while (indirect)` loop.

After `eem` (Extend **on**), indirect becomes **single-level** but uses a full 16-bit address (`ma = read(ma) & 0o177777`), so one indirection can land in any bank. The player runs in Extend mode precisely so its pointers can walk compiled data across banks 1–2.

## Calling conventions

**`jsp` subroutine** — caller does `jsp foo`; AC arrives holding the return address. The routine immediately stashes that into its own exit `jmp` with `dap`, then returns through it:

```
        jsp gfg          / call; AC = address after this jsp
...
gfg,    dap gfx          / patch the low 12 bits of the cell at gfx with the return addr
        cla
        ...
gfx,    jmp .            / "jmp ." → jmp to the patched address = return
```

(`gfg` at 176 octal in the source is exactly this pattern.)

**`jda` subroutine** — caller does `jda foo` with the argument in AC. The CPU writes AC into the cell `foo` (so `foo` is a data cell holding the argument) and begins executing at `foo+1`; AC then holds the return linkage. Conventions used in this program:

- **`mpy`** (32 octal): multiplicand in AC, multiplier in IO; `jda mpy` returns the 34-bit signed product in AC (high) / IO (low).
- **`dvd`** (117 octal): `lac hiDividend; lio loDividend; jda dvd; lac divisor; <overflow-return instr>; <normal-return instr>`. The routine `xct`-executes the `lac divisor` line, then the next two instructions are its two return points. Quotient → AC, remainder → IO.
- **`tpo`** (1606 octal): `jda tpo` with a tempo seed in AC; sets up the tempo state (`tpg`/`tpm`/`tpx`).

## Self-modifying code and the `.` idiom

The PDP-1 has no index registers and no stack; loops and returns are built by **patching instruction words at run time**. The assembler symbol "`.`" means *the address of this word itself*, so `jmp .`, `lac .`, and `dac .` are instructions whose operand is the word's own address — a placeholder that some earlier `dap` overwrites.

The mechanism is always `dap`: it deposits only the **address part** (low 12 bits) of AC into the target, leaving the opcode intact. So `dap gfx` turns the cell at `gfx` — which was assembled as `jmp .` — into `jmp <return address>` without disturbing the `jmp` opcode.

```
loop,   lac .            / opcode = lac, address gets patched
        ...
        dap loop         / earlier code writes the next element's address into `loop`
```

This is how subroutines return (patch the exit `jmp`), how loops sweep arrays (patch a `lac`/`dac` to step through addresses), and how the mul/div probe rewires its own control flow (patch a cell to `skp` or `skp i`). Watch for it everywhere; in this codebase the operand-is-self pattern is the rule, not the exception.

## One sound-specific consequence to keep in mind

The player's pitch comes from ones-complement phase accumulation. Per voice it computes `AC = frequency_increment + phase`; when the 17-bit phase overflows into the sign bit (`AC < 0`), the code takes the wrap path and **sets** that voice's program flag; otherwise it stores the phase and **clears** the flag. Toggling flags 1–4 at the overflow rate is the square wave the worklet samples — so the ones-complement sign bit and the `stf`/`clf` micro-ops you just met are, quite literally, the instrument.
