# pdp1m13 Temperament Development Log

## 1. Research Baroque Temperaments

An initial run of research was done with research mode enabled on https://claude.ai. The generated report was then copied into this repo for reference.


_I'd just link to the chat log, but chats with research runs can't be shared for some reason. Reproducing below._

**user:** Please explain even temperament versus baroque temperament

**assistant:**
<details>
<summary>Claude's response (click to expand)</summary>
So "even temperament" is almost certainly what usually gets called **equal temperament**, and "baroque temperament" isn't really one thing—it's a whole family of older tuning systems. The gap between them is one of the genuinely great rabbit holes in music, so let me actually lay it out.

The core problem every tuning system is wrestling with: you can't make all the intervals pure at the same time. The math just won't allow it. Stack twelve perfect fifths and you *should* land back on your starting note seven octaves up—but you overshoot by a hair (the Pythagorean comma, about 23 cents). Pure fifths and pure thirds are fighting each other the whole time. So every tuning system is really one decision: *where do you hide the error?*

**Equal temperament** (today's default) hides it perfectly evenly. Every semitone is exactly the same size—the twelfth root of two. The payoff is total freedom: every key sounds identical in character, you can modulate anywhere, transpose anything, nothing's ever unplayable. The cost is that *nothing's* truly pure either. The fifths are a touch narrow (you'd never clock it), but the major thirds run noticeably sharp—about 14 cents. Your ear's just been trained since birth to shrug it off.

**Baroque temperaments** made the opposite bet. Two big branches:

- *Meantone* (Renaissance into the early Baroque) flattened the fifths so the major thirds came out genuinely *pure*—sweet, beatless, gorgeous in the home keys. But all that hidden error piles up in one spot and creates a "wolf" interval so ugly you just couldn't play in distant keys.
- *Well temperaments* (Werckmeister, Kirnberger, Vallotti) smeared the error around unevenly but cleverly, so no key was off-limits—but every key ended up with its own *color.* C major sounded calm and pure; something like F-sharp major sounded tense, bright, almost exotic. Keys had personalities.

That last part is what people get nostalgic about. Bach's *Well-Tempered Clavier*—running through all 24 keys—was basically a victory lap for a tuning where every key worked *and* every key felt distinct. (Fair warning: there's a real, unsettled scholarly fight over which temperament he actually meant. "Well-tempered" almost certainly did *not* mean equal temperament, but the specifics are still argued over.)

So the whole thing comes down to uniformity versus character. Equal temperament handed us the freedom to wander anywhere harmonically—it's part of why Chopin sounds like Chopin, why one piano can serve every piece ever written—but the price was flattening every key into the same emotional palette and roughing up our consonances a little. Some musicians genuinely think we lost something. Though here's the kicker: equal temperament was never total anyway. String players and singers still instinctively bend toward pure intervals, so that old sweetness never fully died—it just went underground.
</details>

**user:** What are the details of the temperament for WTC?

**assistant:**
<details>
<summary>Claude's response (click to expand)</summary>
<details>
<summary><em>thinking: Hunting down historical temperament specifications for precision</em></summary>
<em>Joe is asking about the specific temperament Bach used for the Well-Tempered Clavier, which is actually a contested area in musicology. The Bradley Lehman hypothesis from 2005 is probably the most well-known recent contribution to this debate, published in Early Music, but there's genuine scholarly disagreement here about what the historical evidence actually supports.

The fundamental issue is that Bach never documented his tuning method—the WTC has no written instructions. "Well-tempered" is really just a category describing circulating temperaments where all 24 keys work but each has its own character, which is different from equal temperament where all keys sound identical.

Several historical temperaments get proposed as candidates: Werckmeister III distributes the Pythagorean comma across four specific fifths and is probably the most commonly cited; Kirnberger III, designed by one of Bach's students, places the syntonic comma across five fifths with one pure third; Vallotti uses a symmetric approach with six narrowed fifths; and Young's temperaments came later but are also well-tempered systems. Then there's Lehman's 2005 argument that the decorative squiggle on the WTC title page is actually an encoded tuning diagram meant to be read upside down.
Lehman interpreted it as specifying a particular temperament with five tempered fifths and three pure ones, which generated significant scholarly debate—it's ingenious but widely contested as over-interpreting an ornamental mark. The reality is there's no consensus at all; Bach may have used different tunings at different times, tuned by ear without matching any formal system, or simply expected players to use whatever good circulating temperament was available to them.

Now I'm working through the technical specifics of Werckmeister III, which is based on the Pythagorean comma of about 23.46 cents, with four particular fifths narrowed by a quarter of that comma each. For Kirnberger III, one of the fifths absorbs the schisma to account for the difference between the syntonic and Pythagorean commas. Vallotti uses a symmetric approach with six tempered fifths centered around D and six pure ones, making it a popular choice for modern Baroque performance. I'm confident about these technical details, though the historical naming conventions for these temperaments are genuinely confusing and worth double-checking.

I'm weighing whether to search for verification—the specifics of which temperament belongs to which theorist and exact cent values are the kind of details I could misremember, and there might be newer scholarship since the mid-2000s. But this is fundamentally stable historical knowledge rather than something that changes with current events, and the core answer I'd give ("we're not entirely certain, here are the main candidates") doesn't depend on facts that are likely to have shifted. are subtly wrong, and Joe specifically asked for details—so I should do a few targeted searches to verify the exact cent values and historical specifics, especially to see if there's recent scholarship beyond my training data that would give a more current picture of the debate. I'll be selective though, focusing only on what matters for accuracy rather than exhaustively re-researching the whole topic. I need to actually search rather than second-guess myself—the Lehman debate specifically warrants checking where scholarship has landed since 2005. I'll run two targeted searches: one on Lehman's thesis itself, and another covering the main temperament candidates and current consensus, then keep it focused since Joe asked a straightforward question.</em>
</details>

Good — this is the rabbit hole I flagged, and it's one where I want to check my facts rather than freeze the debate at whatever year my memory stopped. Let me look.

<details>
<summary><em>thinking: Reconciling conflicting Werckmeister temperament sources</em></summary>
<em>
[web search: Bach Well-Tempered Clavier temperament Lehman 2005 title page squiggle]: 9 results


I need to lock down the specific temperament formulas—Werckmeister III, Kirnberger III, and Vallotti—since Joe's looking for concrete details, and I want to double-check the exact fifth distributions and Lehman specifications to make sure I have the numbers right. I've got the core specs down for Werckmeister III, Kirnberger III, and Vallotti, but I'm second-guessing myself on the exact fifth assignments for Werckmeister III since the naming conventions are so muddled in the literature—one quick verification search should settle it without overdoing the research.</em>
</details>

One more — I want to verify the actual recipes for the main historical candidates, since the fifth-by-fifth specs are exactly the kind of detail my memory could fumble.Okay so here's the thing that makes this whole question kind of delicious: **there are no details, because Bach never wrote any down.** No tuning instructions, no recipe, nothing. The title page of Book 1 (1722) just says it works in all 24 keys and leaves you to figure out *how*. So "the temperament for the WTC" isn't a known fact — it's a 300-year-old detective case, and what I can give you is the list of suspects plus the most famous attempt to crack the code.

The code-cracking attempt first, because it's wild. In 2005, a harpsichordist named Bradley Lehman published two articles in *Early Music* arguing that the decorative squiggle Bach doodled across the top of the title page is actually a tuning diagram in disguise. He noticed a little "C" attached to the rightmost loop, flipped the whole thing upside down, and read the loops as instructions — fancy loops mean tempered fifths, plain loops mean pure ones. His baseline was the standard Baroque move of narrowing a fifth by 1/6 of a Pythagorean comma, with some fifths at 1/12 and some left pure. The result is gorgeous and gentle: C, G, D, A, E, B and F# major all sit close to equal temperament, while the remote flat keys get noticeably wider thirds, so F# major comes out kind of luminous and crystalline instead of sour. A lot of performers swear by it.

But — and this is the fun part — it got absolutely worked over by other scholars. The November 2006 issue of Early Music ran several rebuttals; John O'Donnell argued the loops should be read chromatically rising from C, not as a cycle of fifths, and spotted what look like "Es" and "Dis" markings near the word "Das." Someone else proposed reading it as a 1/18-comma scheme entirely. And the brutal critique underneath all of it: the squiggle is appealing and plausible as a temperament prescription, but every reading rests on assumptions with no hard evidence. It's a Rorschach blot that happens to be in Bach's handwriting.

So if you set the squiggle aside, here are the actual historical recipes people reach for — these I can give you exactly:

- **Werckmeister III** (1691, the classic "Bach tuning" of the modern revival): mostly pure fifths, but C–G, G–D, D–A, and B–F# each get narrowed by 1/4 comma. Because the tempered fifths aren't consecutive, there's no wolf and all 12 keys are usable — Werckmeister literally flagged it as good for chromatic music, which is probably why it got glued to Bach's name.
- **Kirnberger III** (1779, by an actual Bach student): four fifths along C–G–D–A–E narrowed by 1/4 *syntonic* comma, which makes the C–E major third dead pure, with one leftover fifth absorbing a tiny schisma. It's prized for unusually pure near-key thirds, and Kirnberger claimed it matched Bach's own preference — a claim scholars have disputed ever since.
- **Vallotti** (the smooth, symmetric crowd-pleaser): six fifths in a row — F–C–G–D–A–E–B — each narrowed, the other six pure. Heads up though: the version everyone now calls "Vallotti" is technically a misattribution — the modern one uses 1/6 of a Pythagorean comma, while Vallotti's original used the syntonic comma with a schisma fifth.

Honestly? My read is that the search for *the* answer is a bit of a fool's errand, and a few scholars quietly think so too. Bach almost certainly tuned by ear, probably tweaked it depending on the instrument and the day, and would've found the whole "which named system did he use" question kind of beside the point. The piece works in any decent circulating temperament — that was the *whole brag*. Which means the real answer to "what's the temperament for the WTC" might just be: a good one. Pick your flavor of spicy.
</details>
</details>

**user:**

Please research those historical recipes and others that are relevant to baroque music. Our primary output should be a markdown table with the even temperament notes on one axis and the alternate notes of the each tuning in the other

**assistant:**

Before I dig in, two quick things so the table comes out exactly how you want it:

1. **What reference pitch / format for the cell values?** Options: cents deviation from equal temperament (e.g. +3.9, -2.0), or absolute frequencies in Hz (which needs a fixed A — A=440, A=415 "Baroque pitch," or both), or both cents and Hz side by side.

2. **Which temperaments should make the cut?** I'm planning Equal (the reference column) plus Werckmeister III, Kirnberger III, Vallotti, Young II, Kellner's "Bach," and quarter-comma meantone as a Baroque-era anchor. Want me to add/drop any — e.g. the Lehman "Bach 1722," Werckmeister IV/V, Kirnberger II, Pythagorean, or just-intonation-in-C?

Answer those and I'll start the deep dive.

**user:**
1. Let's go with frequencies
2. All that look relevant to baroque music

**assistant:**

Just one thing I need to pin down before I start, since you said frequencies: I need to fix the reference A so the numbers are actually meaningful.

1. Which pitch standard — modern **A=440 Hz**, Baroque **A=415 Hz** (roughly a semitone lower, the most common "historically informed" choice), or both as separate tables?

2. And should I anchor each temperament so its **C is the same across all of them** (cleaner for comparing key-color, since C is the home base), or anchor on **A** (which keeps the reference note literally identical but makes the tempered notes shift around it)?

Give me those two and I'll launch the deep dive — I'll pull frequencies for every Baroque-relevant temperament I can stand up properly (Werckmeister III/IV/V, Kirnberger II & III, Vallotti, Young II, Kellner, quarter-comma meantone, Pythagorean, maybe Silbermann and just intonation in C), with equal temperament as the reference column.

**user:**
1. Modern as standard
2. Let's try with C

**assistant:**

[Generated research report](./research.md)

## 2. Temperament Patch Tape Generation

Next a Python script was created to generate RIM patch tapes to load the researched temperaments.

**Prompt:**
> 1. Read [@pdp1m13/docs/20-frequency-table.md](../docs/20-frequency-table.md) to understand the frequency table, verifying understanding against [@pdp1m13/pdp1m13.lst](../pdp1m13.lst) as the source of truth.
> 2. Read [@pdp1m13/docs/02-pdp1-primer.md](../docs/02-pdp1-primer.md) to understand PDP-1 CPU instructions, referring to [@src/pdp1/cpu.ts](../../src/pdp1/cpu.ts) where needed.
> 3. Read [@pdp1m13/temperament/research.md](./research.md) to understand various Baroque temperaments.
> 4. Write a python script named `pdp1m13/temperament/gen_patch.py` which generates a PDP-1 program tape to patch the frequency table in memory with a given temperament. Presets should be defined for each of the temperaments documented in the research. Write machine code directly instead of requiring an assembly pass. See [@src/pdp1/tape-reader.ts](../../src/pdp1/tape-reader.ts) to understand the tape data format. See the `readIn` function of [@src/pdp1/pdp1.ts](../../src/pdp1/pdp1.ts) to understand RIM (read in mode) format. Create a minimal RIM bootstrap to read the new pitch table directly from tape and write it to the in-memory frequency table. Ensure the bootstrap is loaded into a safe memory region. [@pdp1m13/docs/04-memory-map.md](../docs/04-memory-map.md) provides memory map information, however [@pdp1m13/pdp1m13.lst](../pdp1m13.lst) is the more complete source of truth. Include a `--lst` flag to print the bootstrap's assembly listing and the frequency table that follows. Generated tape files must contain a blank leader and trailer, the length of which should be configured with flags. Examine [@public/tapes/BWV592-3.bin](../../public/tapes/BWV592-3.bin) to determine the default leader and trailer lengths.

<details>
<summary>Claude's Plan (click to expand)</summary>
<pre style="text-wrap: wrap;">
# Plan: `pdp1m13/temperament/gen_patch.py` — temperament patch-tape generator

## Context

The PDP-1 *Music 13* player reads its pitches from a 64-word equal-tempered **frequency table** `pt` at octal `02137`–`02236` in bank 0 (index 0 = rest; indices 1–63 = B0…C#6). We want to retune the player to historical Baroque temperaments **without reassembling the program**: generate a paper-tape image (`.bin`) that, when loaded into the emulator, overwrites `pt` in memory with a temperament-specific table.

The tape is loaded by the emulator's RIM reader (`PDP1.readIn`). Rather than emit one RIM `dio`/data pair per table word, we follow the same pattern the real `pdp1m13.rim` uses: a small **RIM bootstrap** is loaded into a safe region and started; it then reads the 64 raw frequency words that follow on the tape (via `rpb`) and stores them into `pt`. Outcome: a single self-contained Python tool with one preset per temperament documented in `pdp1m13/temperament/research.md`, plus a `--lst` listing mode.

Design was validated end-to-end by a pure-Python CPU simulation that reproduced the patched table bit-exactly. **Pitch anchoring: C4-anchored** (preserve the original middle-C increment 12002; A ≠ 440 Hz in non-equal temperaments) — matches research.md's C-anchored tables.

## Verified facts (ground truth — already checked against source)

- **Tape byte encoding** (`src/pdp1/tape-reader.ts`): a byte counts only if bit `0o200` is set; its low 6 bits (`0o77`) are data; bit `0o100` is ignored. One 18-bit word = **3 counted bytes, MSB-6-bits first**: `byte = 0o200 | (6 bits)`. Blank leader/trailer = `0x00` bytes (skipped).
- **RIM loader** (`PDP1.readIn`, `src/pdp1/pdp1.ts`): loads in **bank 0** (extension 0). Reads words; opcode `0o32` (`dio`) → read next word as data, store to the 12-bit address; opcode `0o60` (`jmp`) → `start()` at that address (runs `continue()` to `hlt`) and return. RIM `dio` words must be **direct** (`0o320000|addr`).
- **Leader/trailer defaults** (from `public/tapes/BWV592-3.bin`, other `.bin` tapes agree): **leader 256 × `0x00`, trailer 192 × `0x00`**.
- **`pt`** = `02137`…`02236`, 64 words. Index→note: idx0 rest; idx1 = B0 (s=11,o=0); idx≥2 → semitone `s=(idx-2)%12`, octave `o=1+(idx-2)//12` (C1=2, C4=38, A4=47, C6=62, C#6=63). Shipped C4=12002, A4=20185.

## Increment formula (C-anchored)

```
increment(s, o, dev) = round( 12002 * 2 ** ( (100*s + dev[s]) / 1200 + (o - 4) ) )
index 0 (rest) = 0
```
`dev[s]` = the temperament's cents deviation from equal temperament for semitone `s` (C=0…B=11), read from research.md's "Cents deviation from equal temperament" table. Reproduces the shipped ET table within ±1; max increment across all temperaments = 51267 (< 2¹⁷, always a positive 18-bit word). Display Hz (for `--lst` only): `inc/12002 * 261.6256`.

**Temperament presets** (13; transcribe by column from research.md — values are `dev` for C,C#,D,D#,E,F,F#,G,G#,A,A#,B; verify against research.md which is the source of truth):

| key | C | C# | D | D# | E | F | F# | G | G# | A | A# | B |
|---|--|--|--|--|--|--|--|--|--|--|--|--|
| `equal` |0|0|0|0|0|0|0|0|0|0|0|0|
| `werckmeister3` |0|−9.78|−7.82|−5.87|−9.78|−1.96|−11.73|−3.91|−7.82|−11.73|−3.91|−7.82|
| `werckmeister4` |0|−17.60|−3.91|−5.87|−7.82|−1.96|−11.73|−5.87|−15.64|−9.78|+3.91|−13.69|
| `werckmeister5` |0|−3.91|+3.91|0|−3.91|+3.91|0|+1.96|−7.82|0|+1.96|−1.96|
| `kirnberger2` |0|−9.78|+3.91|−5.87|−13.69|−1.96|−9.78|+1.96|−7.82|−4.89|−3.91|−11.73|
| `kirnberger3` |0|−9.78|−6.84|−5.87|−13.69|−1.96|−9.78|−3.42|−7.82|−10.27|−3.91|−11.73|
| `vallotti` |0|−5.87|−3.91|−1.96|−7.82|+1.96|−7.82|−1.96|−3.91|−5.87|0|−9.78|
| `young2` |0|−9.78|−3.91|−5.87|−7.82|−1.96|−11.73|−1.96|−7.82|−5.87|−3.91|−9.78|
| `kellner` |0|−9.78|−5.47|−5.87|−10.95|−1.96|−11.73|−2.74|−7.82|−8.21|−3.91|−8.99|
| `meantone` (quarter-comma) |0|−23.95|−6.84|+10.27|−13.69|+3.42|−20.53|−3.42|−27.37|−10.27|+6.84|−17.11|
| `silbermann` |0|−13.69|−3.91|+5.87|−7.82|+1.96|−11.73|−1.96|−15.64|−5.87|+3.91|−9.78|
| `pythagorean` |0|+13.69|+3.91|−5.87|+7.82|−1.96|+11.73|+1.96|+15.64|+5.87|−3.91|+9.78|
| `just` |0|+11.73|+3.91|+15.64|−13.69|−1.96|−9.78|+1.96|+13.69|−15.64|+17.60|−11.73|

Comment in code: in `meantone`, `silbermann`, `pythagorean`, `just` each black key is a single fixed physical key (Eb/G# layout; just spelled for C major) — the table already encodes the keyboard's actual 12 pitch classes.

## Bootstrap machine code (no assembler; base `B`, default `0o2304` = `not` scratch buffer)

| addr | octal word | meaning |
|---|---|---|
| B+0 | `002137` | `ptr` data = `pt` (write pointer) |
| B+1 | `777677` | `cnt` data = ones-complement(−64) |
| B+2 | `730002` | `rpb` (loop top) |
| B+3 | `0o330000\|(B+0)` | `dio i ptr` — store IO at C(ptr) |
| B+4 | `0o440000\|(B+0)` | `idx ptr` |
| B+5 | `0o460000\|(B+1)` | `isp cnt` — cnt++, skip when ≥0 |
| B+6 | `0o600000\|(B+2)` | `jmp loop` |
| B+7 | `760400` | `hlt` |

Reads exactly 64 words then halts (relies on the CPU normalizing −0→+0 in `idx`/`isp` — add a code comment; do not "optimize" the counter). `dio i ptr` resolves to bank-0 `02137`…`02236` under both extend states (pointer values never set the indirect bit `0o10000`). Safe region: `[B,B+8)` must not overlap the player (`0o4`…`~0o2274`) or `pt` (`0o2137`…`0o2236`); validate `--boot-addr` accordingly (default `0o2304` leaves an 8-word gap above the literal pool and is below DDT).

## Tape layout

```
[leader: 256 × 0x00]
RIM section:  for k in 0..7:  word(0o320000|(B+k))  +  word(boot[k])     # DIRECT dio + data
              word(0o600000|(B+2))                                       # jmp loop -> start bootstrap
[64 raw frequency words]                                                 # read by the bootstrap's rpb
[trailer: 192 × 0x00]
```
Each 18-bit word → 3 bytes (`0o200|6bits`, MSB first). Total ≈ 691 bytes (256 + 51 + 192 + 192).

## Module structure (`pdp1m13/temperament/gen_patch.py`, stdlib only)

- **Constants**: `PT_BASE=0o2137`, `PT_LEN=64`, `C4_INC=12002`, `C4_HZ=261.6256`, `DEFAULT_BOOT=0o2304`, `DEFAULT_LEADER=256`, `DEFAULT_TRAILER=192`, opcode bases, `IND=0o10000`, `RPB=0o730002`, `HLT=0o760400`, `WORD_MASK=0o777777`.
- `TEMPERAMENTS`: dict key → `{display, dev:[12 floats]}` (the table above). `NOTE_NAMES`.
- `note_for_index(idx) -> (s,o)|None`; `increment(s,o,dev) -> int`; `build_table(dev) -> [64 ints]`; `freq_hz(inc) -> float`.
- `opword(op_base, addr, indirect=False)`; `build_bootstrap(base) -> [(addr,word,mnemonic)]`; `assemble_rim(boot, base) -> [words]` (direct dio pairs + jmp).
- `word_to_bytes(w) -> bytes`; `build_tape(table, base, leader, trailer) -> bytes`.
- `format_listing(boot, rim_words, table) -> str` (section 1: bootstrap asm `addr  octal  mnemonic`; section 2: table `idx  note+oct  Hz  octal-increment`).
- `main()`: argparse — positional `temperament` (`choices` = preset keys) ; `--list`; `-o/--out` (default `f"{key}.bin"`); `--leader`/`--trailer` (ints); `--boot-addr` (`int(x,0)`, validated); `--lst`; `--verify`.

## Verification (build into the script)

1. **Self-decode** (`--verify`, also run in tests): re-decode the generated bytes with a ~12-line `rpb` clone; assert the 64 recovered data words equal `build_table(dev)`.
2. **ET regression**: assert `build_table(equal)` matches the shipped `pt` words (embed/parse the 64 octals from `pdp1m13/pdp1m13.lst`) within ±1.
3. **Range guard**: assert every word `0 ≤ w < 1<<17`; raise on violation (protects future preset edits).
4. **End-to-end** (strongest): a ~40-line ones-complement CPU subset (`rpb`/`readIn`/`dio`/`idx`/`isp`/`jmp`/`hlt` with −0 normalization) loads the generated tape and asserts `mem[0o2137..0o2236] == table` after `hlt`. Optional gold check: a Node/tsx harness importing `src/pdp1/*` to `readIn(player)` then `readIn(patch)` and dump `pt`.
5. Manual: `gen_patch.py werckmeister3 --lst` and eyeball the table (C4 = 12002; E lower than ET; etc.).

## Out of scope (note for follow-up)

Wiring the patch into the worklet/UI is **not** part of this task. Integration note for later: apply the patch right after `initPDP1`'s `readIn` of the player (buffers pristine), with `breakpoint`/`singleInstruction` at defaults so `continue()` runs the bootstrap to `hlt`.

## Critical files

- **New**: `/Users/joe/projects/hc2/pdp1m13/temperament/gen_patch.py` (the deliverable).
- Source of presets: `pdp1m13/temperament/research.md` (verify dev vectors against it).
- Ground truth refs: `src/pdp1/cpu.ts` (encodings, −0, dio/extend), `src/pdp1/pdp1.ts` (`readIn`/`start`/`continue`), `src/pdp1/tape-reader.ts` (`rpb` byte packing), `pdp1m13/pdp1m13.lst` (shipped ET table + `not`/literal-pool addresses).
</pre>
</details>


**RESULT:** [Claude's gen_patch.py script](./gen_patch.py)

## 3. Temperament Selection UI

Next the UI to select temperaments was needed. I kept this prompt minimal, curious to see what was sufficient for a working implementation. Claude built the UI as well as figured out when and how to operate the PDP-1 emulator to load in the patch tape ahead of loading a music tape.

Claude prompted back a question of if we should load a temperament tape generated from our prior script, or just compute the pitch table and poke the emulator memory at runtime. I chose to former, to match PDP-1 operation.

**Prompt:**
> Plan out the addition of a UI dropdown for selecting temperament. Display it below the upload button and above the logs.

<details>
<summary>Claude's Plan (click to expand)</summary>
<pre style="text-wrap: wrap;">
# Plan: UI dropdown for selecting temperament

## Context

We have `pdp1m13/temperament/gen_patch.py`, which generates a RIM patch tape (`.bin`) that overwrites the player's frequency table `pt` (octal `02137`–`02236`) with a chosen historical temperament. Now we want a **dropdown in the web UI** to pick a temperament, placed **below the upload button and above the log pane**. Selecting one retunes the player.

**Chosen mechanism (user-selected): load a generated patch tape.** The build ships one pre-generated `.bin` per temperament; the client fetches the selected tape and the worklet RIM-loads it via `pdp1.readIn()`, exactly as `gen_patch.py` was designed for. Because the patch bootstrap's scratch (`0o2304`) overlaps the note buffer, applying a temperament must be followed by a full **song reload** (re-read voices + recompile), which also rebuilds the detuned per-voice tables (`tun` reads `pt` at compile time). This restarts the current song — the same UX as a tempo change. `pt` persists in worklet memory across songs, so a temperament only needs re-applying when the selection changes.

Key facts confirmed from source:
- Layout (`public/main.css`): `main` is a grid, `grid-template-columns: auto 1fr`, `grid-template-rows: auto 1fr`. Upload button lives in `#logs-header` (row 1 / col 2); `#logs` is row 2 / col 2. So the dropdown belongs in **column 2, between rows 1 and 2** (a new grid row).
- Client (`src/audio-client.ts`): the worklet is created lazily on the first `playMusic` (`init()`); tapes are fetched via `fetchTape(url) → {url, data: Uint8Array}` and sent with a transferable buffer; `playMusic` early-returns with `restart` when `activeSongURL === url`; tempo changes go through `recompile`.
- Worklet (`src/audio-worklet/pdp1-audio.ts`): message switch dispatches `init`/`load-music`/`restart`/`stop`/`recompile`; `pdp1.readIn(tape)` and `pdp1.deposit()` exist; after a compile `singleInstruction=true` and `breakpoint=null`. `initPDP1` does `mountTape` + `readIn()`.

## 1. Generate patch-tape assets

Run the existing generator for every preset into a new asset dir (committed, copied into `dist/` by the build):

```
mkdir -p public/tapes/temperaments
for t in $(python3 pdp1m13/temperament/gen_patch.py --list | awk '{print $1}'); do
  python3 pdp1m13/temperament/gen_patch.py "$t" -o "public/tapes/temperaments/$t.bin"
done
```

13 files (`equal.bin` … `just.bin`), ~700 bytes each. Selecting **Equal** loads `equal.bin` to restore equal temperament (computed ET, ≤±1 increment vs the pristine ROM — inaudible; note in code). No change to `gen_patch.py` itself is required.

## 2. Protocol — `src/shared-types.ts`

Add a client→worklet message and include it in the `PDP1AudioMessage` union:

```ts
export interface SetTemperamentMessage { type: 'set-temperament'; tape: DataTape; }
```

## 3. Worklet — `src/audio-worklet/pdp1-audio.ts`

Add `case 'set-temperament': this.applyTemperament(message.tape); break;` and a method that patches `pt` (it must NOT recompile — the client follows with a full song reload):

```ts
private applyTemperament(tape: DataTape) {
  const { pdp1 } = this;
  // readIn runs the bootstrap to hlt; ensure it isn't gated by leftover state
  pdp1.singleInstruction = false;
  pdp1.breakpoint = null;
  pdp1.stop();
  pdp1.mountTape(tape.data);
  pdp1.readIn();                 // bootstrap writes 64 words into pt @ 02137..02236, halts
  this.postLogs(['# apply temperament', `mount: ${tape.url}`, 'patched pt 02137..02236']);
}
```

(The note buffer at `0o2304` is clobbered by the bootstrap scratch; harmless because the following `load-music` re-reads all voices.)

## 4. Client — `src/audio-client.ts`

- Import `SetTemperamentMessage`.
- New state: `selectedTemperament = 'equal'`, `appliedTemperament: string | null = null` (what's in `pt`; pristine ROM after `init` ≈ equal), `patchTapes = new Map<string, DataTape>()` (fetch cache).
- `private async ensureTemperamentApplied()` — if `selectedTemperament !== appliedTemperament`, fetch (cache) `tapes/temperaments/${selectedTemperament}.bin`, post `set-temperament` with a transferable disposable copy, set `appliedTemperament = selectedTemperament`. Called inside `playMusic` **immediately before** the `load-music` postMessage (so `pt` is patched before voices are read/compiled; messages are processed in order). Same-temperament song switches skip it.
- `public async setTemperament(key: string)`:
  - `this.selectedTemperament = key;`
  - if `this.needsInit` → return (stored; applied on first play).
  - if `this.activeTape` → `this.activeSongURL = ''; await this.playMusic(this.activeTape);` — forces a full reload (bypasses the `restart` shortcut); `playMusic` already suspends+stops to avoid pops, then `ensureTemperamentApplied()` patches and `load-music` re-reads+recompiles+plays.
  - else → no-op (selection stored; applied on next play).
- `init()`: set `appliedTemperament = 'equal'` (fresh `readIn` of the player leaves the ROM/equal table in `pt`).

## 5. UI — HTML, CSS, wiring

**`public/index.html`** — insert between `</div>` of `#logs-header` (line 26) and `<ul id="playlist">` (line 27):

```html
<div id="temperament-control">
  <label for="temperament-select">Temperament:</label>
  <select id="temperament-select">
    <option value="equal" selected>Equal</option>
    <option value="werckmeister3">Werckmeister III</option>
    <option value="werckmeister4">Werckmeister IV</option>
    <option value="werckmeister5">Werckmeister V</option>
    <option value="kirnberger2">Kirnberger II</option>
    <option value="kirnberger3">Kirnberger III</option>
    <option value="vallotti">Vallotti</option>
    <option value="young2">Young II</option>
    <option value="kellner">Kellner</option>
    <option value="meantone">¼-comma Meantone</option>
    <option value="silbermann">Silbermann</option>
    <option value="pythagorean">Pythagorean</option>
    <option value="just">Just (C major)</option>
  </select>
</div>
```

**`public/main.css`** — add a grid row so the control sits in col 2 between header and logs:
- `main { grid-template-rows: auto 1fr; }` → `auto auto 1fr`.
- New: `#temperament-control { grid-row: 2; grid-column: 2; display: flex; align-items: center; gap: 0.5em; }`.
- `#playlist`: `grid-row: 2;` → `grid-row: 2 / span 2;` (stay full-height on the left).
- `#logs`: `grid-row: 2;` → `grid-row: 3;`.
- `#temperament-select`: mirror `#tw-input` (panel bg, text color, `1px solid hsl(var(--theme-hue),42%,25%)`, `border-radius: 3px`, Kanit weight 300, padding); let width be auto.
- In the `@media (max-width: 700px)` block (single column): add a row to `grid-template-rows` and place `#temperament-control { grid-row: 5; grid-column: 1; }`, `#logs { grid-row: 6; }` (it currently runs `… auto 1fr` with logs-header row 4 / logs row 5).

**`src/index.ts`** — after the playlist build, mirror the existing `getElementById` + `addEventListener` pattern:

```ts
const temperamentSelect = document.getElementById('temperament-select') as HTMLSelectElement;
temperamentSelect.addEventListener('change', () => audioClient.setTemperament(temperamentSelect.value));
```

## Critical files

- `public/index.html` — add `#temperament-control` between `#logs-header` and `#playlist`.
- `public/main.css` — 3-row grid + `#temperament-control`/`#temperament-select` styles + `@media` tweak.
- `src/index.ts` — grab the `<select>`, wire `change` → `audioClient.setTemperament`.
- `src/audio-client.ts` — temperament state, `ensureTemperamentApplied()`, `setTemperament()`, `playMusic` hook, `init` baseline.
- `src/audio-worklet/pdp1-audio.ts` — `set-temperament` case + `applyTemperament()`.
- `src/shared-types.ts` — `SetTemperamentMessage` + union.
- `public/tapes/temperaments/*.bin` — 13 generated patch tapes (new committed assets).

## Verification

1. Generate the 13 tapes (step 1); confirm `python3 pdp1m13/temperament/gen_patch.py --verify` still passes (tape correctness is already proven end-to-end against the real emulator).
2. `npm run build` — type-checks both bundles via the rollup TypeScript plugin (confirms the new message type and client/worklet wiring compile).
3. Serve `dist/` (`npx serve dist`) and in the browser:
   - Play a song, then pick **Werckmeister III** → the song restarts audibly retuned (major thirds calmer / E flatter than Equal); the log pane shows `# apply temperament`, `mount: tapes/temperaments/werckmeister3.bin`, then the recompile/`# compiled` lines.
   - Pick **Pythagorean** → noticeably wide/bright thirds; **Equal** → back to standard tuning.
   - Switch to a different song → the selected temperament persists (no re-patch needed).
   - Confirm the dropdown renders directly below the **upload** button and above the **logs** pane in both wide and narrow (`<700px`) layouts.
</pre>
</details>

See the [`applyTemperament` function](https://github.com/joeblynch/harmony-compiler-2/commit/ab09552acf3a72184ad64115bfc19b5837a2a8f6#diff-3aee021634fb257533b9fe14105dc0e53708a74f251dadc9ebb96b19863143e9R327-R350) for the added PDP-1 operation code. All changes can be found in that linked commit diff.
