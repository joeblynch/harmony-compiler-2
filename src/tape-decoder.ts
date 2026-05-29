
// On 2024-01-05 Peter Samson mentioned the CHM PDP-1 CPU runs 6% slower than spec
const CHM_PDP1_CPU_SPEED_MULTIPLIER = 0.94;

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const REST_NAME = "r";
const ARTICULATION_NAMES = ["normal", "quarter", "half", "staccato", "legato"];

interface Note {
    articulation: number;
    triplet: number;
    pitch: number;
    duration: number;
    noteDuration: number;
    notePitch: number;
    octave: number;
    semiTone: number;
    noteName: string;
}

interface RpbResult {
    word: number;
    gapFrames: number;
    innerFrames: number;
}

class TapeReader {
    private data: Uint8Array;
    private position: number;
    private output: string[];

    constructor(data: Uint8Array) {
        this.data = data;
        this.position = 0;
        this.output = [];
    }

    private log(message: string): void {
        this.output.push(message);
    }

    private error(message: string): never {
        throw new Error(message);
    }

    private getNextByte(): number | null {
        if (this.position >= this.data.length) {
            return null;
        }
        return this.data[this.position++];
    }

    private rpb(): RpbResult {
        let word = 0;
        let gapFrames = 0;
        let innerFrames = 0;

        for (let i = 0; i < 3;) {
            const c = this.getNextByte();
            
            if (c === null) {
                return { word: -1, gapFrames, innerFrames };
            }

            if (c & 0o200) {
                // rpb skips lines without the 8th bit set, ignores 7th bit
                word = (word << 6) | (c & 0o077);
                i++;
            } else {
                if (i) {
                    innerFrames++;
                } else {
                    gapFrames++;
                }
            }
        }

        return { word, gapFrames, innerFrames };
    }

    private readNextWord(wordCount: number, peek: boolean = false): { word: number; gapFrames: number; wordCount: number } | null {
        const result = this.rpb();

        if (result.innerFrames) {
            this.error(
                `ERROR: ${result.innerFrames} inner blank frame${result.innerFrames === 1 ? '' : 's'} found in word ${wordCount.toString(8).padStart(6, '0')}`
            );
        }

        if (result.gapFrames) {
            this.log(`[${result.gapFrames} blank frame${result.gapFrames === 1 ? '' : 's'}]`);
        }

        if (result.word === -1) {
            return null;
        }

        if (!peek) {
            this.log(`${wordCount.toString(8).padStart(6, '0')}: ${result.word.toString(8).padStart(6, '0')}`);
        }

        return {
            word: result.word,
            gapFrames: result.gapFrames,
            wordCount: wordCount + 1
        };
    }

    private parseNote(word: number): Note {
        const articulation = ((word >> 14) & 0o014) | ((word & 0o060000) >> 13);
        const triplet = (word & 0o100000) >> 15;
        const pitch = (word >> 7) & 0o077;
        const duration = word & 0o177;

        const noteDuration = Math.floor(192 / (duration * (triplet ? 2 : 3)));

        let notePitch: number;
        let octave: number;
        let semiTone: number;
        let noteName: string;

        if (pitch > 1) {
            notePitch = pitch - 2;
            octave = Math.floor(notePitch / 12) + 1;
            semiTone = notePitch % 12;
            noteName = NOTE_NAMES[semiTone];
        } else {
            notePitch = 0;
            octave = 0;
            semiTone = 0;
            noteName = REST_NAME;
        }

        return {
            articulation,
            triplet,
            pitch,
            duration,
            noteDuration,
            notePitch,
            octave,
            semiTone,
            noteName
        };
    }

    private decodeTempoQuarter(tempo: number): number {
        return Math.floor(11436 / (tempo & 0o077777));
    }

    private add1sComplement(a: number, b: number): number {
        const sum = a + b;
        return ((sum & 0o777777) + (sum >> 18)) & 0o777777;
    }

    private verifyChecksum(expected: number, calculated: number): void {
        if (expected === calculated) {
            this.log("\tgood checksum");
        } else {
            this.error(`\tchecksum mismatch: expected: ${expected.toString(8).padStart(6, '0')}, calculated: ${calculated.toString(8).padStart(6, '0')}`);
        }
    }

    private articulationName(articulation: number): string {
        let articulationIndex: number;
        
        switch (articulation) {
            case 0:
            case 1:
            case 2:
                articulationIndex = articulation;
                break;
            case 4:
                articulationIndex = 3;
                break;
            case 8:
                articulationIndex = 4;
                break;
            default:
                this.error(`ERROR: invalid articulation: ${articulation}`);
        }
        
        return ARTICULATION_NAMES[articulationIndex];
    }

    private readNotes(wordCount: number): { wordCount: number; notes: number[]; notesCount: number } | null {
        let checksum = 0;
        let partWordCount = 0;
        let totalWordCount = 0;
        const notes: number[] = [];

        this.log("NOTES:");

        while (true) {
            const result = this.readNextWord(wordCount, false);
            
            if (!result) {
                return null;
            }

            wordCount = result.wordCount;
            const word = result.word;
            partWordCount++;

            if (partWordCount > 1 && partWordCount < totalWordCount + 2) {
                checksum = this.add1sComplement(checksum, word);
                notes[partWordCount - 2] = word;
            }

            if (partWordCount === 1) {
                totalWordCount = word;
                this.log(`\tnotes word count: ${totalWordCount}`);
            } else if (partWordCount === totalWordCount + 2) {
                this.verifyChecksum(word, checksum);
                return {
                    wordCount,
                    notes,
                    notesCount: totalWordCount - 1
                };
            } else if (word === 0o600000) {
                this.log("\t/");
            } else if ((word & 0o700000) === 0o700000) {
                const tempo = this.decodeTempoQuarter(word);
                this.log(
                    `\ttempo: ${tempo} BPM [${Math.floor(tempo * CHM_PDP1_CPU_SPEED_MULTIPLIER)} BPM for CHM PDP-1] (assuming 4/4 time) [raw: ${word & 0o077777}]`
                );
            } else {
                const note = this.parseNote(word);

                let line = "";
                if (note.pitch > 1) {
                    line += `\tarticulation: ${note.articulation.toString(8).padStart(2, '0')} [${this.articulationName(note.articulation)}], `;
                    line += `triplet: ${note.triplet.toString(8)} [${note.triplet ? 'Y' : 'N'}], `;
                } else {
                    line += "\t";
                }

                line += `pitch: ${note.pitch.toString(8).padStart(2, '0')} [${note.noteName}${note.octave}], `;
                line += `duration: ${note.duration.toString(8).padStart(3, '0')} [1/${note.noteDuration}]`;

                this.log(line);
            }
        }
    }

    private readBars(wordCount: number, notes: number[], notesCount: number): number | null {
        let checksum = 0;
        let partWordCount = 0;
        let totalWordCount = 0;

        this.log("\nBARS:");

        while (true) {
            const result = this.readNextWord(wordCount, false);
            
            if (!result) {
                return null;
            }

            wordCount = result.wordCount;
            const word = result.word;
            const gapFrames = result.gapFrames;
            partWordCount++;

            if (partWordCount > 1 && partWordCount < totalWordCount + 2) {
                checksum = this.add1sComplement(checksum, word);
            }

            if (partWordCount === 1) {
                if (!gapFrames) {
                    this.error("ERROR: bars part must have blank frames between preceeding notes part");
                }

                totalWordCount = word;
                this.log(`\tbars word count: ${totalWordCount}`);
            } else if (partWordCount === totalWordCount + 2) {
                this.verifyChecksum(word, checksum);
                return wordCount;
            } else if (word === 0o600000) {
                this.log("\t/");
                if (partWordCount !== totalWordCount + 1) {
                    this.error("ERROR: found end of bars word (600000) before end of bars word count");
                }
            } else {
                if (word >= notesCount) {
                    this.error(`ERROR: note index ${word} out of range`);
                }

                let line = `\t${partWordCount - 1}`;

                let noteIndex = word;
                let noteCount = 0;
                
                while (notes[noteIndex] !== 0o600000 && (word + noteCount) < notesCount) {
                    const note = this.parseNote(notes[noteIndex]);
                    line += ` ${note.noteName}t${note.noteDuration}`;
                    noteIndex++;
                    noteCount++;
                }

                line += "/";
                this.log(line);
            }
        }
    }

    public decode(): number {
        let wordCount = 0;
        let voiceCount = 0;

        // A voice is only counted once BOTH its notes and bars sections decode in full.
        // The tape format has no end-of-voices marker (see pdp1m13.mac); reading simply
        // terminates on a clean EOF or an incomplete trailing section.
        while (voiceCount < 4) {
            if (voiceCount > 0) this.log("\n");
            this.log("╔═════════════╗");
            this.log(`║   VOICE ${voiceCount + 1}   ║`);
            this.log("╚═════════════╝");

            const notesResult = this.readNotes(wordCount);

            if (!notesResult) {
                break;  // clean EOF — no further voice
            }

            wordCount = notesResult.wordCount;

            const barsResult = this.readBars(wordCount, notesResult.notes, notesResult.notesCount);

            if (barsResult === null) {
                break;  // incomplete voice — do not count it
            }

            wordCount = barsResult;
            voiceCount++;
        }

        if (voiceCount === 0) {
            this.error("no voices found");
        }

        this.log(`\nDATA LENGTH: ${Math.ceil((wordCount * 18.0) / 8.0)}B`);

        return voiceCount;
    }
}

/**
 * Decode a Harmony Compiler intermediate binary paper tape image
 * @param data - The tape image data as a Uint8Array
 * @returns number of voices
 */
export function decodeHCInt(data: Uint8Array): number {
    const reader = new TapeReader(data);
    return reader.decode();
}