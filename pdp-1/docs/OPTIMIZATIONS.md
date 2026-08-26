# PDP-1 Optimization & Programming Techniques

A complete catalog of the performance tricks, space-saving idioms, and programming
techniques found in two of the finest surviving PDP-1 programs, both by Peter Samson:

- **`pdp-1/tapes/pdp1m13/pdp1m13.lst`** — *PDP-1 Music 13* (“m13” below): the real-time
  four-voice music player. Its inner loop **is** the audio oscillator — pitch is derived
  from instruction timing — so it is a masterclass in cycle-exact coding.
- **`pdp-1/tapes/hc1d/hc1d.lst`** — *Harmony Compiler, phase 1* (5/21/63; “hc1” below):
  the offline compiler that turns Flexowriter-typed music notation into the intermediate
  tapes m13 plays. It is a masterclass in compiler construction, I/O craft, and
  macro-assembler leverage on a 4K, two-register machine.

Instruction semantics and timings are per `CPU_INSTRUCTIONS.md` (same directory).
Citations give the label and octal address in the listing, e.g. (m13 `lup`, 2014);
for macro definitions, which assemble no addresses, they give listing line numbers.
All numbers are octal unless marked decimal. The listings are 2006 retypings and
re-assemblies; their `UD`/`IC` error flags are re-assembly artifacts (missing `mus`/`dis`
opcodes, `flexo` pseudo, >6-char macro names), not defects of the original code.

---

## Part I — The cost model: what you are optimizing

Everything below follows from four facts about the machine.

**1. Time is memory cycles.** One cycle = 5 µs. Memory-reference instructions
(`lac dac add sub and ior xor sad sas idx isp dip dap dio lio dzm cal jda`) cost 10 µs;
`jmp`, `jsp`, `law`, every shift/rotate, every skip, every operate, and non-waiting `iot`
cost 5 µs; `xct` costs 5 µs + its target; each level of indirection adds 5 µs;
`mul` 14–25 µs, `div` 30–40 µs (12 on overflow). So:

- An augmented instruction (skip, shift, operate, law) is **half price**. Prefer them.
- A `jmp` costs the same 5 µs as a skip — but a skip needs no target word.
- Reloading a value you could have kept is a whole extra memory cycle. Structure code so
  the value you need next is already in AC or IO.

**2. There are only two data registers** (AC, IO), six program flags, and the overflow
flip-flop. Everything else is core. IO is a full second accumulator for load/store
(`lio`/`dio`), the shift partner of AC, and the in-out data register — juggle both
constantly (m13 `stp` keeps a status pointer in IO across a halt; the compiled-stream
writer `put` takes its argument in IO because AC is busy).

**3. There is no index register and no stack.** Indexing is done by writing into the
address field of an instruction (`dap`), and calling is done by saving the PC into AC
(`jsp`/`jda`). Self-modifying code is not a stunt here; it is **the** addressing
mechanism, with a well-developed idiom set (Part IV).

**4. Words are tape.** The program loads from paper tape through a RIM/BIN loader;
every word emitted is load time and 4K is the whole world (m13 shares its banks with the
music data and optionally with the DDT debugger). Space savings and speed savings are
usually the same savings.

---

## Part II — One’s-complement arithmetic idioms

The PDP-1 is one’s complement: negation is pure bit complement (`cma`), which enables a
family of tricks that two’s-complement machines lost.

### 2.1 Negate = `cma`; negative immediates = `law i N`
No “add 1” is ever needed. `law i 4` loads −4 in one 5 µs word (m13 1030,
`law i 4 / add ij / sma` — “are we full?”). `law i 1 / add mn2` subtracts 1 from a
memory-loaded value without a literal (m13 1522).

### 2.2 Compare without losing the value: subtract, test, **add back**
Naive compare-and-keep needs a temporary. Instead:

```
lac x
sub min       / x - min
sma           / negative => new minimum
jmp no
add min       / restore x  (cheaper than re-loading x)
dac min
```
(m13 `cc2`, 1472–1500; again at 1504–1511.) The restore is `add`, 10 µs, but saves a
`dac t / lac t` pair and a temp word. The same shape does **range checks** without a
temp: m13 validates tempo `40 ≤ t < 1400` as
`sub (1400 / sma / jmp too-big / add (1340 / spa / jmp too-small / lac tem`
(m13 1206–1214) — the two constants sum back to the original bound.

### 2.3 Sign of a product = XOR of signs
The software multiply computes magnitudes, then decides the result sign with
`lac mpr / xor mpy / sma / jmp positive` (m13 74–76). One `xor` replaces four
sign-tests.

### 2.4 Double-length negate by complement-rotate-complement
One’s complement negation of a 34-bit AC:IO quantity needs no carry propagation:

```
cma           / complement high half
rcr 9s
rcr 9s        / rotate 18: IO into AC
cma           / complement (former) low half
rcr 9s
rcr 9s        / rotate back
```
(m13 77–105.) Two full 18-bit rotates are just four 5 µs instructions; `rcr 9s` is the
maximal 9-step rotate, so 18 steps = two instructions.

### 2.5 Sign-extending a small field: rotate to the top, arithmetic-shift down
To sign-extend a 6-bit field sitting in bits 12–17:

```
and (77       / isolate the field
rar 6s        / rotate it into bits 0-5  (bit 12 -> sign!)
sar 6s        / arithmetic shift back: sign bit smears down
sar 5s        / ...and keep shifting for additional scaling
```
(m13 `tun`, 215–220.) `sar` refills vacated high bits with the sign, so after the
rotate-up the arithmetic shift performs the sign extension for free — and here it is
merged with the (÷2⁵) scaling the algorithm wanted anyway. Naive sign extension
(test sign bit, OR in ones) costs a skip, a load, and a constant.

### 2.6 Multiplication by small constants without `mul`
- **×2ⁿ / ÷2ⁿ**: `sal n` / `sar n` (5 µs).
- **×3**: `sal 1s / add x` — used with a *conditional* add to get “×2 or ×3”:
  duration ×2, then `szf i 6 / add tem` adds the third copy **unless** the triplet
  flag is set — normal notes get ×3, triplets keep ×2, which is exactly the LCM
  scaling of 2.7 (m13 1420–1422). One flag test converts duple to triple meter.
- **×10 (decimal input)**: hc1 macro `x10dec` = `ral 1s / dac t1 / ral 2s / add t1`
  (x·2, save, x·8, add) — 4 words, 30 µs, no `mul` (hc1 282–287, used in the digit
  reader at `s14`).
- **×5/8 (articulation)**: `jda c58` → `lac c58 / sar 2s / add c58 / sar 1s` =
  (x/4 + x)/2 (m13 `c58`, 1463–1471). Shift-add chains beat `mul` (25 µs + setup) for
  any short constant.

### 2.7 Scale to the LCM so fractions are exact integers
Both programs count time in **192nds of a whole note ×8**: 64ths (×3 for triplets)
(×8 for articulation precision). hc1 counts measure fullness in “units × 3” so a
normal note contributes 3/unit and a triplet note 2/unit — both integers (hc1 `s32`/
`2sb`, 2101–2111: triplet path doubles, normal path triples). Choose your time base as
the LCM of every subdivision you must represent, and **document the units in comments**
the way these listings do (“min 192nds * 8”, “loop ct / 2”).

### 2.8 Building packed words by addition
When fields are pre-shifted and disjoint, `add` **is** OR, and reads better:
hc1 assembles a note word as
`load nft / addi tne / addi sv / addi 3i / call cn` — duration + (pitch, pre-shifted
by `x2to7` = `ral 7s`) + slur/staccato bits + triplet bit (hc1 `s70`, 2054–2060). Fields
are range-checked before shifting (`tlesc 2 … tgrec 76`, hc1 1620–1631) so overlap is
impossible. Combined constants pack several fields into one literal: `(400002` =
legato-bit + 2 time units (hc1 `s84`, 1764).

### 2.9 Parity of a byte in four instructions: the computed-rotate trick
The most exotic arithmetic trick in either program. hc1’s tape reader validates the
FIO-DEC odd-parity of each 8-bit tape byte like this (hc1 `rp`, 37–45):

```
law 1000        / bit 8: will complete 670000 into 671000 = "rar"
add t1          / AC = 1000 + byte
dap .+2         / deposit into bits 6-17 of the word below
law 2525        / AC = 000 000 010 101 010 101 (alternating bits)
670000          / becomes 671000+byte: rar with count field = byte!
sma             / minus <=> odd number of rotate steps
jmp rtb         / even parity: error (unless blank tape)
```

Recall a shift/rotate count is the **number of ONE bits** in bits 9–17 of the
instruction. So the patched instruction rotates AC right by popcount(byte). Rotating
the alternating pattern `2525` by N ≤ 8 steps leaves the sign bit equal to N mod 2 —
i.e. **the parity of the byte’s population count**, computed in O(1) with no loop, no
table. Two details show the complete mastery: the added `1000` lands in bit 8, turning
the bare register-less `670000` into `671000` (= `rar` of the AC) — the constant
completes the *opcode* while the byte (≤ 377) falls wholly inside the count field; and
the byte’s parity hole is included in the popcount, which is precisely FIO-DEC’s
odd-parity condition. A naive parity loop is ~8 iterations × 25 µs; this is 30 µs flat
and 7 words.

The general lesson: *the shift count field is data*. You can compute into it (`dap`)
and use “number of ones” as a numeric function.

---

## Part III — The skip calculus

Skips are the machine’s entire conditional-execution system. The listings use them with
algebraic precision.

### 3.1 The two-word conditional: pick the skip sense so the `jmp` is the taken branch
hc1’s branch macros compile every test to exactly `skip-if-NOT-condition / jmp target`:

```
trze T:  sza i / jmp T      ("transfer on zero")
trnz T:  sza   / jmp T
trpl T:  sma   / jmp T
trmi T:  spa   / jmp T
trel A,T: sad A / jmp T
trnl A,T: sas A / jmp T
```
(hc1 95–137.) Note each uses the *reversed* skip (`sza i` to branch on zero). Naive
code that skips *around* a jump (`sza / jmp over / jmp T`) wastes a word and a cycle.
Cost: 10 µs either way, 2 words. Every conditional in both programs is this shape.

### 3.2 Conditionally execute exactly one instruction — no jump at all
When the “then” branch is a single instruction, skip straight over it:

- Absolute value: `spa / cma` (m13 `mpy`, 40–41).
- Clamp negative to zero: `spa / cla` (m13 1432–1433, 1437–1440).
- Normalize characters: `sad (77 / cla`, `sad (36 / cla` — carriage return and tab
  both become 0 in 2 words each (hc1 `rp`, 50–53).
- Set a flag from a memory boolean: `cla / sas f5 / stf 5` — if f5 ≠ 0 the `sas`
  does not skip and the `stf` executes (m13 `gfg`, 177–205). Three words, 20 µs,
  no jump, AC ends 0 for the next test.
- Choose an alternate source: `lac nof / szs 30 / lac noe` — switch 3 selects the
  DDT-safe memory bound; the second load simply overwrites the first (m13 `rdp`,
  1024–1026). Load-then-conditionally-overwrite beats branching to two loads.

### 3.3 Branchless select of one of two values via IO
The hardware-probe code (see Part VIII) picks between two instruction words with no
jump at all:

```
lio (skp        / default: the "skp" instruction word in IO
sza             / hardware mul left AC = 0 ?
lio (skp i      / no: overwrite IO with "skp i"
dio mps         / patch the chosen instruction into the multiply routine
```
(m13 707–712, again 717–722.) This is a conditional move, 1962-style: unconditionally
load the default, conditionally load the alternative over it.

### 3.4 Combined skips: OR conditions in one instruction
Skip-group bits OR together (`CPU_INSTRUCTIONS.md` §6). hc1 manufactures “skip if
AC ≤ 0” **arithmetically in the assembler**:

```
define tgrec C,T
        sub (C
        sma+sza-skp     / 640400+640100-640000 = 640500: skip on minus OR zero
        jmp T
```
(hc1 202–206; assembled value 640500 visible at 217.) The `-skp` subtracts the
double-counted opcode. One instruction replaces a two-skip chain. Any OR of
`sza spa sma szo spi szs szf` conditions can be built this way.

### 3.5 AND-ing equality tests with a `sad`/`sas` chain
To test “all four voices are at a bar line” m13 chains complementary skips so that each
pair of pointers needs only one jump:

```
lac (600000
sad i n       / voice 0 != bar  -> skip the sas (fall to jmp cc)
sas i n+1     / voice 1 == bar  -> skip the jmp
jmp cc        / some voice is mid-measure
sad i n+2
sas i n+3
jmp cc
/ all four at bar line
```
(m13 `ca`, 1226–1234, repeated 1267–1275.) Read it as: `sad` = “if equal, consider the
next test”, `sas` = “if equal, we pass”. Two tests share one branch target; the pattern
extends to any width. (Also note the *indirect* compares `sad i n` — testing through a
pointer without disturbing it.)

### 3.6 Skips as multi-way returns
`isp` (increment-and-skip-if-positive), `sad`/`sas`, and the `div` skip convention give
subroutines *skip returns*: m13’s divide wrapper returns to call+1 on overflow and
call+2 on success (Part V), exactly like hardware `div`, which “skips unless overflow”.

### 3.7 Loop control idioms
- **Negative counter + `isp`**: store −N, loop with `isp ct / jmp loop` — one 10 µs
  instruction is the whole increment-test-branch (m13 `rd1` 1047–1050; the play loop
  itself, 2044–2045). Counts are often stored pre-negated by the producer
  (m13 1776–2000: `sal 1s / cma / dac ct`).
- **Pointer-limit check while copying**: `idx ib / sad top / hlt` — bounds-assert in
  two words (m13 1044–1046).
- **Index vs constant**: `idx ij / sas (4 / jmp loop` — four-voice loops everywhere
  (m13 1264–1266, 1501–1503, 1602–1604).

---

## Part IV — Self-modifying code: the address-patch toolkit

With no index registers, the address field of an instruction is the machine’s index
register file. These programs treat instructions as first-class data with complete
discipline. (All of this predates — and on this machine outperforms — “clean”
indirect-addressing style, which costs +5 µs per access.)

### 4.1 The canonical indexed access
```
law b         / array base                (5)
add ij        / plus index               (10)
dap rd2       / deposit into instruction (10)
...
rd2, dac .    / the access itself        (10)
```
(m13 `rdm`, 1057–1063.) `dac .` / `lac .` / `add .` / `jmp .` are conventional
placeholders — “address to be filled in”. For *sequential* access, prefer a pointer
cell and indirection instead: `lio i ptr / idx ptr` (m13 `nxt`, 1740, 1771) — 10+10 µs
with no setup, and `idx`’s result in AC is often reused.

### 4.2 Chained multi-array setup with difference literals
To point five patched instructions at parallel arrays `b,n,t,a,p` indexed by the same
`ij`, compute one running address and nudge it from array to array with **assembly-time
difference constants**:

```
law b
add ij
add (n-b      / now points into n
dap c0n
dap c1n
add (t-n      / now points into t
dap c0t
dap c1t
add (a-t
...
```
(m13 `cc1`, 1323–1337; same shape at `c4o`, 1561–1567.) Each additional array costs
one `add` (10 µs) instead of a fresh `law/add` pair, and the symbolic differences
survive any layout change. Note several targets are patched from the same value
(`dap c0n / dap c1n`) — patch *every* user of the pointer while it is in AC.

### 4.3 The instruction **is** the loop variable
The most distinctive PDP-1 idiom in these listings. The loop’s data-access instruction
is itself incremented, and the **loop terminates by comparing the whole instruction
word against its final form, kept as a literal**:

```
to,  dac .          / patched: dac tab ... dac tbe-1
     idx to         / advance the deposit instruction itself
     sad (dac tbe   / has it become "dac tbe"?  then done
tux, jmp .          / exit
     idx ti         / advance the fetch instruction
     sas (add pt+100/ has it become "add pt+100"? then next voice
     jmp tl         / next pitch
     jmp tn2        / next voice
```
(m13 `tun`, 243–252.) One word (`to`) serves as pointer, access, and loop counter;
the end test costs one `sad` against a literal the assembler builds (`(dac tbe` is
just 24xxxx arithmetic). hc1’s `copy` macro is the same trick for block moves
(`idx .-2 / idx .-2 / sas (dac I+N / jmp .-5`, hc1 289–300), and its `search` macro
closes the loop with the *inverse* transformation — **recovering the index from the
instruction by subtracting its base form**:

```
        law W
        dap .+2
        lac t1
        sad             / patched compare, marches through W..W+N-1
        jmp .+5         / found
        idx .-2
        sas (sad W+N    / end of table?
        jmp .-5
        jmp ERR         / not found
        lac .-6         / load the sad instruction itself...
        add (-sad-W     / ...minus (opcode+base) = the INDEX, in AC
```
(hc1 302–315, used at `s21`, 1265–1300.) Note the literal `(-sad-W` — the assembler
negating an *instruction* plus a symbol. No counter cell exists anywhere in this loop.

### 4.4 `dap .+1` fall-through: compute a pointer, use it immediately
```
law t6        / table page number
rcl 6s        / (page<<6) | 6-bit index from IO  -- see Part VI
dap .+1
lac .         / fetch table[index]
```
(m13 `nxt`, 1741–1744, repeated per voice.) Two words of “addressing mode”. hc1 wraps
the same shape as macros — the standard library of patch idioms:

```
lookup V:   add (V  / dap .+1 / lac        (indexed load, table base V)
putback U,Q:add (U  / dap .+2 / lac Q / dac   (indexed store)
dispat U:   add (U  / dap .+1 / jmp i      (computed goto via table U)
diswit L,U: add (U  / dap .+2 / lac L / jmp i  (computed goto + argument)
```
(hc1 149–152, 269–274, 256–267.) Give the idioms names; use them everywhere
(`lookup f`, `putback mt, t1`, `dispatch pcd-1`, …).

### 4.5 One patched instruction, two duties
Because a patched instruction is addressable, other code can `xct` it:

- m13’s tuning loop patches `ti, add .` to point at the pitch table; the loop first
  *falls into* it after `cla` (acting as a **load**), then later `xct ti` re-executes
  it (acting as an **add**) to apply base+detune (m13 `tl`/`ti`, 235–242 and 151).
  One pointer maintained, two operations served.
- The compiler patches `c1t, dac .` (store note-time) and reuses it from the bar-line
  path as `cla / xct c1t / xct c1a / xct c0p` — “store zero into all three per-voice
  cells, wherever they currently point” (m13 `c9c`, 1363–1366). The patch is made
  once; every consumer, local or remote, stays consistent automatically.

### 4.6 Dispatch tables
Three kinds appear:

1. **Jump tables of addresses**, entered via `dispat`: character-class handlers
   (`s2y`, hc1 2150), pseudo-instruction handlers (`pcd`, hc1 2345), embellishment
   entry/exit handlers (`ebd`/`ebe`, hc1 2205/2214). Tables of *addresses*, `jmp i`
   through a patched slot. Note `dispatch pcd-1`, `lookup pnm-1`: **base−1 literals
   give 1-origin indexing free of a decrement.**
2. **Tables of executable instructions**, entered via `xct`: m13’s articulation table
   `cxt` (1443–1462) holds one *instruction* per articulation code —
   `sar 3s` (⅛), `sar 2s` (¼), `sar 1s` (½), `cla` (legato: zero gap),
   `jda c58` (⅝ — a full subroutine call as a table entry!), and `hlt` in every
   impossible slot as a trap. The consumer is `c0x, xct .` patched with
   `add (cxt / dap c0x`. When each case is one operation on AC, this beats a jump
   table by the whole cost of the jumps: dispatch is `xct` (5 µs) + one 5 µs
   instruction, in place.
3. **Parallel name/handler tables** for keyword matching: `pnm` (pointers to
   null-terminated, one-concise-char-per-word strings, hc1 2366–2515) beside `pcd`
   (handlers). The matcher walks characters with `lookup 0` through a patched base
   and falls to the next candidate on mismatch (hc1 `pc`, 2301–2344).

### 4.7 Bulk configuration patching
m13’s compile entry rewires *which physical flag each voice toggles* by storing
instruction literals into every affected site:

```
lac (clf 2
lio (stf 2
dac p2c        / all five duplicated code sites
dac p2d        / (Part VII explains why they are duplicated)
dac p3c
...
szs 50         / switch 5: swap alto and tenor voices
jmp cp1        / (patch the other assignment instead)
```
(m13 `cpl`, 1136–1163.) Instructions-as-literals (`(clf 2`, `(stf 2`, `(skp`,
`(skp i`, `(cla`, `(600000`…) make the literal pool a parts bin: any 18-bit pattern
the assembler can name can be data, be compared against, be deposited into code, or be
pointed at.

### 4.8 Discipline (what keeps this sane)
- **Placeholders are traps**: unpatched runtime slots hold `hlt` (m13 `mps`/`dvs`,
  35/125 — halt rather than run the wrong multiply) or `jmp .` (a visible hang at a
  known address). The console lights then *are* the diagnostic.
- **Patch targets are labeled** (`c0t`, `c1t`, `p2c`, …) and patched in one place.
- **No recursion, ever** — patched linkage and `jda` argument slots are one deep.
  The call graph is a DAG (see 5.6).
- Vestigial patch code is commented out, not left live (m13 1324–1325:
  `/dap c0b`, `/dap c1b`).

---

## Part V — Subroutine linkage and calling conventions

### 5.1 `jsp` + `dap` exit: the basic subroutine
```
gfg, dap gfx      / save return address (jsp left PC in AC bits 6-17)
     ...body...
gfx, jmp .        / patched exit
```
(m13 `gfg`, 176–206.) Call is `jsp gfg` (5 µs); return is a plain `jmp` (5 µs).
`jmp .` is the conventional unpatched-exit placeholder.

### 5.2 `jda`: the entry word is the argument slot
`jda S` deposits AC at `S` and jumps to `S+1` — so a `jda`-called routine receives its
argument *already stored at its own first word*:

```
mpy, 0            / receives multiplicand (deposited by jda)
     dap mpx      / AC also holds the return address -- save it
     dio mpr      / second argument arrives in IO
     ...
mpx, jmp .
```
(m13 `mpy`, 32–36.) hc1 packages the same convention as the `answer` macro:

```
define answer X
        0         / jda deposits AC (the argument) here
        dap X     / patch the exit
        lac .-2   / reload the argument into AC
```
(hc1 276–279.) **The entry word is simultaneously argument storage, and `lac .-2`
recovers it** — no separate save cell, no naming.

### 5.3 Arguments as instructions after the call, executed with `xct i`
m13’s divide takes its divisor as an *instruction* placed after the call, which the
routine executes remotely:

```
        jda dvd
        lac divisor    / executed by the callee via "xct i dv0" -- ANY
                       / load-class instruction works here (law 252 is used
                       / at m13 1614!)
        <overflow return>
        <normal return>

dvd, 0
     dap dv0      / return pointer ("works extended" -- see 8.6)
     xct i dv0    / execute the caller's divisor-loading instruction
     dac dv1
     idx dv0      / step the return pointer past the argument
     ...
     jmp i dv0    / overflow return (call+1)
     ...
     idx dv0
     jmp i dv0    / normal return (call+2)
```
(m13 `dvd`, 114–173.) This gives: (a) call-site-legible arguments, (b) argument
*expressions* (any addressing form), (c) **multiple returns** — the error return is
the instruction after the argument, the success return follows it, exactly mirroring
hardware `div`’s skip-on-success. `idx dv0` is both “consume argument” and “select
return”.

### 5.4 In-line string arguments delimited by the end label
hc1’s text writer is called with the string *following the call* and the **end address
as the immediate argument**:

```
        write erq        =  law erq / jda wr
        text /Table overflow.  Subdivide source program./
erq,    ...next code...

wr,  0               / holds erq (the law argument)
     dap wre         / wre := return address = ADDRESS OF THE TEXT
wr1, print i wre     / type 3 packed chars through the pointer
     idx wre
     sas wr          / pointer reached erq?
     jmp wr1
wrx, jmp i wre       / return PAST the string
```
(hc1 `wr`, 329–336; call sites 572–574, 655–656, 661–662.) The string is
self-delimiting (compare pointer to the argument), needs no length byte and no
terminator scan, and the return lands after the data. `print` types three concise
characters per word with `rcl 6s / tyo` ×3 (hc1 317–325).

### 5.5 The argument slot as the loop counter
hc1’s tape-feed routine iterates *on its own entry word*:

```
feed N  =  law i N / jda fee        / entry word now holds -N
fee, 0
     dap fex
     ...
     ppa           / punch a blank line
     isp fee       / increment the deposited -N in place!
     jmp .-2
fex, jmp
```
(hc1 `fee`, 377–387.) Zero words of counter storage; the argument decays into the
loop state.

### 5.6 Non-local exits (exceptions, 1963)
m13’s `put` (append word to the compiled stream) does not return an error code — on
memory exhaustion it jumps straight out through its *caller’s* patched exit:

```
put, dap pux
     dio i cb
     idx cb
     sas eb
pux, jmp .        / normal: return to caller
     ...bank-advance arithmetic...
     sad (nbk*10000
     jmp cpx      / out of banks: jump through cpl's OWN exit -- the whole
                  / compilation aborts to cpl's caller in one jump
```
(m13 `put`, 1644–1662.) hc1’s error machinery does the structured version: errors
long-jump to `er`/`er1`, which restore checkpointed state and resume at the next
measure (9.5). The enabling condition for both: linkage lives in *named cells*, so
any code that knows the name can return through it. The discipline that keeps this
safe is the strict call DAG (no recursion, 4.8).

### 5.7 Falling into a halt = the Continue button is your “OK” prompt
m13’s status stop places the resume code *immediately after* the `hlt`, so the
operator’s Continue press is the state transition:

```
stp, lio ib      / show progress pointer in IO lights
     szf 6
     lio cb      / (or compile pointer, if compiled)
     lac npt     / show number of parts in AC lights
     hlt         / <-- operator reads the lights...
con, eem         / <-- ...and presses Continue: execution falls through
     jsp gfg
```
(m13 `stp`/`con`, 724–732.) Registers-at-halt are the UI; code-after-halt is the
continuation. hc1 starts the same way: `start u` where `u, halt` — load tape, machine
halts, operator readies the source tape, presses Continue, and falls into `ap`
(hc1 406–408).

---

## Part VI — Data-structure techniques

### 6.1 Field extraction and insertion through the AC:IO ring
`rcl`/`rcr` treat AC:IO as one 36-bit ring, which makes it a **bit-stream register**:

- **Consume fields left-to-right**: put the packed word in IO, `cla`, then
  `rcl 2s` (articulation), `ril 1s`+`rcl 2s` (skip triplet bit into IO sign, grab
  rest), `cla / rcl 6s` (pitch), `cla / rcl 7s` (duration) — the m13 note decoder
  (`cc3`, 1370–1417) shreds an 18-bit note word into four fields with no masks
  at all, testing the triplet bit *in place* with `spi` while it passes through the
  IO sign (1376–1377).
- **Streaming sub-word reader**: keep the stream word in a memory cell, and per
  iteration `lio tw0 / rcl 3s / dio tw0` — take 3 bits, save the rotated remainder
  back (m13 `tun`, 226–231, reading per-voice detune nibbles). Three instructions
  make memory into a shift register.
- **Insertion**: build `[count(12) | pitch(6)]` by parking pitch in IO, loading count,
  and rotating the pair: `rcr 6s / lac mn2 / rcr 6s / rcr 6s` (m13 `c4m`, 1553–1556).
- **Biased subfields**: the 3-bit detunes are stored excess-4 (`sub (4` after
  extraction, m13 232) so a 3-bit field carries −4…+3.

### 6.2 Align tables to field boundaries; form addresses with one rotate
m13’s per-voice tuning tables live at 300, 400, 500, 600 — i.e. at
`(t6+voice) × 100`, on 64-word boundaries matching the 6-bit pitch field. The fetch is:

```
lio i ptr     / packed word: three 6-bit pitches
law t6        / AC = page number 3
rcl 6s        / AC = (3<<6) | pitch  =  the ADDRESS tab+pitch,
              / and IO has rotated on to the next field
dap .+1
lac .         / fetch frequency
```
(m13 `nxt`, 1740–1744; then `law t6+1`, `law t6+2`, `law t6+3` for the other voices.)
One `rcl 6s` simultaneously (a) extracts the next 6-bit field from the stream and
(b) merges it with the page number into a complete address. Aligning the table bought
an entire mask-shift-add sequence, in the hottest non-loop path of the program.
The constants are symbolic: `t6=3 / tab=t6*100 / tbe=tab+400` (m13 167–169).

### 6.3 Parallel arrays with symbolic strides
Per-voice state is five parallel 4-word arrays `b,n,t,a,p` (bar ptr, note ptr,
time-left, artic-left, pitch), indexed by voice and walked with the difference-literal
chain of 4.2 (m13 754–774+). hc1 pairs `s2z` (character codes) with `s2y` (handlers),
`pnm` with `pcd`, `ebl`/`ebd`/`ebe` (embellishment length / intro / outro). Structure
of arrays, never array of structures — the index does the associating.

### 6.4 Adjacent equal-stride tables for wholesale copying
hc1’s three chromatic-state tables are allocated contiguously —
`mt=.-200`, `kt=mt+44`, `nt=kt+44` (hc1 1577–1580) — so `copy nt,kt,44` and
`copy kt,mt,44` (the self-incrementing block move of 4.3) rebuild key state:
`nt` = natural scale, `kt` = key signature applied, `mt` = current measure with
accidentals. A key change copies nt→kt→mt; **every bar line copies kt→mt**
(hc1 `pum`/`pue`, 2675–2723) — accidentals-last-through-the-measure is implemented as
*table restoration*, not per-note bookkeeping. Mutate a table for scoped state; restore
it wholesale when the scope ends.

### 6.5 Two tables growing toward each other (two stacks, one arena)
Phase 1 stores notes upward from `not=fl+1` (4517) and bars **downward** from
`bar=7750`, with the shared headroom `all=bar-not-1` checked on *every* insert:

```
sbc: step1 tbc / step1 bc / addi nl / tgrec all, s3x   (bars)
snl: step1 nl  / addi bc  / tgrec all, s3x             (notes)
```
(hc1 `sbc`/`snl`, 456–471 — note the check is *bars+notes vs total*, i.e. collision
of the two ends.) Downward indexing is free: `sbc` returns the **complemented** count
(`load bc / complement`, hc1 461–462) so callers do `putback bar, x` with a negative
index and `lookup bar` after `complement` (hc1 `p42`, 2959–2967; `co8`, 3171–3175).
One arena, no fixed split, graceful failure message
(“Table overflow. Subdivide source program.”).

### 6.6 Sentinels and tag bits instead of counts and flags
- `600000` (sign bit + one) is the universal **bar-line / end sentinel** in the note
  stream — negative, so `sma` distinguishes it from any real entry (hc1 emits it via
  `te0`, 2260; m13 recognizes it with `sad (600000` chains).
- Tempo changes ride in-band as `7xxxxx` words: m13 masks `and (700000 / sas (700000`
  to detect, `and (77777` to extract (m13 1347–1354).
- **Sign-tagged relocatables**: bar-table entries are note *indices*; at load time m13
  relocates each by the voice base — `lac i ib / sma / add off / dac i ib` — skipping
  relocation for negative entries, so the `600000` terminators pass through untouched
  (m13 `rd3`, 1064–1074). The sign bit is the “absolute, don’t relocate” tag.
- The compiled stream ends with an all-zero group emitted by two `cli / jsp put`
  pairs (m13 1312–1315); the player detects it for free because the count field it
  was *already* extracting is zero: `rcr 6s / sza i / jmp plq` (m13 1772–1775).
  **Choose terminators the consumer’s normal decode path tests anyway.**
- Keyword strings are null-terminated, one concise char per word (hc1 `pn1…pnh`,
  2407–2515) — scan-friendly, and the 0 terminator doubles as the “match complete”
  test.

### 6.7 Point a pointer at a literal to fake initial state (“prime the pump”)
Before the first measure exists, m13 aims all four note pointers **at the literal
`600000` in the constants pool**:

```
law (600000   / law of a literal = ADDRESS of the pooled constant
dac n
dac n+1
dac n+2
dac n+3       / "prime the pump"
```
(m13 1177–1203.) The first “are all voices at a bar line?” test then reads the
sentinel *through* the pointers and the normal advance-measure machinery initializes
everything. No special first-iteration code exists. The literal pool is addressable
data — `law (x` (address-of-literal) is the key that unlocks it (also used to `xct`
pooled instructions: `law (cla / dap c0x`, m13 1413–1414, “don’t split a rest”).

### 6.8 Checksummed, self-describing tape records
Both directions use the same record shape: **count, entries, checksum**, where the
checksum is the running `add` of the entries (m13 read side: `add sum / dac sum` per
word, `sas ct / hlt` at the end, 1040–1055; hc1 punch side accumulates `step t2,t1`
and punches it, 2921–2947). The count is transmitted complemented so the reader’s
`isp` counts it back up (m13 `rdg` 1114–1125 stores `cma` of it). Fail = `hlt` at a
distinct address: **the halt address is the error message** (checksum stop at 1055,
data-overflow stop at 1046, count stop at 1122).

### 6.9 Allocation by location counter; patchable parameter block
- Arrays reserve space with no emitted words: `b, b+4/` just moves the location
  counter (m13 221–230) — nothing is punched, so the tape is shorter and loads faster.
  Same for `sb+4/` and the buffer boundary `not=.-20` (m13 916–921).
- Tunable constants live in a **documented low-core block at fixed addresses**:
  detune word `tuw` at 11, tempo fudge `tpf` at 12, memory bounds `noe/nof/nog` at
  13–15 (m13 11–27). Operators retune the instrument from the console with
  Examine/Deposit — no reassembly. Addresses 4–7 are a `repeat 4, opr` landing pad
  (m13 9) so the canonical “Start at 4” convention works while 0–3 stay free for the
  sequence-break system.

### 6.10 Let data encode behavior: rest = frequency 0
Pitch index 0’s table entry is 0 (m13 892). A zero increment never overflows the phase
accumulator, so the voice’s flag never toggles: **silence, with zero special-case code
in the synthesis loop.** (Pitch 1 is also treated as a rest at compile time,
`sad (1 / cla`, m13 1406–1407.) When a value can be chosen so the general mechanism
produces the special behavior, choose the value, not an `if`.

---

## Part VII — Cycle-exact real-time code: the 175 µs synthesis loop

This is the deepest material in m13 and the reason the emulator must be
cycle-accurate. The play loop *is* the oscillator: each trip advances all four
square-wave phases once, and pitch = how often each voice’s phase accumulator wraps.
Any variation in
loop time is frequency modulation — audible as pitch error and noise. Samson’s answer
is a loop in which **every possible path costs exactly the same 175 µs**
(“equal-tempered frequencies, assuming 175 microsec loop”, m13 890).

### 7.1 The voice cell: phase accumulator + `jda` store-and-branch
Each voice is 6 words (m13 `lup`, 2014–2021):

```
lup, lac f1      /10  frequency increment
     add p1      /10  advance phase
     spa         / 5  wrapped negative?
     jda p1      /10  YES: store phase at p1 AND jump to p1+1
     dac p1      /10  no:  store phase
     clf 1       / 5       flag off
     ...voice 2...
```
and the overflow continuation (m13 `p1`, 2047–2050):

```
p1,  0           / the phase cell itself -- jda's deposit target
     stf 1       / 5  flag on
     ...voice 2 (duplicate)...
```

`jda` here is not a subroutine call: it is a **combined store-and-branch** —
“deposit AC at p1, continue at p1+1” — that makes the phase cell double as the entry
point of its own overflow handler. Count the cycles:

- normal path: `spa`(skips)=5, `dac`=10, `clf`=5 → 20 µs after the add
- wrap path:  `spa`(falls)=5, `jda`=10, `stf`=5 → 20 µs after the add

**Identical.** The flag output (the audio!) toggles as a *side effect of which store
instruction ran*, with zero timing skew. While the phase is negative the `jda` path
re-runs every iteration (unconditional `stf`), while positive the `dac/clf` path runs
(unconditional `clf`): flag = sign of phase ≈ 50% duty square wave. The redundant
re-setting of the flag every single pass is not sloppiness — it is what makes both
paths the same length with no state tests.

### 7.2 Telescoped duplicate tails instead of rejoining
After voice 1 wraps, control is at `p1+1` — *not* back in `lup`. Rejoining `lup`
would cost a `jmp` (5 µs) only on the wrap path and unbalance the loop. Instead,
**the rest of the loop is duplicated inside each continuation**: `p1`’s block contains
voices 2–4 and the loop epilogue; `p2`’s block contains voices 3–4; `p3`’s block
voice 4; `p4`’s block just `stf 4` and the epilogue (m13 2047–2136). Wherever any
subset of the four voices wraps, execution threads through nested blocks and still
executes exactly one `lac/add/spa/store/flag` per voice — 40 µs each — plus one
epilogue:

```
isp ct        /10  count down the note duration
jmp lup       / 5  next sample loop
jmp nxt       /     note ended: fetch next note
```

4 voices × 40 + 15 = **175 µs, every path, every combination of wraps.**
The duplicated code costs ~30 words per voice tier — words spent purchasing
determinism. (The five duplicated flag instructions are exactly the sites `cpl`
bulk-patches for the voice-swap option, 4.7 — duplication and patching cooperate.)

### 7.3 Pad to the budget — and say so
The bank-crossing routine `xbk` ends `nop / jmp lup` with the comment
“**with a cycle to spare!**” (m13 1736–1737): the routine was counted against its
time budget and padded to land exactly on it. Timing-critical code here is
*accounted*, instruction by instruction, and the accounting is written down.

### 7.4 Steal time openly: compensate bookkeeping in both rhythm and phase
Fetching the next note (`nxt`) and crossing banks (`xbk`) take real time — about two
loop periods and one, respectively. m13 compensates in **two ledgers**:

- **Rhythm**: the compiler pre-deducts the fetch overhead from every note’s duration:
  `law i 1 / add mn2` — “2 loops for combo fetch” (m13 1517–1524; mn2 is the count
  in halves, so −1 = −2 loops).
- **Phase**: during `nxt`, each voice’s phase is advanced by 2·f — the increment it
  would have accumulated in those two lost loops: `dac f1 / sal 1s / add p1 / dac p1`
  (m13 1744–1750, per voice); `xbk` advances by 1·f (m13 1722–1735).

So note lengths stay metronomic *and* oscillator phases stay continuous across note
boundaries — no clicks, no cumulative drift. This is the general pattern for hard
real-time on a machine with no timer: **make the slow path’s cost a compile-time
constant, then subtract it from the schedule and add it to the state.**

### 7.5 Precompute strides; the hot path only compares and adds
Bank crossing must not search or divide. `pla` precomputes `hop` (end of one bank’s
data → start of next: `10000 − nof + nog`) and `gap` (start → end: `nof − nog`)
once (m13 1701–1707); the stream loop then just does `sad eb / jmp xbk`, and `xbk`
is two adds (m13 1716–1721). The same constants drive the compiler’s writer
(`put`, 1651–1661). **Every division, multiplication, table lookup, range decision
and format conversion in the entire system happens in `cpl`/`tun`/`tpo` (compile
time); the play loop contains only `lac add spa dac/jda clf/stf isp jmp`.** The
compile/play split is itself the master optimization.

### 7.6 Unroll the primitives you can’t afford to loop
The software multiply/divide fallbacks are straight-line `repeat 21, mus mp2` and
`repeat 22, dis dv1` (m13 49, 88) — seventeen (decimal) multiply steps and eighteen
divide steps with **zero loop overhead**, because a counted loop would nearly double
their cost. `repeat` makes unrolling free to write. (These run at compile time here,
but the technique is general.)

---

## Part VIII — Hardware variation, configuration, and the operator

### 8.1 Probe the hardware, then patch the code
PDP-1s shipped with either automatic multiply/divide (`mul`/`div`) or the older
multiply-step/divide-step (`mus`/`dis`) in the same opcodes. m13 detects which machine
it woke up on **by running the instruction and inspecting the result**, then patches
one word so all later code takes the right path:

```
law 10
cli
mul (10       / hardware mul: AC:IO = 100, AC (high half) = 0
lio (skp      / default patch: "skp"
sza           / AC = 0 iff real mul
lio (skp i    / else it was mus: choose "skp i"
dio mps       / patch the multiply routine's mode switch
```
(m13 704–712; the divide probe 713–722 is the same shape, with an `opr` placed after
`div (10` to absorb div’s skip-on-success so **both** hardware variants flow into the
same next instruction.) The patched cell:

```
mps, hlt      / skp for mul, skp i for mus -- hlt until probed!
     jmp mpu  / (skipped or taken accordingly)
```
(m13 35–36.) One probe at startup, zero per-call cost forever after, and a `hlt`
trap if anyone calls the routine before initialization. The software paths reproduce
the hardware semantics exactly (signs, formats), so **callers cannot tell which
machine they are on** — `jda mpy` / `jda dvd` everywhere.

### 8.2 Sense switches: six bits of operator-settable behavior
m13 reads five of the six console sense switches at well-chosen moments:
switch 1 = read tape vs play (`szs i 10` — note the *inverted* test, matching the
2008 change note, m13 5, 1000), 2 = force recompile (735), 3 = reserve DDT memory
(1025), 5 = swap alto/tenor voices (1152), 6 = loop the song (1667). hc1 uses the
**Test Word** switches both as *numeric input* (the tempo: `lat`, validated and
defaulted, m13 1204–1217 — the 40…1377 range enforced with the add-back check of
2.2) and as an *output gate* (`lat / and (700 / sad (700 / jmp skip-punching`,
hc1 379–383 and 391–394). Free configuration UI; no parsing, no storage.

### 8.3 Program flags: outputs, persistent state, and scratch booleans
Six flags serve three unrelated purposes at once:

- **Flags 1–4 are the audio output** — `stf`/`clf` in the loop is the DAC (Part VII).
- **Flags 5–6 are a 2-bit state machine** (“voice(s) read” / “compiled”), *documented
  as a state table in the comments* (m13 173–176) and driving the Start/Continue
  control flow (`szf i 5`, `szf 6`, …).
- **Flag 6 moonlights as a scratch boolean** inside the compiler (triplet bit,
  1375–1423) — borrowed and put back before its persistent meaning is needed again.

Because flags cannot be *read* (only tested), the persistent pair is **mirrored in
memory** (`f5`/`f6`) and re-established after console operations wipe machine state:
`gfg` (`cla / clf 5 / sas f5 / stf 5 / …`, m13 176–206), with the memory side updated
by `dzm` and `idx` (set-to-1 in one instruction on a known-zero cell, m13 1010, 1111).

### 8.4 Extend mode hygiene
The player runs with `eem` set so indirect references reach banks 1–2 (m13 `con`,
731; `go`, 1002). `jsp`/`jda` save the Extended PC in AC bits 2–5; subroutines that
must work across banks say so — `dap dv0 /works extended` (m13 120) — and return with
`jmp i` whose deferred word supplies 16 bits in extend mode. Know which of your
routines are bank-clean, and mark them.

---

## Part IX — I/O craft

### 9.1 Wait when you have nothing to do; poll and overlap when you do
m13’s tape loader uses the waiting form `rpb` (730002) — simplest possible read loop,
3 working instructions per word (m13 `rd1`, 1037–1050). hc1, which has compile work
to overlap, polls and pipelines instead:

```
rt2, cks          / device status -> IO
     ril 1s       / rotate READER bit into IO sign
     spi i        / skip when it reaches sign=1
     jmp rt2      / not ready: poll again
     rrb          / fetch the assembled byte
     rpa-i        / IMMEDIATELY start the next read (no-wait form)
     dio t1       / ...then validate/translate while the reader runs
```
(hc1 `rp`, 346–353; `rpr`, 338–342 primes the first read at startup — one read is in
flight at all times.) Two idioms to keep:

- **Rotate-to-sign testing**: there are only sign skips (`spi`, `sma`, `spa`), so move
  the bit you care about *into the sign* with a rotate, then skip. `ril 1s / spi i`
  is the whole status test.
- **`rpa-i`**: the wait bit is just bit 5, so the assembler expression `rpa-i`
  (their `rpa` symbol has the wait bit on; `i` = 10000) manufactures the no-wait
  variant arithmetically.

### 9.2 Input hygiene, each check two or three words
In the same reader (hc1 353–375): deleted characters are dropped by rotating the
tape’s Delete hole (channel 7) into the AC sign — `rcr 7s / spa / jmp rt2`; parity is
verified by the computed-rotate popcount trick (2.9), halting on a genuine parity
error but passing blank tape (`lac t1 / sza / hlt / jmp rt2`); carriage return and
tab are normalized to a single delimiter code with `sad (77 / cla / sad (36 / cla`;
stop codes are skipped. Total cost of a robust reader: ~20 words.

### 9.3 Typewriter output
- **Three characters per word**: the `print` macro types a packed word with
  `rcl 6s / tyo` three times (hc1 317–325) — the same rotate that extracts is the one
  the typewriter needs.
- **State-cache the ribbon color**: `red`/`blk` keep `rb = ±1` and emit the color
  shift *only on change* (`testm rb, rex / type (35 / sett rb,-1`, hc1 630–641).
  Apply to any modal output device state (case shifts too).
- **Line-length management**: the error printer counts characters (`blc`) and folds
  with a CR every 100 (hc1 `et4`, 600–606).

### 9.4 Error reporting worth studying (hc1 `er`/`er1`, 560–625)
On a source error the compiler:

1. Loads a **three-letter error code packed in one word** by the `flexo` pseudo
   (`error flexo tmf` — the code *is* the literal; printing it is the `print` macro).
   One word per distinct diagnostic.
2. **Replays the offending measure from its input buffer** — every source character
   was banked into the `f` array as read (`putback f, ch` in the reader, hc1 511),
   with the measure’s start index checkpointed (`mbh`), so the message can show
   context the tape has long since passed.
3. Prints in **red ribbon** (`call red` … `call blk`).
4. **Deduplicates**: the measure/terminator position of the last error (`mjp`/`tjp`)
   suppresses repeats at the same spot (hc1 `erq`, 577–579), and — the flourish —
   if errors *did* repeat, it types
   “To err is human---to forgive, divine.” (hc1 573–574).
5. **Recovers by rollback**: restores the bar/terminator counters from the checkpoint
   and resumes scanning at the next measure (`ec2`: `move bc,mjp / move tc,tjp`,
   hc1 620–623), so one mistake yields one message, not an avalanche.

The buffered input also powers ordinary parsing: the keyword matcher re-reads from
`f` after a failed match (`rrc` resets the read index to the last terminator,
fl1/fl2 checkpoints — hc1 473–480, 542–555), giving a one-pass tape reader unlimited
lookahead *within a measure* for free.

### 9.5 Record format symmetry
The punch side (hc1 `pv4`, 2570–2647) and the load side (m13 `rdp`/`rdm`,
1024–1113) agree on: leader (400 blank lines), count word, entries, checksum, gap
(6), bar table likewise, trailer (300). Counts complemented for `isp`; entries
summed as they stream; relocation-by-sign at load (6.6). Design the format and both
ends together so each side’s natural loop is the format.

---

## Part X — MACRO assembler leverage

The assembler is half the optimizer. Techniques the listings depend on:

### 10.1 The literal pool `(expr`
Automatic constants (`lac (10000`), **instructions as constants** (`lio (skp`,
`dac` of `(clf 2`, compare against `(dac tbe`), *negated* instruction expressions
(`(-sad-W`), symbol arithmetic (`(nbk*10000`, `(n-b`, `(add pt+100`, table bases
`(V` and `(U-1`), and pool entries as addressable data via `law (x` (6.7). One pool
word can serve simultaneously as a constant, a comparison key, a patch source, and a
pointed-at datum. Place the dump with `consta`/`constants` where locality helps
(m13 919; hc1 1576).

### 10.2 A macro library as a structured language with visible costs
hc1 opens with ~50 macros (hc1 9–325) that give the program `load/store/goto/call`
readability while every expansion stays an optimal, *predictable* instruction count:
one word (`load`, `goto`, `step1`, `halve`, `x2to1`), two (`move`, `sett`, `trze`…,
`type`), three (`step`, `tles`, `test0`…, `lookup`, `x10dec`), four (`search` setup,
`putback`, `answer`), etc. Because each macro’s cost is fixed and known, macro-level
reasoning *is* cycle-level reasoning. Write the veneer once; never write
`sza i / jmp` by hand again. (`repeat` for unrolling and fills; `define … termin`
composability — `ftrel` is defined *in terms of* `trel`, hc1 135–137; `decimal`/
`octal` radix control around the frequency table, m13 891/914; `text` and `flexo`
for packed strings; `start addr` to set the tape’s start block.)

Symbols are significant to six characters (`compla`/`complaint`, `diswit`/`diswith`
in the symbol table) — the originals exploit that for readable call sites.

### 10.3 Location-counter arithmetic as the allocator
`700/` origin setting; `b, b+4/` reservations that punch no tape (the location counter
is simply moved, so uninitialized arrays cost zero tape words and zero load time);
buffer and table bases computed from `.` and from each other so nothing is hand-placed:
m13’s tape-buffer base is `not=.-20` — “notes & bars (tape buffer area)”, pinned
relative to the end of the assembled image (m13 921) — and hc1 computes its whole
memory map symbolically: `fb=.`, `fw=fb+400`, `fl=fw+200`, `not=fl+1`, `bar=7750`,
`all=bar-not-1`, `mt=.-200`, `kt=mt+44`, `nt=kt+44` (hc1 1577–1597). Change one
number and every bound, capacity check, and literal follows.

### 10.4 Comments that carry the engineering
The listings’ comment style is part of the method: units on every scaled quantity
(“min 192nds * 8”, “loop ct / 2”, “tempo factor from test word”), per-word variable
directories (hc1 1484–1574 documents every temp with its owning routine), state
tables (m13 173–176), change history with dates at the top, and cycle-budget notes
(“with a cycle to spare!”, “2 loops for combo fetch”). On a machine where code is
self-modifying and every cycle is audible, the documentation *is* load-bearing.

---

## Part XI — Checklists

### Speed
1. Count memory cycles, not instructions; prefer 5 µs augmented ops.
2. Keep the next value in AC/IO; restore with `add`-back instead of reloading (2.2).
3. Branch with reversed-skip + `jmp`; execute single instructions under a skip with
   no jump at all (3.1–3.2).
4. OR skip conditions into one word, arithmetically if the assembler must
   (`sma+sza-skp`) (3.4).
5. Extract/insert fields with `rcl`/`rcr` through IO; align tables so one rotate
   forms the address (6.1–6.2).
6. Sequential access → pointer + `lac i`/`lio i` + `idx`; random/multi-array access
   → `dap`-patched instructions, chained with difference literals (4.1–4.2).
7. Multiply/divide by constants with shift-add chains; unroll with `repeat` (2.6, 7.6).
8. Precompute everything precomputable in a setup phase; leave the hot loop
   add-compare-store only (7.5).
9. In real-time code, balance every path to the cycle: `jda` store-and-branch,
   duplicated tails, unconditional flag writes, `nop` padding — then compensate
   unavoidable slow paths in both time and state (7.1–7.4).

### Space
1. One word can be: instruction + pointer + loop counter + comparison key (4.3).
2. Pass arguments in the `jda` entry word, as post-call instruction words, or as
   in-line strings delimited by the end label (5.2–5.5).
3. Sentinels and tag bits over counts and flag cells; pick sentinels the normal
   decode path already tests (6.6).
4. Reserve arrays by moving the location counter; reuse load-time-dead memory;
   grow two tables toward each other (6.5, 10.3).
5. Let the literal pool be your parts bin — including executable parts (10.1).
6. Encode behavior in data values (rest = 0 frequency) instead of special cases (6.10).

### Robustness (they optimized this too)
1. `hlt` as assert: distinct address = distinct error; leave diagnostic values in
   AC/IO for the lights (5.7, 6.8).
2. Checksum every tape record; validate parity; drop deletes; normalize delimiters
   (6.8, 9.2).
3. Range-check before packing fields; capacity-check on *every* table insert (2.8, 6.5).
4. Unpatched slots hold `hlt` or `jmp .` traps; probe hardware before first use (4.8, 8.1).
5. Checkpoint state at natural boundaries (the measure) and roll back on error;
   deduplicate diagnostics (9.4).
6. Mirror unreadable hardware state (program flags) in memory and resynchronize (8.3).
7. Document units, budgets, and state machines in comments (10.4).

---

## Appendix: technique-to-source index

| Technique | Where |
|---|---|
| Cycle-balanced synthesis loop, `jda` store-and-branch, telescoped tails | m13 `lup`/`p1`–`p4` 2014–2136 |
| Phase/duration compensation for fetch overhead | m13 `nxt` 1740–2013, `cc6` 1517–1524, `xbk` 1716–1737 |
| Table alignment + `rcl 6s` address formation | m13 `nxt` 1741–1744, symbols 167–169 |
| Hardware `mul`/`mus`, `div`/`dis` probe & patch | m13 `beg` 704–722, `mps` 35, `dvs` 125 |
| Software multiply/divide, unrolled steps, double negate | m13 `mpy` 30–113, `dvd` 114–173 |
| Instruction-as-loop-counter, `sad (dac tbe` termination | m13 `tun` 212–252; hc1 `copy` 289–300, `search` 302–315 |
| Index recovery via `add (-sad-W` | hc1 `search` 313–314 |
| Computed-rotate parity (`law 2525`) | hc1 `rp` 356–362 |
| Pipelined reader (`rrb` then `rpa-i`), rotate-to-sign polling | hc1 `rp` 344–353, `rpr` 338–342 |
| `jda` entry-word argument (`answer`), post-call argument instructions, two-way returns | hc1 262–279; m13 `dvd` 114–173, `tpo` 1606–1634 |
| In-line strings with end-label (`write`/`text`) | hc1 `wr` 329–336 |
| Self-counting argument slot (`isp fee`) | hc1 `fee` 377–387 |
| Non-local exit through another routine’s return slot | m13 `put` 1644–1662 |
| Halt-then-Continue console state machine, lights as UI | m13 `stp`/`con` 724–747, flag table 173–176; hc1 `u` 406 |
| Bulk configuration patching (voice/flag swap) | m13 `cpl` 1136–1163 |
| Executable dispatch tables (`cxt` + `xct`), `jda` entry in a table | m13 `cxt` 1443–1471 |
| Address dispatch tables, base−1 literals | hc1 `s2y` 2150, `pcd` 2345, `ebd`/`ebe` 2205/2214 |
| Keyword strings + rescan/backtrack buffer | hc1 `pn*` 2407–2515, `pc` 2301–2344, `rch` 483–555 |
| nt→kt→mt chromatic tables, block-copy restoration | hc1 1577–1580, `pum`/`pue` 2675–2723 |
| Two tables growing toward each other, complemented indices | hc1 `sbc`/`snl` 456–471, `bar=7750` 1590 |
| Sign-tagged relocatable entries | m13 `rd3` 1064–1074 |
| Sentinels (`600000`, zero-count end), in-band tempo words | m13 1177–1203, 1347–1354, 1772–1775; hc1 `te0` 2260 |
| Prime-the-pump literal pointers | m13 1177–1203 |
| Checksummed count/data records, complemented counts | m13 `rdg` 1114–1125; hc1 `pv4` 2570–2647 |
| Sign extension by rotate-up/`sar`-down | m13 `tun` 215–220 |
| ×10, ×5/8, ×2-or-×3 constant multiplication | hc1 `x10dec` 282–287; m13 `c58` 1463–1471, 1416–1422 |
| Combined skip `sma+sza-skp` | hc1 `tgrec` 202–206 |
| `sad`/`sas` AND-chains | m13 `ca` 1226–1234 |
| Branchless select via IO overwrite | m13 704–722 |
| Add-back compare, range checks | m13 `cc2` 1472–1500, 1204–1217 |
| Ribbon-color state caching, red errors, measure replay, rollback | hc1 `red`/`blk` 630–641, `er` 560–625 |
| 3-char `flexo` error codes | hc1 `s1z` etc. 645+ |
| Low-core patchable parameter block, `repeat 4, opr` landing pad | m13 9–27 |
| Rest as zero frequency | m13 892, 1406–1407 |
| Test-word input with validation & default; punch gating | m13 1204–1217; hc1 `fee`/`ppp` 379–394 |
| Extend-mode-safe linkage notes | m13 `dvd` 120, `con` 731 |

*Every technique above was verified against the octal in the listings, not just the
source column. When you write new PDP-1 code for this project, write it the way these
two programs do — and when you touch the emulator, remember that Part VII is why
`decodeAndExecute()` returning exact microsecond durations is a correctness
requirement, not a nicety.*
