# pdp1m13 Temperament Development Log

## 1. Research Baroque Temperaments

An initial run of research was done with research mode enabled on https://claude.ai. The generated report was then copied into this repo for reference.

**Prompt:**
> Research historical Baroque temperaments and others that are relevant to Baroque music. Our primary output should be a markdown table with the equal temperament note frequencies alongside the alternate note frequencies of each other tuning.

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
