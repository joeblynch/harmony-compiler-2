# `4`-`27`: entry vector and global variables

This is the very top of bank 0: a four-word restart pad, the dispatch jump into the player, and the program's global variable block. The only things that execute as code here are the four-word nop pad at `4`-`7` and the `jmp go` at `10` (reached by falling through the pad on Start@4). Everything from `11` onward is a data cell — though one of them (`tix`) is an *instruction stored as data*, executed later by `xct`.

## Entry vector (`4`-`10`)

```
00004 760000   4/  repeat 4, opr
00005 760000
00006 760000
00007 760000
00010 601000       jmp go
```

`repeat 4, opr` assembles four copies of `opr` (the bare operate instruction, no micro-ops set), word `760000` octal. With opcode `76` and zero in the micro-op field this is a pure no-op (`opr`/`nop` are the same word here). These four nops are a **restart pad** at the conventional PDP-1 program-start address `4`.

The PDP-1 front panel and the RIM loader both leave control near low memory; address `4` is the documented "press Start" entry. Padding it with nops means that if execution lands a word or two early — or if Start is pressed with the address switches a hair off — the CPU simply slides forward harmlessly until it reaches:

```
00010 601000       jmp go
```

`jmp go` (`go` = `1000` octal) is the real dispatch. So "Start at 4" always ends up running `go`. This is exactly the path the browser worklet uses: it sets the program counter to `4` and starts, falling through the nop pad into `jmp go`. (`go` at `1000` then decides, based on flags 5/6 and the sense switches, whether to read a voice, compile, or play.)

Note the address counter steps from `7` to `10`: that is octal — the `4/` origin directive set the location counter to `4`, the `repeat` consumed `4`-`7`, and `jmp go` naturally lands at `10`.

## Global variable block (`11`-`27`)

The directive `11/` resets the location counter to `11`, where the global state cells begin. Each is a single word, initialized by the assembler and (for most) mutated at run time.

```
00011 642017   tuw,  642017   /detuning increments (3 bits each)
00012 100000   tpf,  100000   /tempo fudge factor
00013 005400   noe,  005400   /top of available mem (bank 1) if DDT present
00014 007776   nof,  007776   /top of available mem (each bank) if DDT absent
00015 000700   nog,  000700   /bottom of avail. mem (banks 1, etc.)
00016 000000   npt,  0         /number of parts
00017 000000   top,  0         /top of available bank 0
00020 000000   f1,   0         /freq of first voice
00021 000000   f2,   0
00022 000000   f3,   0
00023 000000   f4,   0
00024 000000   sum,  0         /checksum
00025 000000   ib,   0         /tape buffer pointer
00026 000252   tpg,  252       /tempo factor from test word
00027 667377   tix,  scl 8s    /scale of detuning
```

Glossary, in address order:

| Addr | Name | Init (octal) | Role |
|---|---|---|---|
| `11` | `tuw` | `642017` | Detuning increments, packed 3 bits per field |
| `12` | `tpf` | `100000` | Tempo fudge factor (scaling constant for tempo math) |
| `13` | `noe` | `5400` | Top of usable memory **if DDT is present** |
| `14` | `nof` | `7776` | Top of usable memory per bank **if DDT is absent** |
| `15` | `nog` | `700` | Bottom of the compile-output area |
| `16` | `npt` | `0` | Number of parts (voices) read so far |
| `17` | `top` | `0` | Top of available bank-0 memory (runtime) |
| `20`-`23` | `f1`-`f4` | `0` | Current frequency increment for each of the 4 voices |
| `24` | `sum` | `0` | Running checksum (tape read verification) |
| `25` | `ib` | `0` | Tape-buffer pointer |
| `26` | `tpg` | `252` | Tempo factor derived from the test word (default `252` = 170 decimal) |
| `27` | `tix` | `scl 8s` (`667377`) | Detune scaling shift, **stored as an instruction** |

A few of these warrant detail:

- **`tuw` (`642017`) — packed detuning increments.** The comment "3 bits each" means this single word is a bit-packed table: it holds small per-part detuning offsets in 3-bit fields. The detune setup `tun` (`212`, a `jsp` subroutine using scratch cells `tw0`-`tw2` at `207`-`211`) loads `tuw`, then shifts and masks it — `rar`/`sar` for an overall detuning term and `rcl 3s` to peel off one 3-bit field at a time — when it builds the four detuned frequency tables at `300`/`400`/`500`/`600` octal. Keeping the detune knobs in one word lets the chorus-detune amounts be edited from a single front-panel-depositable cell. (The literal `642017` would *also* decode as a skip-group word — opcode `64` — but that is irrelevant: it is never executed.)

- **`noe`/`nof` — two memory ceilings, picked by sense switch 3.** `noe` (`5400`) reserves headroom for DDT (the PDP-1 debugger); `nof` (`7776`) is the full top when DDT is absent. The read-voice path (`rdp`, `257`) does `lac nof` / `szs 30` / `lac noe`: sense switch 3 OFF makes `szs 30` **skip** the `lac noe`, so the full `nof` ceiling is kept; sense switch 3 ON does **not** skip, so `noe` (the smaller, DDT-safe ceiling) is loaded. The chosen value is stored into `top` (`17`). `nog` (`700`) is the matching *bottom* of the compile area; the compiled segments are written into banks 1-2 at offset `nog`, i.e. `cb` begins at `10000+nog`. (`nog` = `700` happens to equal the program's start address `beg` at `700` in bank 0; that is a numeric coincidence, not a dependency.)

- **`tpg` (`252`) — default tempo factor.** This cell holds the tempo factor; at compile time the program overwrites it with a value derived from the front-panel test word (`cp3` at `1217` does `dac tpg`; the worklet writes the song's tempo into the test word). Its init value `252` octal (= 170 decimal) is the same built-in default the compiler falls back to via `law 252` when the test word is out of range, and that default seed is what `jda tpo` (`1606`) is handed.

- **`f1`-`f4`, `sum`, `ib`, `npt`, `top` — zeroed scratch.** These are pure runtime state and assemble as `0`. `f1`-`f4` are the live per-voice frequency increments consumed by the playing loop (`lup` at `2014`); the loop adds each `f` to its phase accumulator (`p1`-`p4` at `2047`/`2076`/`2117`/`2132`) and, on phase overflow, sets the matching program flag (`stf 1`..`stf 4`) instead of clearing it (`clf 1`..`clf 4`) — and that flag toggling at the overflow rate *is* the audio square wave (flag 1→voice 1 L+, … flag 4→voice 4 R−). `sum` and `ib` belong to tape reading; `npt` counts voices read; `top` records the bank-0 ceiling chosen above.

- **`tix` (`667377`) — an instruction stored as data.** This is the key "instruction-as-data" cell in the block. The source writes `tix, scl 8s`, so the assembler emits the *machine code* for the shift instruction `scl 8s`, not a plain number:

  | Field | Bits | Value | Meaning |
  |---|---|---|---|
  | opcode | top 5 | `66` | shift/rotate group |
  | sub-op | `y & 7000` | `7000` | `scl` — arithmetic shift of the combined `AC:IO` left |
  | shift count | `y & 777` | `377` | popcount = 8 ⇒ shift by **8** places ("8s") |

  giving the word `667377`. (Confirmed against the emulator: opcode `66` with sub-op field `7000` is `scl`, and the shift count is the number of 1-bits in the low 9 bits — `377` octal has eight 1s, so "8s" = 8 positions.) `tix` is **never jumped to**; instead the detune code (`tun`, line `xct tix`) executes it in-line as a single instruction. Keeping it in a named cell rather than coding `scl 8s` literally puts the *scale of the detuning* in one editable word: changing how aggressively the detune offsets are scaled is a one-cell patch (deposit a different shift count into `tix`) rather than an edit-and-reassemble. This is the same trick the whole compiler/player leans on — instructions held as data, then reached via `xct` (as here) or self-modified via `dap` (as in the multiply/divide routines just below at `30`+).

## What this routine accomplishes

These 20 words establish the program's fixed jumping-off point and all of its global state. The `4`-`7` nop pad plus `10: jmp go` give a robust "Start at 4 → run `go`" entry that tolerates landing slightly early. The `11`-`27` block declares every global the compiler and player share: packed detune knobs (`tuw`), tempo constants (`tpf`, default `tpg`), the memory-region bounds that flex with DDT presence (`noe`/`nof`/`nog`), per-voice frequency state (`f1`-`f4`), tape-read bookkeeping (`sum`, `ib`, `npt`, `top`), and the `xct`-executable detune-scale instruction `tix`. Two of these cells (`tuw` decoding as a skip word, `tix` being a genuine `scl 8s` instruction) illustrate the program's pervasive blurring of code and data — though only `tix` is actually executed, and only via `xct`.
