import os, json
from fractions import Fraction
HERE = os.path.dirname(os.path.abspath(__file__))

RES = 16                 # rows per beat
BEATS = 4                # 4/4
ROWS = RES * BEATS       # 64 rows per bar

voices = json.load(open(os.path.join(HERE, "..", "songs", "olson-tape-decoded.json")))
NAMES = ["MEL", "ALT", "TEN", "BAS"]
LONG  = ["melody (treble)", "alto drone", "tenor drone", "bass drone"]

def bar_to_pattern(bar):
    """One HC measure -> one tracker pattern (list of {n,v})."""
    # 1. expand to (start_tick, len_ticks, midi|None)
    ev, t = [], Fraction(0)
    for n in bar:
        d = Fraction(1, n["den"]) * ROWS          # duration in rows
        ev.append((t, d, n["midi"]))
        t += d
    assert t == ROWS, f"bar length {t} != {ROWS}"
    # 2. merge consecutive same-pitch entries (HC ties + legato) and consecutive rests
    merged = []
    for start, d, midi in ev:
        if merged and merged[-1][2] == midi:
            merged[-1][1] += d
        else:
            merged.append([start, d, midi])
    # 3. lay out
    pat = [{"n": None, "v": None} for _ in range(ROWS)]
    for start, d, midi in merged:
        r = start
        assert r.denominator == 1, f"non-integer row {r}"
        pat[int(r)]["n"] = "off" if midi is None else midi
    return pat

song_voices = []
for vi, v in enumerate(voices):
    pats, order, key_to_id = {}, [], {}
    for bar in v["bars"]:
        pat = bar_to_pattern(bar)
        key = json.dumps(pat)
        if key not in key_to_id:
            key_to_id[key] = len(key_to_id)
            pats[str(key_to_id[key])] = pat
        order.append(key_to_id[key])
    song_voices.append({"name": NAMES[vi], "duty": 2, "order": order, "patterns": pats})
    uniq = len(pats)
    print(f"{NAMES[vi]:4s} {LONG[vi]:16s} bars={len(order):3d}  unique patterns={uniq}")
    print(f"      order: {order}")

song = {
    "app": "pulse4",
    "title": "OLSON / PDP-1",
    "bpm": 108,
    "res": RES,
    "voices": song_voices,
}
json.dump(song, open(os.path.join(HERE, "..", "songs", "olson.json"), "w"))
print("\nwrote olson.json", len(json.dumps(song)), "bytes")

# quick human-readable dump of melody pattern 5 (the grace-note bar) to eyeball
def nm(x):
    if x is None: return "..."
    if x == "off": return "OFF"
    N = ["C-","C#","D-","D#","E-","F-","F#","G-","G#","A-","A#","B-"]
    return N[x % 12] + str(x // 12 - 1)
print("\nMEL pattern 5 (bar 12) non-empty rows:")
for r, c in enumerate(song_voices[0]["patterns"]["5"]):
    if c["n"] is not None:
        print(f"   row {r:2d}: {nm(c['n'])}")
print("\nMEL pattern 2 (bar 9) non-empty rows:")
for r, c in enumerate(song_voices[0]["patterns"]["2"]):
    if c["n"] is not None:
        print(f"   row {r:2d}: {nm(c['n'])}")
