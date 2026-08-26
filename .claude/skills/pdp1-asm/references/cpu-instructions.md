# PDP-1 CPU Instruction Reference

A complete transcription of the PDP-1 instruction set, taken from two DEC documents in this
directory:

- **F-16A** — *PDP-1 Instruction List* (fold-out card, 7/63, Digital Equipment Corporation,
  Maynard, Massachusetts): `F16A_PDP-1_Instruction_List_196307.pdf` (all panels).
- **F-15D** — *PDP-1 Handbook* (October 1963): `F15D_PDP1_Handbook_Oct63.pdf`, printed pages
  7–23 (PDF pages 8–24): "Programming PDP-1", "Instruction Format", "Indirect Addressing",
  "Operating Speeds", and the complete "Standard PDP-1 Instruction List" through the
  Perforated Tape Reader / `rpa`.

Everything below is from those pages. Editorial clarifications that are *not* in the original
text are marked **[Ed.]**. The handbook's detailed prose for the remaining in-out device
instructions (`rpb`, `rrb`, `ppa`/`ppb`, `tyo`/`tyi`, `dpy`, sequence break, extend mode) is on
handbook pages 24+, outside the transcribed range; those instructions appear here with their
F-16A card entries.

## Conventions

- `C(Y)` = contents of memory at address Y; `C(AC)` = contents of the Accumulator;
  `C(IO)` = contents of the In-Out Register.
- All codes are **octal**. Bits are numbered **0 (most significant / sign) through 17 (least
  significant)**.
- Times are microseconds (µsec). The memory cycle is 5 µsec.

---

## 1. Programming fundamentals (Handbook p. 7)

The Central Processor of PDP-1 contains the Control Element, the Memory Buffer Register, the
Arithmetic Element, and the Memory Addressing Element. The Control Element governs the complete
operation of the computer including memory timing, instruction performance and the initiation
of input-output commands. The Arithmetic Element, which includes the Accumulator and the In-Out
Register, performs the arithmetic operations. The Memory Addressing Element, which includes the
Program Counter and the Memory Address Register, performs address bookkeeping and modification.

All in-out operations are performed through the In-Out Register or through the high speed
input-output channels. The PDP-1 is also available with the optional Sequence Break System, a
multi-channel priority interrupt feature which permits concurrent operation of several in-out
devices. A one-channel Sequence Break System is included in the standard PDP-1; optional
systems consist of 16, 32, 64, 128, and 256 channels.

The powerful programming features of PDP-1 include:

- Multiple step indirect addressing
- Boolean operations
- Twelve variations of arithmetic and logical shifting, operating on 18 or 36 bits
- Fifteen basic conditional skip instructions (expandable by combining to form the inclusive
  OR of the separate conditions)
- Three different subroutine calling instructions
- Micro-coded operate instructions
- Index and Index-Conditional instructions
- Execute instruction
- Load-immediate instructions
- Built-in multiply and divide instructions

Six independent flip-flops, called **program flags**, are available for use as program switches
or special in-out synchronizers. Multiply and divide operate in about 20 and 35 microseconds,
respectively.

### Number system

The PDP-1 is a "fixed point" machine using binary arithmetic. Negative numbers are represented
as the **one's complement** of the positive numbers. Bit 0 is the sign bit, which is ZERO for
positive numbers. Bits 1 to 17 are magnitude bits, with Bit 1 the most significant and Bit 17
the least significant. To avoid a frequent point of confusion in one's complement arithmetic,
the representation of −0 is automatically changed to +0 in certain arithmetic operations.

Conversion of decimal numbers into binary (and back) is performed by subroutines. Operations
for floating point numbers are handled by interpretive programming.

---

## 2. Instruction format (Handbook p. 8)

Bits 0 through 4 define the instruction code; thus there are 32 possible instruction codes,
not all of which are used. Instructions divide into two classes:

- **Memory reference instructions** — Bit 5 is the **indirect address bit**; the memory
  address, Y, is in Bits 6 through 17. These digits are sufficient to address 4096 words of
  memory.

  ```
  ┌───────────────┬───┬───────────────────────────────────┐
  │ INSTRUCTION   │ I │        MEMORY ADDRESS, Y          │
  │ 0  1  2  3  4 │ 5 │ 6  7  8  9 10 11 12 13 14 15 16 17│
  └───────────────┴───┴───────────────────────────────────┘
  ```

- **Augmented instructions** — Bits 5 through 17 specify variations of the basic instruction.
  For example, in the shift instruction, Bit 5 specifies direction of shift, Bit 6 specifies
  the character of the shift (arithmetic or logical), Bits 7 and 8 enable the registers
  (01 = AC, 10 = IO, 11 = both) and Bits 9 through 17 specify the number of steps.

### Indirect addressing

A memory reference instruction which is to use an indirect address has a ONE in Bit 5. The
original address, Y, of the instruction is then **not** used to locate the operand, jump
location, etc., as is the normal case. Instead, it locates a memory register whose contents in
Bits 6 through 17 will be used as the address of the original instruction. Thus, Y is not the
location of the operand but the location of the location of the operand. If the memory
register containing the indirect address also has a ONE in Bit 5, the indirect addressing
procedure is repeated and a third address is located. **There is no limit to the number of
times this process can be repeated.**

---

## 3. Operating speeds (Handbook p. 10)

Operating times of PDP-1 instructions are multiples of the memory cycle of **5 microseconds**:

- **Two-cycle instructions** refer twice to memory and thus require **10 µsec** (e.g. add,
  subtract, deposit, load).
- The jump, augmented, and combined augmented instructions need only one call on memory and
  are performed in **5 µsec**.
- In-Out Transfer instructions that do not include the optional wait function require
  **5 µsec**. If the in-out device requires a wait time for completion, the operating time
  depends upon the device being used.
- Each step of indirect addressing requires an **additional 5 µsec**.

---

## 4. Complete instruction list (F-16A card)

| Mnemonic | Octal | Operation | Time (µsec) |
|---|---|---|---|
| `add Y` | 40 | Add C(Y) to C(AC) | 10 |
| `and Y` | 02 | Logical AND of C(Y) with C(AC) | 10 |
| `cal` | 16 | Equals `jda 100` | 10 |
| `dac Y` | 24 | Deposit C(AC) in Y | 10 |
| `dap Y` | 26 | Deposit contents of address part of AC in Y | 10 |
| `dio Y` | 32 | Deposit C(IO) in Y | 10 |
| `dip Y` | 30 | Deposit instruction part of AC in Y | 10 |
| `div Y` | 56 | Divide | 40 max |
| `dzm Y` | 34 | Make C(Y) zero | 10 |
| `idx Y` | 44 | Index (add one to) C(Y), leave in Y & AC | 10 |
| `ior Y` | 04 | Inclusive OR of C(Y) with C(AC) | 10 |
| `iot` | 72 | See In-Out Transfer Group | — |
| `isp Y` | 46 | Index and skip if result is positive | 10 |
| `jda Y` | 17 | Equals `dac Y` plus `jsp Y + 1` | 10 |
| `jfd Y` | 12 | Jump memory field according to C(Y) | 10 |
| `jmp Y` | 60 | Take next instruction from Y | 5 |
| `jsp Y` | 62 | Jump to Y and save Program Counter in AC | 5 |
| `lac Y` | 20 | Load AC with C(Y) | 10 |
| `law N` | 70 | Load AC with the number N | 5 |
| `law −N` | 71 | Load AC with the number −N | 5 |
| `lio Y` | 22 | Load IO with C(Y) | 10 |
| `mul Y` | 54 | Multiply | 25 max |
| `opr` | 76 | See Operate Group | 5 |
| `sad Y` | 50 | Skip next instruction if C(AC) differs from C(Y) | 10 |
| `sas Y` | 52 | Skip next instruction if C(AC) is same as C(Y) | 10 |
| `shift` | 66 | See Shift Group | 5 |
| `skp` | 64 | See Skip Group | 5 |
| `sub Y` | 42 | Subtract C(Y) from C(AC) | 10 |
| `xct Y` | 10 | Perform instruction in Y | 5+ |
| `xor Y` | 06 | Exclusive OR of C(AC) with C(Y) | 10 |

**[Ed.]** The 5-bit opcode occupies bits 0–4, so the "octal code" above is the first two octal
digits of the full word with bit 5 (indirect) folded into the low bit of the second digit:
opcodes are even, and an odd second digit means the indirect/defer bit is set. `cal` (16) and
`jda` (17) are the same opcode row distinguished by that bit — see their descriptions below.
`jfd` belongs to the Type 15 Memory Extension Control option; it appears only on the card, not
in the transcribed handbook pages.

---

## 5. Memory reference instructions (Handbook pp. 15–18)

### Arithmetic instructions

#### `add Y` — Add (op 40, 10 µsec)
The new C(AC) are the sum of C(Y) and the original C(AC). The C(Y) are unchanged. The addition
is performed with 1's complement arithmetic. If the sum of two like-signed numbers yields a
result of the opposite sign, the **overflow flip-flop** will be set (see Skip Group
instructions). A result of minus zero is changed to plus zero.

#### `sub Y` — Subtract (op 42, 10 µsec)
The new C(AC) are the original C(AC) minus the C(Y). The C(Y) are unchanged. The subtraction is
performed using 1's complement arithmetic. When two unlike-signed numbers are subtracted, the
sign of the result must agree with the sign of the original Accumulator, or the overflow
flip-flop will be set (see Skip Group instructions). A result of minus zero can exist in one
instance only: **(−0) − (+0) = (−0)**.

#### `mul Y` — Multiply (op 54, 14 to 25 µsec)
The product of C(AC) and C(Y) is formed in the AC and IO registers. The sign of the product is
in the AC sign bit. IO Bit 17 also contains the sign of the product. The magnitude of the
product is the 34-bit string from AC Bit 1 through IO Bit 16. The C(Y) are not affected by this
instruction. If the entire product results in a minus zero it is changed to a plus zero.

#### `div Y` — Divide (op 56, 30 to 40 µsec; except on overflow, 12 µsec)
The dividend must be in the AC and IO registers in the form indicated in the instruction
Multiply. IO bit 17 is ignored. The divisor is the C(Y). At the completion of the instruction,
the C(AC) are the quotient and the C(IO) are the remainder. The sign of the remainder (in IO
bit zero) is the sign of the dividend. **The instruction that follows a `div` will be skipped
unless an overflow occurs.** The C(Y) are not affected by this instruction. If the remainder or
quotient result in minus zero, that value is changed to plus zero.

If the magnitude of the high order part of the dividend is equal to or greater than the
magnitude of the divisor, an overflow is indicated. In this case, the following instruction is
**not** skipped, the original C(AC) and C(IO) are restored, and the overflow flip-flop is
**not** affected.

### Index instructions

#### `idx Y` — Index (op 44, 10 µsec)
The C(Y) are replaced by C(Y) + 1, which are left in the Accumulator. The previous C(AC) are
lost. Overflow is not indicated. If the original C(Y) equals the integer −1, the result after
indexing is plus zero.

#### `isp Y` — Index and Skip if Positive (op 46, 10 µsec)
The C(Y) are replaced by C(Y) + 1, which are left in the Accumulator. The previous C(AC) are
lost. If, after the addition, the Accumulator is positive, the Program Counter is advanced one
extra position and the next instruction in the sequence is skipped. Overflow is not indicated.
If the original C(Y) equals the integer −1, the result after indexing is plus zero **and the
skip takes place**.

### Logical instructions

#### `and Y` — Logical AND (op 02, 10 µsec)
The bits of C(Y) operate on the corresponding bits of the Accumulator to form the logical AND.
The result is left in the Accumulator. The C(Y) are unaffected by this instruction.

| AC Bit | Y Bit | Result |
|---|---|---|
| 0 | 0 | 0 |
| 0 | 1 | 0 |
| 1 | 0 | 0 |
| 1 | 1 | 1 |

#### `xor Y` — Exclusive OR (op 06, 10 µsec)
The bits of C(Y) operate on the corresponding bits of the Accumulator to form the exclusive OR.
The result is left in the Accumulator. The C(Y) are unaffected by this order.

| AC Bit | Y Bit | Result |
|---|---|---|
| 0 | 0 | 0 |
| 0 | 1 | 1 |
| 1 | 0 | 1 |
| 1 | 1 | 0 |

#### `ior Y` — Inclusive OR (op 04, 10 µsec)
The bits of C(Y) operate on the corresponding bits of the Accumulator to form the inclusive OR.
The result is left in the Accumulator. The C(Y) are unaffected by this order.

| AC Bit | Y Bit | Result |
|---|---|---|
| 0 | 0 | 0 |
| 0 | 1 | 1 |
| 1 | 0 | 1 |
| 1 | 1 | 1 |

### General instructions

#### `lac Y` — Load Accumulator (op 20, 10 µsec)
The C(Y) are placed in the Accumulator. The C(Y) are unchanged. The original C(AC) are lost.

#### `dac Y` — Deposit Accumulator (op 24, 10 µsec)
The C(AC) replace the C(Y) in the memory. The C(AC) are left unchanged by this instruction. The
original C(Y) are lost.

#### `dap Y` — Deposit Address Part (op 26, 10 µsec)
Bits 6 through 17 of the Accumulator replace the corresponding digits of memory register Y.
C(AC) are unchanged, as are the contents of Bits 0 through 5 of Y. The original contents of
Bits 6 through 17 of Y are lost.

#### `dip Y` — Deposit Instruction Part (op 30, 10 µsec)
Bits 0 through 5 of the Accumulator replace the corresponding digits of memory register Y. The
Accumulator is unchanged, as are Bits 6 through 17 of Y. The original contents of Bits 0
through 5 of Y are lost.

#### `lio Y` — Load In-Out Register (op 22, 10 µsec)
The C(Y) are placed in the In-Out Register. C(Y) are unchanged. The original C(IO) are lost.

#### `dio Y` — Deposit In-Out Register (op 32, 10 µsec)
The C(IO) replace the C(Y) in memory. The C(IO) are unaffected by this instruction. The
original C(Y) are lost.

#### `dzm Y` — Deposit Zero in Memory (op 34, 10 µsec)
Clears (sets equal to plus zero) the contents of register Y.

#### `xct Y` — Execute (op 10, 5 µsec plus time of instruction executed)
The instruction located in register Y is executed. The Program Counter remains unchanged
(unless a jump or skip were executed). If a skip instruction is executed by `xct Y`, the next
instruction to be executed will be taken from the address of the `xct Y` plus one, or the
address of the `xct Y` plus two, depending on the skip condition. Execute may be indirectly
addressed, and the instruction being executed may use indirect addressing. An `xct` instruction
may execute other `xct` commands.

#### `jmp Y` — Jump (op 60, 5 µsec)
The next instruction executed will be taken from Memory Register Y. The Program Counter is
reset to Memory Address Y. The original contents of the Program Counter are lost.

#### `jsp Y` — Jump and Save Program Counter (op 62, 5 µsec)
The contents of the Program Counter are transferred to bits 6 through 17 of the AC. The state
of the overflow flip-flop is transferred to bit 0, the condition of the Extend flip-flop to
bit 1, and the contents of the Extended Program Counter to bits 2, 3, 4, and 5 of the AC. When
the transfer takes place, the Program Counter holds the address of the instruction following
the `jsp`. The Program Counter is then reset to Address Y; the next instruction executed will
be taken from Memory Register Y. The original C(AC) are lost.

#### `cal Y` — Call Subroutine (op 16, 10 µsec)
The address part of the instruction, Y, is **ignored**. The contents of the AC are deposited in
Memory Register **100**. The contents of the Program Counter (holding the address of the
instruction following the `cal`) are transferred to bits 6 through 17 of the AC. The state of
the overflow flip-flop, the Extend flip-flop, and Extended Program Counter are saved as
described under `jsp`. The next instruction executed is taken from Memory Register **101**. The
`cal` instruction requires that the indirect bit be ZERO. The instruction may be used as part
of a master routine to call subroutines.

#### `jda Y` — Jump and Deposit Accumulator (op 17, 10 µsec)
The contents of the AC are deposited in Memory Register Y. The contents of the Program Counter
(holding the address of the instruction following the `jda`) are transferred to bits 6 through
17 of the AC. The state of the overflow flip-flop, the Extend flip-flop, and Extended Program
Counter are saved as described under `jsp`. The next instruction executed is taken from Memory
Register **Y + 1**. The `jda` instruction requires that the indirect bit be a ONE, **but
indirect addressing does not occur**. The instruction is equivalent to `dac Y` followed by
`jsp Y + 1`.

**[Ed.]** `cal`/`jda` are one opcode: 16 with the indirect bit clear behaves as `cal`
(fixed registers 100/101), and with the indirect bit set (making the octal prefix 17) behaves
as `jda Y`. Hence the card's "`cal` equals `jda 100`".

#### `sad Y` — Skip if Accumulator and Y differ (op 50, 10 µsec)
The C(Y) are compared with the C(AC). If the two numbers are **different**, the Program Counter
is indexed one extra position and the next instruction in the sequence is skipped. The C(AC)
and the C(Y) are unaffected by this operation.

#### `sas Y` — Skip if Accumulator and Y are the same (op 52, 10 µsec)
The C(Y) are compared with the C(AC). If the two numbers are **identical**, the Program Counter
is indexed one extra position and the next instruction in the sequence is skipped. C(AC) and
C(Y) are unaffected by this operation.

#### `jfd Y` — Jump memory field according to C(Y) (op 12, 10 µsec)
From the F-16A card only (the handbook's transcribed pages do not describe it). **[Ed.]** This
is part of the Type 15 Memory Extension Control option.

---

## 6. Augmented instructions (Handbook pp. 18–22)

### `law N` / `law −N` — Load Accumulator with N (op 70/71, 5 µsec)
The number in the memory address bits of the instruction word is placed in the Accumulator. If
the indirect address bit is ONE (octal prefix 71), **(−N)** is put in the Accumulator.

### Shift Group — `sft` (op 66, 5 µsec)

This group of instructions will rotate or shift the Accumulator and/or the In-Out Register.
When the two registers operate combined, the In-Out Register is considered to be an 18-bit
magnitude extension of the right end of the Accumulator.

**Rotate** is a non-arithmetic cyclic shift. The two ends of the register are logically tied
together and information is rotated as though the register were a ring. (F-16A: rotate is a
logical operation and cycles the bits — *including sign* — in a closed ring.)

**Shift** is an arithmetic operation and is, in effect, multiplication of the number in the
register by 2^±N, where N is the number of shifts; plus is left and minus is right. As bits are
shifted out from one end of a register they are replaced at the other end by ONEs if the number
is negative and ZEROs if the number is positive. **The sign bit is not shifted.** (F-16A: the
sign bit is left unchanged and vacated bits are filled with the sign.)

The number of shift or rotate steps to be performed (N) is indicated by the **number of ONEs in
Bits 9 through 17** of the instruction word (9 max). Thus, Rotate Accumulator Right nine times
is `671777`. A shift or rotate of one place can be indicated nine different ways; the usual
convention is to use the right end of the instruction word (`rar 1` = `671001`).

When operating the PDP-1 in single-step or single-instruction mode, shift group instructions
may appear to be operating incorrectly (judging from the indicator lights of the control
console). This occurs because some shift group instructions overlap into the beginning of the
next instruction.

Each instruction takes 5 µsec:

| Mnemonic | Octal prefix | Operation |
|---|---|---|
| `ral N` | 661 | Rotate Accumulator left N positions |
| `rar N` | 671 | Rotate Accumulator right N positions |
| `ril N` | 662 | Rotate In-Out Register left N positions |
| `rir N` | 672 | Rotate In-Out Register right N positions |
| `rcl N` | 663 | Rotate combined AC and IO left, in a single ring, N positions |
| `rcr N` | 673 | Rotate combined AC and IO right, in a single ring, N positions |
| `sal N` | 665 | Shift Accumulator left N positions |
| `sar N` | 675 | Shift Accumulator right N positions |
| `sil N` | 666 | Shift In-Out Register left N positions |
| `sir N` | 676 | Shift In-Out Register right N positions |
| `scl N` | 667 | Shift combined AC and IO left N positions |
| `scr N` | 677 | Shift combined AC and IO right N positions |

In every case N is the number of ONEs in Bits 9–17 of the instruction word.

**[Ed.]** The octal prefix encodes the p. 8 format note: bit 5 = direction (0 left / 1 right),
bit 6 = character (0 rotate / 1 shift), bits 7–8 = registers (01 AC, 10 IO, 11 both) — e.g.
`66 1` = rotate-left-AC, `67 5` = shift-right-AC.

### Skip Group — `skp` (op 64, 5 µsec)

This group of instructions senses the state of various flip-flops and switches in the machine.
The address portion of the instruction selects the particular function to be sensed; all
members of the group have the same operation code.

The instructions in the Skip Group may be **combined to form the inclusive OR** of the separate
skips. Thus, if Address 3000 is selected, the skip occurs if the overflow flip-flop equals ZERO
*or* if the In-Out Register is positive. The combined instruction still takes 5 microseconds.

The intent of any skip instruction can be **reversed** by making Bit 5 (normally the Indirect
Address Bit) equal to ONE. For example, Skip on Zero Accumulator with Bit 5 set becomes *Do Not
Skip on Zero Accumulator*. **[Ed.]** i.e. `64xxxx` → `65xxxx`.

| Mnemonic | Octal | Operation (F-16A) |
|---|---|---|
| `sza` | 640100 | Skip on ZERO (+0) AC |
| `spa` | 640200 | Skip on plus AC |
| `sma` | 640400 | Skip on minus AC |
| `szo` | 641000 | Skip on ZERO overflow (and clear overflow) |
| `spi` | 642000 | Skip on plus IO |
| `szs` | 6400s0 | Skip on ZERO sense switch (s = switch #) |
| `szf` | 64000f | Skip on ZERO flag (f = flag #) |

#### `sza` — Skip on ZERO Accumulator (address 0100)
If the Accumulator is equal to plus ZERO (all bits are ZERO), the Program Counter is advanced
one extra position and the next instruction in the sequence is skipped.

#### `spa` — Skip on Plus Accumulator (address 0200)
If the sign bit of the Accumulator is ZERO, the Program Counter is advanced one extra position
and the next instruction in the sequence is skipped.

#### `sma` — Skip on Minus Accumulator (address 0400)
If the sign bit of the Accumulator is ONE, the Program Counter is advanced one extra position
and the next instruction in the sequence is skipped.

#### `szo` — Skip on ZERO Overflow (address 1000)
If the overflow flip-flop is ZERO, the Program Counter is advanced one extra position and the
next instruction in the sequence is skipped. **The overflow flip-flop is cleared by the
instruction.** This flip-flop is set only by an addition or subtraction that exceeds the
capacity of the Accumulator (see `add` and `sub`). The overflow flip-flop is *not* cleared by
arithmetic operations which do not cause an overflow — thus a whole series of arithmetic
operations can be checked for correctness by a single `szo`. The overflow flip-flop is also
cleared by the console **Start** switch.

#### `spi` — Skip on Plus In-Out Register (address 2000)
If the sign digit of the In-Out Register is ZERO, the Program Counter is indexed one extra
position and the next instruction in sequence is skipped.

#### `szs` — Skip on ZERO Switch (addresses 0010, 0020, … 0070)
If the selected Sense Switch is ZERO, the Program Counter is advanced one extra position and
the next instruction in the sequence is skipped. Address 10 senses the position of Sense
Switch 1, Address 20 Switch 2, etc. **Address 70 senses all the switches**; if 70 is selected,
all 6 switches must be ZERO to cause the skip.

#### `szf` — Skip on ZERO Program Flag (addresses 0001 to 0007)
If the selected program flag is ZERO, the Program Counter is advanced one extra position and
the next instruction in the sequence is skipped. Address 1 selects Program Flag 1, etc.
**Address 7 selects all program flags**, which must all be ZERO to cause the skip.

### Operate Group — `opr` (op 76, 5 µsec)

This instruction group performs miscellaneous operations on various Central Processor
registers. The address portion of the instruction specifies the action to be performed.

The instructions in the Operate Group can be **combined to give the union of the functions**:
`opr 3200` will clear the AC, put TW (Test Word) in AC, and complement AC. The F-16A card calls
this a "micro program set of instructions": `cla ∨ cli ∨ clf` = `764207` (5 microseconds)
**[Ed.]** — the example ORs `cla` (760200), `cli` (764000) and `clf 7` (760007).

| Mnemonic | Octal | Operation (F-16A) |
|---|---|---|
| `nop` | 760000 | No operation |
| `cla` | 760200 | Clear AC |
| `cli` | 764000 | Clear IO |
| `cma` | 761000 | Complement AC |
| `lat` | 762200 | Load AC from test word switches |
| `lap` | 760100 | Load AC with Program Counter **[Ed.** octal composed from op 76 + address 0100; not listed on F-16A**]** |
| `hlt` | 760400 | Halt |
| `clf n` | 760001–760007 | Clear selected program flag |
| `stf n` | 760011–760017 | Set selected program flag |

#### `cla` — Clear Accumulator (address 0200)
Clears (sets equal to plus zero) the contents of the Accumulator.

#### `cli` — Clear In-Out Register (address 4000)
Clears (sets equal to plus zero) the In-Out Register.

#### `cma` — Complement Accumulator (address 1000)
Complements (changes all ONEs to ZEROs and all ZEROs to ONEs) the contents of the Accumulator.

#### `lat` — Load Accumulator from Test Word (address 2000)
Forms the **inclusive OR** of the C(AC) and the contents of the Test Word. This instruction is
usually combined with address 0200 (Clear Accumulator) — i.e. `opr 2200` = `lat` as listed,
762200 — so that C(AC) will equal the contents of the Test Word switches.

#### `lap` — Load Accumulator with Program Counter (address 0100)
Forms the inclusive OR of the C(AC) and the contents of the Program Counter (which contains
the address of the instruction following the `lap`) in AC bits 6 through 17. Also, the
inclusive OR of AC bit 0 and the state of the overflow flip-flop is formed in AC bit 0. This
instruction is usually combined with address 0200 (Clear Accumulator) so that the C(AC) will
equal the contents of the overflow flip-flop (in AC bit 0) and the contents of the Program
Counter (in AC bits 6 through 17). The contents of the Extend flip-flop are transferred to AC
bit 1, the contents of the Extended Program Counter to bits 2, 3, 4, and 5.

#### `hlt` — Halt (address 0400)
Stops the computer.

#### `clf n` — Clear Selected Program Flag (addresses 0001 to 0007)
Clears the selected program flag. Address 01 clears Program Flag 1, 02 clears Program Flag 2,
etc. **Address 07 clears all program flags.**

#### `stf n` — Set Selected Program Flag (addresses 0011 to 0017)
Sets the selected program flag. Address 11 sets Program Flag 1, 12 sets Program Flag 2, etc.
**Address 17 sets all program flags.**

#### `nop` — No Operation (address 0000)
The state of the computer is unaffected by this operation, and the Program Counter continues
in sequence.

---

## 7. In-Out Transfer Group — `iot` (op 72; 5 µsec without in-out wait) (Handbook p. 22)

The variations within this group of instructions perform all the in-out control and
information transfer functions.

**In-out wait (Bit 5).** If Bit 5 (normally the Indirect Address bit) is a ONE, the computer
enters a special waiting state until the completion pulse from the activated device has
returned; the computer then resumes operation of the instruction sequence. The computer may be
interrupted from the special waiting state to serve a sequence break request or a high speed
channel request.

Most in-out operations require a known minimum time before completion. This time may be
utilized for programming: the appropriate In-Out Transfer can be given with **no in-out wait
(Bit 5 a ZERO and Bit 6 a ONE)** and the instruction sequence continues. This sequence must
then include an iot instruction `730000`, which performs nothing but the in-out wait. The
computer enters the special waiting state until the device returns the in-out restart pulse —
if the device has already returned the completion pulse before the `730000`, the computer
proceeds immediately.

**Completion pulse (Bit 6).** Bit 6 determines whether a completion pulse will or will not be
received from the in-out device. When it is *different* from Bit 5, a completion pulse will be
received; when it is the *same* as Bit 5, a completion pulse will not be received.

**Device/control bits.** In addition to the control function of Bits 5 and 6, Bits 7 through 11
are also used as control bits serving to extend greatly the power of the iot instructions.
Bits 12 through 17 designate a class of input or output devices (such as typewriters), and may
be further defined by Bits 7 through 11 as referring to Typewriter 1, 2, 3, etc. In several of
the optional in-out devices — in particular the magnetic tape — Bits 7 through 11 specify
particular functions such as forward, backward, etc. If a large number of specialized devices
are to be attached, these bits may be used to further decode the in-out transfer instruction
to perform totally distinct functions.

### Basic list (F-16A card)

The number of variations in this group may be greatly increased for optional or special
in-out equipment.

| Mnemonic | Octal | Operation |
|---|---|---|
| `eem` | 724074 | Enter Extend Mode |
| `lem` | 720074 | Leave Extend Mode |
| `cks` | 720033 | Check Status |
| `dpy` | 720007\* | Display One Point on Precision CRT |
| `esm` | 720055 | Enter Sequence Break Mode |
| `lsm` | 720054 | Leave Sequence Break Mode |
| `ppa` | 720005\* | Punch Perforated Tape Alphanumeric |
| `ppb` | 720006\* | Punch Perforated Tape Binary |
| `rpa` | 720001\* | Read Perforated Tape Alphanumeric |
| `rpb` | 720002\* | Read Perforated Tape Binary |
| `rrb` | 720030 | Read Reader Buffer |
| `tyi` | 720004 | Read Typewriter Input Switches |
| `tyo` | 720003\* | Type Out |

\* If the instruction part is **73 instead of 72**, the computer will wait for completion.
**[Ed.]** On the card `tyi` is followed by a faint dot where the other entries carry the
asterisk — it is ambiguous in the print whether `tyi` is starred.

### `cks` — Check Status (720033) (F-16A card)

Checks the status of various in-out devices and sets IO bits 0 through 6 for subsequent
program interrogation as follows:

| IO bit | Status register definition |
|---|---|
| 0 | Set to 1 when light pulse strikes Light Pen. Set to 0 at the start of each `dpy` instruction. |
| 1 | Set to 1 when Perforated Tape Reader Buffer has information ready to be transferred to IO Register. Set to 0 by the Reader return pulse or by the `rrb` instruction. |
| 2 | Set to 1 when Typewriter is free to receive a `typ` instruction. Set to 0 at the start of each `typ` instruction. **[Ed.** "typ" as printed; i.e. `tyo` **]** |
| 3 | Set to 1 when Typewriter key is stuck. Set to 0 by completion of `tyi` instruction. **[Ed.** "stuck" as printed — i.e. a key has been struck and the input has not yet been read **]** |
| 4 | Set to 1 when Tape Punch is free to receive a `ppa` or `ppb` instruction. Set to 0 at the start of each `ppa` or `ppb` instruction. |
| 5 | Set to 1 when Type 23 Drum address equals address specified by `dba` instruction. Set to 0 by the `dcc` instruction. |
| 6 | Set to 1 on entering Sequence Break Mode. Set to 0 on leaving Sequence Break Mode. |

### Perforated Tape Reader and `rpa` (Handbook p. 23)

The Perforated Tape Reader of the PDP-1 is a photoelectric device capable of reading **400
lines per second**. Three lines form the standard 18-bit word when reading binary punched
eight-hole tape. Five-, six- and seven-hole tape may also be read.

#### `rpa` — Read Perforated Tape, Alphanumeric (address 0001)
This instruction reads one line of tape (all eight channels) and transfers the resulting 8-bit
code to the Reader Buffer.

- If bits 5 and 6 of the `rpa` instruction are **both zero** (`720001`), the contents of the
  Reader Buffer must be transferred to the IO Register by executing a `rrb` instruction. When
  the Reader Buffer has information ready to be transferred to the IO Register, Status
  Register Bit 1 is set to one.
- If bits 5 and 6 are **different** (`730001` or `724001`), the 8-bit code read from tape is
  automatically transferred to the IO Register via the Reader Buffer, and appears as follows
  (the remaining bits of the IO Register are set to zero):

  | IO bits | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 |
  |---|---|---|---|---|---|---|---|---|
  | Tape channels | 8 | 7 | 6 | 5 | 4 | 3 | 2 | 1 |

The code of the off-line tape preparation typewriter (Friden FIO-DEC Recorder-Reproducer)
contains an **odd parity bit**. This bit may be checked by the read-in program. The FIO-DEC
code can be converted to the Concise (6-bit) code used by PDP-1 merely by dropping the eighth
bit (parity).

---

## Appendix: Alphanumeric codes (F-16A card)

FIO-DEC is the 8-hole tape code (hole 8, octal 200, is the odd-parity bit); the Concise code is
the 6-bit code used by the PDP-1 (e.g. by `tyo`, in IO bits 12–17). A dash means the character
has no code in that column. Characters are shown as lower case / upper case.

| Character (lc / UC) | FIO-DEC | Concise |
|---|---|---|
| a A | 61 | 61 |
| b B | 62 | 62 |
| c C | 263 | 63 |
| d D | 64 | 64 |
| e E | 265 | 65 |
| f F | 266 | 66 |
| g G | 67 | 67 |
| h H | 70 | 70 |
| i I | 271 | 71 |
| j J | 241 | 41 |
| k K | 242 | 42 |
| l L | 43 | 43 |
| m M | 244 | 44 |
| n N | 45 | 45 |
| o O | 46 | 46 |
| p P | 247 | 47 |
| q Q | 250 | 50 |
| r R | 51 | 51 |
| s S | 222 | 22 |
| t T | 23 | 23 |
| u U | 224 | 24 |
| v V | 25 | 25 |
| w W | 26 | 26 |
| x X | 227 | 27 |
| y Y | 230 | 30 |
| z Z | 31 | 31 |
| 0 → | 20 | 20 |
| 1 " | 01 | 01 |
| 2 ' | 02 | 02 |
| 3 ~ | 203 | 03 |
| 4 ⊃ | 04 | 04 |
| 5 ∨ | 205 | 05 |
| 6 ∧ | 206 | 06 |
| 7 < | 07 | 07 |
| 8 > | 10 | 10 |
| 9 ↑ | 211 | 11 |
| ( [ | 57 | 57 |
| ) ] | 255 | 55 |
| — (overbar) \| | 256 | 56 |
| − + | 54 | 54 |
| · (center dot) _ | 40 | 40 |
| , = | 233 | 33 |
| . × | 73 | 73 |
| / ? | 221 | 21 |
| Lower Case | 272 | 72 |
| Upper Case | 274 | 74 |
| Space | 200 | 00 |
| Bk. Sp. (backspace) | 75 | 75 |
| Tab | 236 | 36 |
| Carr. Ret. | 277 | 77 |
| Tape Feed | 00 | 00 |
| Red\* | — | 35 |
| Blk\* | — | 34 |
| Stop Code | 13 | — |
| Delete | 100 | — |

\* Used on type-out only, not on keyboard.

**[Ed.]** This repo's `cli/fiodec.ts` / `utils/ascii2fiodec` substitute ASCII stand-ins for the
non-ASCII Flexowriter glyphs: `:` for →, `{` for ~, `}` for ⊃, `|` for ∨, `&` for ∧, `!` for ↑,
`~` for the overbar, `%` for the vertical bar, `;` for the center dot, `_` for underline, `#`
for ×, and `@` for the Stop Code.
