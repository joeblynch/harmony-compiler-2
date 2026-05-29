# What PDP-1 Music 13 is

*PDP-1 Music 13* is Peter Samson's **music player** for the DEC PDP-1 — the program that made the PDP-1 famous as a music machine. It is the back end of a two-program toolchain: a *separate* program, Peter Samson's **Harmony Compiler**, takes a score written in a custom music-transcription language and compiles it into an *intermediate* note/bar tape; *Music 13* then reads that tape, runs its **own second compilation pass**, and plays the result. "Music 13" is the thirteenth revision; the source header carries a terse dated change-log spanning years of revisions:

```
/pdp-1 music 13
/  050117...051206 (change to cxt 060330) (bumped nog 060525)
/  061203 adj. to detuning, added sense switches 5, 6
/  070417 minor changes
/  080813 inverted sense switch 1
/  plays from core banks 1...2
/  (assumes compiled there)
```

Each entry is a `YYMMDD` date: the core work spans `050117`–`051206`, with later touch-ups in `060330`/`060525`, the detuning and sense-switch-5/6 additions on `061203`, "minor changes" on `070417`, and the sense-switch-1 inversion on `080813`. The last two lines are the load-time contract for this revision: the player **plays from core banks 1 and 2**, assuming the music has already been compiled there.

So note that the word "compiler" appears in two distinct roles. The **Harmony Compiler** is the separate front-end tool that turns the human-authored score into the intermediate note/bar tape; that tape is *Music 13*'s input. *Music 13* itself then runs in two internal stages. First a **compile** pass (the `cpl`/`cc` routines, a *second* compilation): it reads the intermediate note/bar tape and packs it into a dense playback stream in core banks 1–2. Then a **real-time player** stage: it walks that compiled stream (in extend mode, so its pointers can hop bank-to-bank) and synthesizes audio by toggling the PDP-1's **program-flag** bits. There is no DAC and no sound chip — pitch and waveform come entirely from how often the player's tight inner loop (`lup` at `2014` octal, ~175 µs/pass) flips a flag. This is why timing accuracy in the emulator is load-bearing: the music's pitch *is* the instruction timing.

It produces **four voices**, each driven by one program flag. The player keeps a per-voice frequency increment (`f1`–`f4`) and phase accumulator (`p1`–`p4`); each loop pass adds the increment to the phase, and when the 18-bit sum's **sign bit** goes set — i.e. the 17-bit phase overflows — that voice's flag is set (otherwise it is cleared), producing a square wave whose frequency is proportional to the increment. (The loop tests this with `spa`, "skip if AC ≥ 0": a non-negative sum falls through to `dac p`/`clf n`, a negative sum takes the `jda p`/`stf n` path.) Of the six program flags, flags 1–4 map to the four audio channels (`40`→voice 1 Left+, `20`→voice 2 Left−, `10`→voice 3 Right+, `04`→voice 4 Right−); flags 5 and 6 carry status (read / compiled). So the flag toggling on 1–4 literally is the sound. For ensemble shimmer *Music 13*'s compile pass builds four slightly **detuned** copies of the frequency table (one per voice), so the four voices sit a hair apart in pitch.

This is the genuine historical program, byte-for-byte. It runs **unmodified inside this repo's cycle-accurate emulator**: the RIM-loader bootstraps *Music 13* into bank 0, its compile pass then writes the packed playback stream into core banks 1–2, and the player streams it back from there. The AudioWorklet samples program flags 1–4 at the audio sample rate to reconstruct the four square-wave voices, and polls flag 6 (`01`) to know when compilation has finished. Nothing in the playback path is reimplemented in software — the browser is just listening to the same flag bits a real PDP-1 would toggle.
