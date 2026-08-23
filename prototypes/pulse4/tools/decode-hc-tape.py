import os, sys, json
from fractions import Fraction

NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]

def words(path):
    data = open(path,'rb').read()
    out, w, i, n = [], 0, 0, 0
    for c in data:
        if c & 0o200:
            w = ((w << 6) | (c & 0o77)) & 0o777777
            n += 1
            if n == 3:
                out.append(w); w = 0; n = 0
    return out

def parse_note(word):
    trip = (word & 0o100000) >> 15
    pitch = (word >> 7) & 0o77
    dur = word & 0o177
    art = ((word >> 14) & 0o14) | ((word & 0o60000) >> 13)
    nd = 192 // (dur * (2 if trip else 3)) if dur else 0
    if pitch > 1:
        np_ = pitch - 2
        return dict(kind="note", art=art, trip=trip, midi=np_ + 24,  # C1 -> midi 24
                    name=NAMES[np_ % 12], octave=np_ // 12 + 1, den=nd)
    return dict(kind="rest", art=art, trip=trip, midi=None, name="r", octave=0, den=nd)

W = words(sys.argv[1] if len(sys.argv) > 1 else "pdp-1-boc/output/boc-olson.bin")
p = 0
voices = []
while p < len(W) and len(voices) < 4:
    ncount = W[p]; p += 1
    notes = W[p:p + ncount + 1]           # note words incl. checksum slot layout of C code
    p += ncount + 1                        # ncount words + checksum
    bcount = W[p]; p += 1
    bars_raw = W[p:p + bcount]; p += bcount
    p += 1                                 # checksum
    tempo_raw = None
    for w in notes:
        if (w & 0o700000) == 0o700000:
            tempo_raw = w & 0o77777
    bars = []
    for idx in bars_raw:
        if idx == 0o600000: continue
        seq, j = [], idx
        while j < len(notes) and notes[j] != 0o600000:
            seq.append(parse_note(notes[j])); j += 1
        bars.append(seq)
    voices.append(dict(tempo_raw=tempo_raw, bars=bars, nwords=ncount))

for vi, v in enumerate(voices):
    print(f"--- VOICE {vi+1}  bars={len(v['bars'])} tempo_raw={v['tempo_raw']}")
    for bi, bar in enumerate(v['bars'], 1):
        tot = sum(Fraction(1, n['den']) for n in bar)
        s = " ".join(("r" if n['kind'] == "rest" else n['name'] + str(n['octave'])) + f"t{n['den']}" for n in bar)
        flag = "" if tot == 1 else f"  <<< SUM={tot}"
        print(f"  {bi:2d}: {s}{flag}")

out = os.path.join(os.path.dirname(__file__), "..", "songs", "olson-tape-decoded.json")
json.dump(voices, open(out, "w"))
print("\nwrote", out)
