# Historical Baroque Temperaments: Definitions and Frequency Tables Anchored to a Fixed Middle C (C4 = 261.63 Hz)

**TL;DR**
- With **C4 frozen at 261.6256 Hz** (the value equal temperament gives from A4 = 440 Hz, i.e. 440 ÷ 2^(9/12)), every one of the 13 temperaments below shares an *identical* C4, and each tuning's other 11 notes are built outward from that C using its own interval recipe — so **A4 = 440 Hz holds exactly only in the Equal Temperament column** (e.g. A ≈ 437.0 Hz in Werckmeister III, 436.0 Hz in just intonation, 441.5 Hz in Pythagorean).
- The frequencies are computed as **f = 261.6256 × 2^(cents-above-C ⁄ 1200)** and were cross-verified three ways (first-principles circle-of-fifths stacking, the instrument-tuner.com cents database, and Tunable's per-note data); the clearest "key-color" fingerprint is the C-major third **E**, which ranges from a pure 5:4 (327.03 Hz) in quarter-comma meantone, Kirnberger and just intonation, through ~390¢ in the well-temperaments, to a harsh Pythagorean ditone (331.12 Hz).
- **No temperament can be proven to be the one Bach used** for the *Well-Tempered Clavier*; "well-tempered" denotes a *category* of circulating tunings, and the famous Bradley Lehman 2005 title-page-squiggle reconstruction is one contested hypothesis among many (rebutted by O'Donnell and by Lindley & Ortgies in *Early Music*, Nov. 2006).

---

## Key Findings

1. **C-anchoring is the right lens for comparing key color.** Conventional tuner tables zero deviations on A, which makes C (and the all-important C–E third and C–G fifth) move from system to system. Pinning C and letting A float exposes exactly how each tuning colors a fixed tonic. The diagnostic note is **E in the C column**: pure 5:4 = 327.03 Hz (Kirnberger II/III, quarter-comma meantone, just intonation); ~390¢/328.1 Hz (Werckmeister, Vallotti, Young, Kellner, Silbermann); ~equal/329.6 Hz; Pythagorean ditone 331.12 Hz.

2. **The Werckmeister numbering is genuinely confusing and was reconciled.** This report uses the **monochord labels** (the user's convention): "Werckmeister III" = Correct Temperament No. 1 (4 fifths × ¼ Pythagorean comma); "Werckmeister IV" = No. 2 (5 fifths × ⅓ comma narrow + 2 widened); "Werckmeister V" = No. 3. Wikipedia calls these "Werckmeister I (III)," "II (IV)," "III (V)."

3. **Two source-level errors were caught and corrected.** (a) Tunable's *prose* misstates Kellner's tempered fifths and invents a widened E♭–B♭; Kellner's own 1977 publication specifies **C–G, G–D, D–A, A–E, B–F♯ each narrowed by 1/5 Pythagorean comma, with the other seven fifths pure and none widened** (Tunable's numerical table is nonetheless correct). (b) "Vallotti" as universally used today is the **1/6-Pythagorean-comma** version; Vallotti's *original* used 1/6 syntonic comma, leaving a schisma fifth at B♭–F.

4. **Three systems require distinct enharmonic spellings** (C♯ ≠ D♭, etc.): quarter-comma meantone and Silbermann (Eb–G# layout, wolf at G♯–E♭) and Pythagorean (Eb–G# chain, wolf at G♯–E♭). The circulating well-temperaments and equal temperament let each black key serve as both sharp and flat.

---

## Details

### Introduction: the C-anchoring method and why it reveals key color

This report fixes a single, identical reference point — **middle C (C4) = 261.6256 Hz** — across every temperament, and builds each tuning's other eleven notes outward from that C.

**Why C4 = 261.63 Hz?** We start from the modern concert-pitch standard **A4 = 440 Hz** and compute it only in *equal temperament*: C4 = 440 ÷ 2^(9/12) = 440 ÷ 1.681793 = **261.6256 Hz**. That value is then frozen as the common anchor. Consequently, **A4 = 440 Hz holds exactly only in the Equal Temperament column.** Elsewhere A lands wherever the tuning places it relative to C (437.03 Hz in Werckmeister III, 436.04 Hz in just intonation, 441.49 Hz in Pythagorean). This is the deliberate consequence of anchoring on C rather than A.

**Why anchor on C instead of A?** Anchoring on A (as tuners do, because A is the fork pitch) makes C move and scatters the very intervals — the C–E third, the C–G fifth — that define a temperament's home-key character. Pinning C and letting the others float shows directly **how each tuning colors the notes around a fixed tonic**. The frequency of E in the C column is the single clearest fingerprint of each system.

**The arithmetic.** For each note I first find its size in cents above C *within that temperament* (by stacking the temperament's tempered and pure fifths around the circle and reducing into one octave), then convert:

> **frequency = 261.6256 × 2^(cents_above_C ⁄ 1200)**

Because C = 0 cents in every column, **C4 = 261.6256 × 2⁰ = 261.63 Hz in all thirteen columns**, exactly as required. Reference constants: Pythagorean comma = 23.460¢ (531441/524288); syntonic comma = 21.506¢ (81/80); schisma = 1.954¢ (32805/32768); pure fifth 3:2 = 701.955¢; equal-tempered fifth = 700¢; pure major third 5:4 = 386.314¢; Pythagorean major third 81:64 = 407.820¢.

### Primary deliverable: the frequency table (Hz)

All frequencies in Hz, two decimals, **C4 = 261.63 Hz identical in every column**. Black keys are spelled per each system's standard layout: the well-temperaments and equal temperament are *circulating* (black key = both sharp and flat); **quarter-comma meantone, Silbermann and Pythagorean use the Eb–G# layout** (flats Eb, Bb; sharps C#, F#, G#); **just intonation is spelled for C major** (C#=16/15, Eb=6/5, F#=45/32, Ab=8/5, Bb=9/5). In those four unequal systems the tabulated black-key pitch is the one actually on the keyboard.

| Note | Equal | Werck III | Werck IV | Werck V | Kirn II | Kirn III | Vallotti | Young II | Kellner | ¼-Meantone | Silbermann | Pythag. | Just (C maj) |
|------|------|------|------|------|------|------|------|------|------|------|------|------|------|
| **C4** | 261.63 | 261.63 | 261.63 | 261.63 | 261.63 | 261.63 | 261.63 | 261.63 | 261.63 | 261.63 | 261.63 | 261.63 | 261.63 |
| **C#/Db** | 277.18 | 275.62 | 274.38 | 276.56 | 275.62 | 275.62 | 276.25 | 275.62 | 275.62 | 273.37 | 275.00 | 279.38 | 279.07 |
| **D** | 293.66 | 292.34 | 293.00 | 294.33 | 294.33 | 292.51 | 293.00 | 293.00 | 292.74 | 292.51 | 293.00 | 294.33 | 294.33 |
| **D#/Eb** | 311.13 | 310.07 | 310.07 | 311.13 | 310.07 | 310.07 | 310.78 | 310.07 | 310.07 | 312.98 | 312.18 | 310.07 | 313.95 |
| **E** | 329.63 | 327.77 | 328.14 | 328.88 | 327.03 | 327.03 | 328.14 | 328.14 | 327.55 | 327.03 | 328.14 | 331.12 | 327.03 |
| **F** | 349.23 | 348.83 | 348.83 | 350.02 | 348.83 | 348.83 | 349.62 | 348.83 | 348.83 | 349.92 | 349.62 | 348.83 | 348.83 |
| **F#/Gb** | 369.99 | 367.50 | 367.50 | 369.99 | 367.91 | 367.91 | 368.33 | 367.50 | 367.50 | 365.63 | 367.50 | 372.51 | 367.91 |
| **G** | 392.00 | 391.11 | 390.67 | 392.44 | 392.44 | 391.22 | 391.55 | 391.55 | 391.38 | 391.22 | 391.55 | 392.44 | 392.44 |
| **G#/Ab** | 415.30 | 413.43 | 411.57 | 413.43 | 413.43 | 413.43 | 414.37 | 413.43 | 413.43 | 408.79 | 411.57 | 419.07 | 418.60 |
| **A** | 440.00 | 437.03 | 437.52 | 440.00 | 438.76 | 437.40 | 438.51 | 438.51 | 437.92 | 437.40 | 438.51 | 441.49 | 436.04 |
| **A#/Bb** | 466.16 | 465.11 | 467.22 | 466.69 | 465.11 | 465.11 | 466.16 | 465.11 | 465.11 | 468.01 | 467.22 | 465.11 | 470.93 |
| **B** | 493.88 | 491.66 | 490.00 | 493.33 | 490.55 | 490.55 | 491.10 | 491.10 | 491.32 | 489.03 | 491.10 | 496.68 | 490.55 |

### Cents deviation from equal temperament (C-anchored — verifies the math)

C = 0.00 in every column by construction. The **A row** shows how far each system's A drifts from 440 Hz once C is fixed (it would be the 0.00 reference in an A-anchored tuner table).

| Note | Equal | Werck III | Werck IV | Werck V | Kirn II | Kirn III | Vallotti | Young II | Kellner | ¼-Mean | Silb. | Pythag. | Just |
|------|------|------|------|------|------|------|------|------|------|------|------|------|------|
| C | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| C#/Db | 0 | −9.78 | −17.60 | −3.91 | −9.78 | −9.78 | −5.87 | −9.78 | −9.78 | −23.95 | −13.69 | +13.69 | +11.73 |
| D | 0 | −7.82 | −3.91 | +3.91 | +3.91 | −6.84 | −3.91 | −3.91 | −5.47 | −6.84 | −3.91 | +3.91 | +3.91 |
| D#/Eb | 0 | −5.87 | −5.87 | 0 | −5.87 | −5.87 | −1.96 | −5.87 | −5.87 | +10.27 | +5.87 | −5.87 | +15.64 |
| E | 0 | −9.78 | −7.82 | −3.91 | −13.69 | −13.69 | −7.82 | −7.82 | −10.95 | −13.69 | −7.82 | +7.82 | −13.69 |
| F | 0 | −1.96 | −1.96 | +3.91 | −1.96 | −1.96 | +1.96 | −1.96 | −1.96 | +3.42 | +1.96 | −1.96 | −1.96 |
| F#/Gb | 0 | −11.73 | −11.73 | 0 | −9.78 | −9.78 | −7.82 | −11.73 | −11.73 | −20.53 | −11.73 | +11.73 | −9.78 |
| G | 0 | −3.91 | −5.87 | +1.96 | +1.96 | −3.42 | −1.96 | −1.96 | −2.74 | −3.42 | −1.96 | +1.96 | +1.96 |
| G#/Ab | 0 | −7.82 | −15.64 | −7.82 | −7.82 | −7.82 | −3.91 | −7.82 | −7.82 | −27.37 | −15.64 | +15.64 | +13.69 |
| A | 0 | −11.73 | −9.78 | 0 | −4.89 | −10.27 | −5.87 | −5.87 | −8.21 | −10.27 | −5.87 | +5.87 | −15.64 |
| A#/Bb | 0 | −3.91 | +3.91 | +1.96 | −3.91 | −3.91 | 0 | −3.91 | −3.91 | +6.84 | +3.91 | −3.91 | +17.60 |
| B | 0 | −7.82 | −13.69 | −1.96 | −11.73 | −11.73 | −9.78 | −9.78 | −8.99 | −17.11 | −9.78 | +9.78 | −11.73 |

### The thirteen temperaments: history, definition, and character

**Equal Temperament (the reference).** Every fifth narrowed by 1/12 Pythagorean comma to exactly 700¢; all 12 semitones identical. Theorized in the 16th–17th centuries (Galilei, Mersenne) but not the keyboard standard until the 19th century — after Bach's death. Computed here from A4 = 440 → C4 = 261.6256 Hz, the anchor for all other columns. Character: no key color; slightly wide (+14¢) major thirds.

**Werckmeister III** (Andreas Werckmeister, *Musicalische Temperatur*, Quedlinburg, 1691; "Correct Temperament No. 1," monochord label III). **Fifths C–G, G–D, D–A and B–F♯ each narrowed by 1/4 Pythagorean comma (≈5.87¢); the other eight pure.** The first true circulating well temperament: all 24 keys usable, near-pure thirds in C/G/D brightening toward remote keys. Werckmeister's treatises and the term *wohl temperirt* were known in Bach's circle (Buxtehude advocated his tunings; Walther wrote his dictionary entry), making this the most popular modern choice for the WTC — though there is no proof Bach used it.

**Werckmeister IV** (Werckmeister 1691, "No. 2," label IV). **Fifths C–G, D–A, E–B, F♯–C♯ and B♭–F narrowed by 1/3 Pythagorean comma (≈7.82¢); G♯–D♯ and E♭–B♭ widened by 1/3 comma; the rest pure.** Designed mainly for diatonic music; most intervals near sixth-comma meantone. The most lopsided of the three (very flat Db at −17.6¢, wide Bb at +3.9¢), with strongly contrasted key colors. Werckmeister's monochord string-length approximations can differ by 1–2¢ from the theoretical 1/3-comma values used here.

**Werckmeister V** (Werckmeister 1691, "No. 3," label V; D=175 reading). **Fifths C–G, G–D, D–A, B–F♯, F♯–C♯ and B♭–F tempered narrow and G♯–D♯ tempered wide; the rest pure.** Closer to equal temperament and least used today. *Source caveat:* Werckmeister's printed monochord gives D=176, widely treated as a misprint for 175 (176 yields a musically incoherent, over-flat G–D fifth); this report uses the corrected D=175 layout.

**Kirnberger II** (Johann Philipp Kirnberger, pupil of J.S. Bach; *Die Kunst des reinen Satzes*, 1771). **Fifths D–A and A–E each narrowed by 1/2 syntonic comma (≈10.75¢), F♯–C♯ narrowed by a schisma (≈1.95¢), the rest pure.** Concentrating the comma on two fifths yields a pure C–E and pure D–F♯ third but a conspicuously rough D–A/A–E pair. Strong contrast: lush pure thirds in C/G versus near-Pythagorean remote keys.

**Kirnberger III** (Kirnberger, *Die Kunst des reinen Satzes*, vol. 1, 1779). **Fifths C–G, G–D, D–A and A–E each narrowed by 1/4 syntonic comma (≈5.38¢) — making C–E a pure 5:4 — F♯–C♯ narrowed by a schisma, the rest pure.** Same CGDAE meantone fifths as quarter-comma meantone but with no wolf. Per Tunable's Kirnberger III guide, "Kirnberger argued that his system was the most consonant circulating temperament and claimed it was consistent with Bach's own tuning preferences. This claim has been disputed by scholars, particularly those who favor the Bach-Lehman reconstruction." Character: singing, near-just C/F/G/Bb majors, key color rising toward the sharps.

**Vallotti** (Francescantonio Vallotti, Padua; worked out by his own claim by 1728, published in *Trattato/Della scienza teorica e pratica della moderna musica*, Book 2, ch. 4, 1779; first cited in England by William Jones, *Physiological Disquisitions*, 1781, with reference to Tartini's endorsement). **Modern version used here: six fifths F–C–G–D–A–E–B each narrowed by 1/6 Pythagorean comma (≈3.91¢); the other six pure.** Symmetrical key-color wheel centered on D; C and G majors warm and sweet. *Caveat on the original:* Vallotti himself specified 1/6 *syntonic* comma, which leaves B♭–F narrow by a leftover schisma; the modern scheme substitutes the cleaner 1/6-Pythagorean-comma version (no schisma fifth). The two differ by under ~2¢ per note and are audibly indistinguishable; the table uses the modern version, as requested.

**Young's Second Temperament** (Thomas Young, given to the Royal Society January 1800, *Philosophical Transactions* vol. 90; Young wrote "As far as I know, most of these observations are new," apparently unaware of Vallotti). **Six fifths C–G–D–A–E–B each narrowed by 1/6 Pythagorean comma; the other six pure** — Vallotti's scheme shifted one step around the circle to begin on C, hence "Vallotti–Young" or "shifted Vallotti." Best thirds shift to G/D. Ross Duffin's polemic "Why I hate Vallotti (or is it Young?)" (*Historical Performance Online*, Early Music America, 2000) argues that "a flexible 1/6 syntonic comma meantone temperament was (and should be today) the standard tuning system used for ensemble music in the baroque era," and that Vallotti (1779) and Young (1800) "are not the best historical choices for Baroque music."

**Kellner's "Bach" temperament** (Herbert Anton Kellner, "Eine Rekonstruktion der wohltemperierten Stimmung von Johann Sebastian Bach," *Das Musikinstrument* 26, 1977; English in *BACH*, Riemenschneider Bach Institute, 1979). **Five fifths C–G, G–D, D–A, A–E and B–F♯ each narrowed by 1/5 Pythagorean comma (≈4.69¢); the other seven fifths pure; no widened fifth.** This corrects a widespread error: several web sources (including Tunable's *prose*) wrongly list the five as C–G, G–D, D–A, B–F♯, F♯–C♯ and invent a widened E♭–B♭. Kellner's own publication specifies A–E tempered, E–B pure, and all seven non-tempered fifths pure 3:2; Tunable's *numerical* table is nonetheless correct and matches Kellner to ~0.1¢. Kellner derived the "5 tempered / 7 pure" structure from numerology read into Bach's seal and the "BACH = 14" cabbala — a method musicologists largely reject (Di Veroli, *Early Music* 9/2, 1981, rated it inferior to Werckmeister III and Barnes). The result resembles a milder Werckmeister III; C/G majors smoother than equal, the C–E third widened ~2.8¢ to beat in step with C–G.

**Quarter-comma meantone** (codified by Pietro Aron, 1523; dominant keyboard tuning c. 1500–1690). **Every fifth narrowed by 1/4 syntonic comma (≈5.38¢, to 696.578¢), producing eight pure 5:4 thirds.** Layout Eb–Bb–F–C–G–D–A–E–B–F♯–C♯–G♯ leaves the **wolf at G♯–E♭ (≈737.6¢)**. Enharmonics distinct (Eb≠D#, G#≠Ab). Character: gorgeously pure vocal major triads in central keys (the sound of early/high-Baroque organ and harpsichord) at the cost of unplayable remote keys.

**Silbermann** (Gottfried Silbermann, 1683–1753, Saxon builder and associate of Bach). **A regular 1/6-comma meantone: every fifth narrowed by 1/6 comma.** Sources differ on the comma: Silbermann used the **Pythagorean comma** (fifth = 698.045¢, the version tabulated here); some references use 1/6 *syntonic* comma (698.371¢) — a ~0.3¢ difference. Milder than quarter-comma (thirds ~7¢ wide), with a smaller wolf at G♯–E♭. Per Stephen Bicknell's temperament guide, Bach "is supposed to have played Gottfried Silbermann's organs in outlandish keys, until the builder was forced to retire, 'his wolf howling in his ears'" — i.e. Bach deliberately exposed the meantone wolf, preferring a flexible circulating tuning. Silbermann's organs remain central Baroque instruments: per Wikipedia he "designed and built approximately 50 organs, 35 of which are identified as extant by the Gottfried Silbermann Society, including the organ in the Hofkirche in Dresden," with the Hofkirche and Freiberg Cathedral (three manuals, 41 stops) instruments considered his greatest.

**Pythagorean tuning** (antiquity; the medieval keyboard standard). **A chain of eleven pure 3:2 fifths from Eb to G#, leaving the wolf diminished sixth G♯–E♭ (≈678.5¢).** All fifths/fourths pure; major thirds the wide, tense 81:64 ditone (407.82¢) — note E in the C column is the brightest in the table (331.12 Hz). Largely pre-Baroque for harmony, but its sharp leading tones suit melodic contexts. Layout matters: an Eb–G# chain puts the wolf at G#–Eb (used here); a Db–F# chain moves it to F#–Db.

**Just intonation in C major** (5-limit; Ptolemy's "intense diatonic," Zarlino). **Diatonic ratios C=1/1, D=9/8, E=5/4, F=4/3, G=3/2, A=5/3, B=15/8;** chromatics **C#=16/15, Eb=6/5, F#=45/32, Ab=8/5, Bb=9/5** (augmented 4th 45/32 rather than diminished 5th 64/45). Perfectly consonant triads on C, F and G — but only in C major: it does not transpose (D–A is a wolf 40:27 ≈ 680¢). A vocal/theoretical ideal, included to bracket the comparison with maximally pure intervals.

### The Bach caveat and enharmonic spelling

**We do not know which temperament Bach used for the *Well-Tempered Clavier* (1722), and "well-tempered" was a category, not a recipe.** The term *wohl temperirt* (coined by Werckmeister, 1681/1691) denotes any *circulating* temperament in which all 24 keys are usable while retaining distinct key-color — a class including Werckmeister III/IV/V, Kirnberger II/III, Vallotti, Young, Kellner, the Neidhardt temperaments, and others. It explicitly does *not* mean equal temperament, and it is not a single tuning. Bach left no verbal tuning instructions and nothing numeric on the title page.

The most famous modern claim is **Bradley Lehman's 2005 reconstruction** ("Bach's extraordinary temperament: our Rosetta Stone," *Early Music* 33, Feb. & May 2005), reading the **decorative looped squiggle atop the WTC title page, turned upside-down, as a chain-of-fifths tuning diagram** (five 1/6-comma fifths, three pure, etc.). It is ingenious, widely recorded, and **heavily contested.** John O'Donnell ("Bach's temperament, Occam's razor, and the Neidhardt factor," *Early Music* 34/4, Nov. 2006, pp. 625–633) reads the same squiggle in its original orientation as string-length order, reaching a different temperament and calling Lehman's tempering "totally hypothetical." The same issue carried Mark Lindley & Ibo Ortgies's "Bach-style keyboard tuning" (pp. 613–624) challenging the graphic readings altogether. Émile Amiot (2009) showed a scale-quality measure cannot distinguish Lehman's reading from its inversion or from rivals, and that the WTC's keys are ordered by *semitone*, not by *fifth* — undercutting a premise. Conclusion: the squiggle's meaning is unresolved; any single "Bach temperament" (Werckmeister III, Kellner, Lehman, O'Donnell, Neidhardt, Sorge…) is a hypothesis, not a fact.

**Enharmonic spelling matters — and only in the unequal systems.** In equal temperament C♯ = D♭ exactly. In **quarter-comma meantone, Silbermann and Pythagorean**, the chain of fifths produces genuinely different sharp and flat pitches: in meantone C♯ (≈273.4 Hz) sits ~41¢ (a diesis) below D♭ (≈280 Hz), so a 12-key keyboard must *choose* one spelling per black key (standard: Eb, Bb, C♯, F♯, G♯) — pressing G♯ when the music wants A♭ triggers the wolf. In **just intonation** the C-major spelling is fixed by the chosen ratios. The circulating well-temperaments and equal temperament are built so the black keys serve double duty, the residual gap hidden as a schisma (e.g. Kirnberger's F♯–C♯). The table's black-key rows therefore list the single pitch present on the keyboard for each system.

---

## Recommendations

**Use these columns directly** as tuner targets (set your tuner to the C-anchored cents-deviation table) or as additive-synthesis/sampler frequencies — every column already shares C4 = 261.63 Hz, so cross-temperament A/B comparison is exact at the tonic.

Staged choices by repertoire, with the thresholds that should change them:
1. **High/late-Baroque keyboard works that traverse many keys (Bach WTC, chromatic fantasias):** default to **Werckmeister III** or **Kirnberger III** — both circulate cleanly with warm near-keys. Switch to **Vallotti/Young** if you want milder, more uniform color across keys; switch toward **Kellner** if you specifically want a "Bach-flavored" near-Werckmeister with a slightly purer C-major triad. *Threshold:* if the piece never leaves ≈3 sharps/flats, you can move to a meantone for sweeter thirds.
2. **Pre-1690 / early-Baroque and Renaissance keyboard (Frescobaldi, Sweelinck, Byrd, much Buxtehude in flat/sharp-limited keys):** use **quarter-comma meantone** for pure singing thirds. *Threshold:* the moment the music demands both G♯ and A♭ (or E♯/F♭) or modulates past ≈3 accidentals, the wolf at G♯–E♭ becomes audible — step down to **Silbermann (1/6-comma)** or a circulating well temperament.
3. **Baroque ensemble / continuo where winds and strings adjust freely:** strongly consider **1/6-comma meantone (Silbermann)** rather than Vallotti/Young — Duffin's historical argument is that this was the everyday ensemble standard. *Threshold:* fixed-pitch instruments that must play all keys push you back to a circulating well temperament.
4. **Medieval/early-Renaissance monophony or organum, or to demonstrate the "harsh third":** use **Pythagorean** (Eb–G# layout). **Just intonation** should be used only for static C-major demonstration or fixed-drone music — never for anything that modulates, because of the 40:27 wolf at D–A.
5. **Modern repertoire, free modulation, or fixed-pitch ensembles (piano, fretted guitar, winds):** **equal temperament** — the only system here with no key color and no wolf.

**Benchmark to verify any implementation:** confirm C4 = 261.63 Hz in every column, and that the C-major third E reads 327.03 Hz in quarter-comma meantone / Kirnberger / just intonation, ~328.1 Hz in the well-temperaments, and 331.12 Hz in Pythagorean. If your E values don't match, your cents-above-C stacking is wrong.

## Caveats

- **A ≠ 440 Hz except in equal temperament.** This is the intended result of C-anchoring. If you instead need historically authentic *absolute* pitch, Baroque practice ranged widely (A ≈ 415 Hz "Baroque pitch," A ≈ 392 Hz French, A ≈ 460–465 Hz Saxon *Chorton* for some Silbermann organs); re-scale every frequency by the ratio of your chosen A to 440 if you want period pitch.
- **Where sources disagree, I made and flagged explicit choices:** Vallotti = modern 1/6-Pythagorean-comma (not the original 1/6-syntonic-comma-plus-schisma); Silbermann = 1/6 *Pythagorean* comma (Silbermann's own basis), though 1/6-syntonic-comma versions exist and differ by ~0.3¢/fifth; Werckmeister V = corrected D=175 monochord reading (not the printed 176); Pythagorean = Eb–G# chain with the wolf at G♯–E♭; just intonation chromatics = the common 5-limit set with augmented-4th 45/32. Werckmeister's monochord (rational string-length) values differ from the theoretical comma-fraction values by 1–2¢ in places.
- **Kellner's definition was the one genuinely conflicting point** and was resolved against Kellner's own 1977/1979 publications (5 fifths C–G, G–D, D–A, A–E, B–F♯ × 1/5 Pythagorean comma; 7 pure; none widened). Treat secondary web descriptions of Kellner's *fifths* with caution.
- **Rounding:** frequencies are to 2 decimals from cents carried to ~0.01¢; values may differ by ≤0.02 Hz from sources that round cents earlier or anchor on A then rescale.
- **The whole "Bach temperament" question is unsettled scholarship**, not settled fact. Werckmeister III is a reasonable, historically plausible default for the WTC, but it is a convention of modern performance practice, not Bach's documented choice.