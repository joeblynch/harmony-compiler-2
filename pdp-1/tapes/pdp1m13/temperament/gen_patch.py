#!/usr/bin/env python3
"""Generate a PDP-1 paper-tape image that retunes the *Music 13* player to a
historical temperament.

The player reads its pitches from a 64-word frequency table ``pt`` at octal
02137..02236 in bank 0 (index 0 = rest; indices 1..63 = B0..C#6). Each word is
an 18-bit phase increment; pitch is proportional to the increment. This tool
emits a tape that, when loaded by the emulator's RIM reader (``PDP1.readIn``),
overwrites ``pt`` in memory with a temperament-specific table -- no reassembly.

How the tape works (mirrors the loader-then-body shape of pdp1m13.rim):

  1. A RIM section (``dio ADDR ; DATA`` pairs + a terminating ``jmp``) loads a
     tiny 8-word bootstrap into a safe bank-0 scratch region and starts it.
  2. The bootstrap ``rpb``-reads the 64 raw frequency words that follow on the
     tape and stores them into ``pt`` (02137..02236), then halts.

Pitch is **C4-anchored**: the original middle-C increment (12002) is preserved
across every temperament, so A != 440 Hz in non-equal tunings -- matching the
C-anchored tables in research.md.

Run ``gen_patch.py --verify`` to self-check all presets (decode round-trip, an
equal-temperament regression against the shipped ROM table, a 17-bit range
guard, and a full ones-complement CPU simulation of the generated tape).
"""

import argparse
import sys

# --------------------------------------------------------------------------
# PDP-1 word / addressing constants
# --------------------------------------------------------------------------
WORD_MASK = 0o777777          # 18-bit word
NEG_ZERO = 0o777777           # ones-complement -0
SIGN_BIT = 0o400000           # bit 0 (the sign bit)
ADDR_MASK = 0o7777            # 12-bit in-bank address field
IND = 0o10000                 # the indirect bit within an instruction word

# Frequency table in the resident player image.
PT_BASE = 0o2137              # address of pt[0] (the rest entry)
PT_LEN = 64                   # pt[0..63] = rest, B0 .. C#6
C4_INC = 12002                # shipped middle-C (C4) increment -> the pitch anchor
C4_HZ = 261.6256              # middle C in Hz (A4=440 equal-tempered); display only

# The worklet always slows playback by this factor to model the real Computer
# History Museum PDP-1's CPU (lowers pitch ~7%). MUST match CHM_CPU_FACTOR in
# src/audio-worklet/pdp1-audio.ts -- the `--cpuFactor chm` compensation only
# lands on true concert pitch if the two values agree.
CHM_CPU_FACTOR = 0.92559

# Tape defaults (from public/tapes/BWV592-3.bin; the other .bin tapes agree).
DEFAULT_BOOT = 0o2304         # `not` scratch buffer -- safe, see validate_boot_addr()
DEFAULT_LEADER = 256          # blank 0x00 bytes before the data
DEFAULT_TRAILER = 192         # blank 0x00 bytes after the data

# Instruction opcode words (upper bits; OR in the 12-bit address). Verified
# against src/pdp1/cpu.ts and the pdp1m13.lst assembled words.
OP_DIO = 0o320000             # dio Y  (dio i Y = OP_DIO | IND | Y = 0o330000|Y)
OP_IDX = 0o440000             # idx Y
OP_ISP = 0o460000             # isp Y  (Y++, skip next if result >= 0)
OP_JMP = 0o600000             # jmp Y
RPB = 0o730002                # read paper-tape binary (one 18-bit word -> IO)
HLT = 0o760400                # halt

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# --------------------------------------------------------------------------
# Temperaments: cents deviation from equal temperament for the 12 chromatic
# degrees C,C#,D,D#,E,F,F#,G,G#,A,A#,B. Transcribed from the "Cents deviation
# from equal temperament" table in pdp1m13/temperament/research.md (the source
# of truth). In meantone/silbermann/pythagorean/just each black key is a single
# fixed physical key (Eb/G# layout; just is spelled for C major) -- the table
# already encodes the keyboard's actual 12 pitch classes, so reading a column
# directly is correct.
# --------------------------------------------------------------------------
TEMPERAMENTS = {
    "equal": (
        "Equal temperament",
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ),
    "werckmeister3": (
        "Werckmeister III (1691, Correct Temp. No. 1)",
        [0, -9.78, -7.82, -5.87, -9.78, -1.96, -11.73, -3.91, -7.82, -11.73, -3.91, -7.82],
    ),
    "werckmeister4": (
        "Werckmeister IV (1691, No. 2)",
        [0, -17.60, -3.91, -5.87, -7.82, -1.96, -11.73, -5.87, -15.64, -9.78, 3.91, -13.69],
    ),
    "werckmeister5": (
        "Werckmeister V (1691, No. 3, D=175)",
        [0, -3.91, 3.91, 0, -3.91, 3.91, 0, 1.96, -7.82, 0, 1.96, -1.96],
    ),
    "kirnberger2": (
        "Kirnberger II (1771)",
        [0, -9.78, 3.91, -5.87, -13.69, -1.96, -9.78, 1.96, -7.82, -4.89, -3.91, -11.73],
    ),
    "kirnberger3": (
        "Kirnberger III (1779)",
        [0, -9.78, -6.84, -5.87, -13.69, -1.96, -9.78, -3.42, -7.82, -10.27, -3.91, -11.73],
    ),
    "vallotti": (
        "Vallotti (1/6 Pythagorean comma)",
        [0, -5.87, -3.91, -1.96, -7.82, 1.96, -7.82, -1.96, -3.91, -5.87, 0, -9.78],
    ),
    "young2": (
        "Young's Second Temperament (1800)",
        [0, -9.78, -3.91, -5.87, -7.82, -1.96, -11.73, -1.96, -7.82, -5.87, -3.91, -9.78],
    ),
    "kellner": (
        "Kellner's 'Bach' temperament (1977)",
        [0, -9.78, -5.47, -5.87, -10.95, -1.96, -11.73, -2.74, -7.82, -8.21, -3.91, -8.99],
    ),
    "meantone": (
        "Quarter-comma meantone (Eb-G# layout)",
        [0, -23.95, -6.84, 10.27, -13.69, 3.42, -20.53, -3.42, -27.37, -10.27, 6.84, -17.11],
    ),
    "silbermann": (
        "Silbermann (1/6 Pythagorean comma meantone)",
        [0, -13.69, -3.91, 5.87, -7.82, 1.96, -11.73, -1.96, -15.64, -5.87, 3.91, -9.78],
    ),
    "pythagorean": (
        "Pythagorean (Eb-G# chain)",
        [0, 13.69, 3.91, -5.87, 7.82, -1.96, 11.73, 1.96, 15.64, 5.87, -3.91, 9.78],
    ),
    "just": (
        "Just intonation (C major)",
        [0, 11.73, 3.91, 15.64, -13.69, -1.96, -9.78, 1.96, 13.69, -15.64, 17.60, -11.73],
    ),
}

# Shipped equal-tempered pt table (octal) from pdp1m13/pdp1m13.lst, 02137..02236,
# used as the regression reference for the `equal` preset.
SHIPPED_PT = [
    0o000000,
    0o002610,
    0o002734, 0o003065, 0o003224,
    0o003370, 0o003542, 0o003723, 0o004112,
    0o004310, 0o004516, 0o004733, 0o005161,
    0o005420, 0o005671, 0o006153, 0o006450,
    0o006760, 0o007304, 0o007645, 0o010223,
    0o010620, 0o011233, 0o011666, 0o012342,
    0o013040, 0o013561, 0o014326, 0o015120,
    0o015740, 0o016611, 0o017512, 0o020447,
    0o021437, 0o022466, 0o023554, 0o024705,
    0o026100, 0o027342, 0o030654, 0o032240,
    0o033701, 0o035422, 0o037225, 0o041115,
    0o043077, 0o045154, 0o047331, 0o051611,
    0o054201, 0o056704, 0o061530, 0o064500,
    0o067602, 0o073043, 0o076452, 0o102233,
    0o106176, 0o112330, 0o116662, 0o123423,
    0o130402, 0o135610,
    0o143257,
]


# --------------------------------------------------------------------------
# Pitch / increment math
# --------------------------------------------------------------------------
def note_for_index(idx):
    """Map a pt index to (semitone, octave), or None for the rest (index 0).

    idx 1 = B0; idx 2 = C1; thereafter chromatic per octave (C..B). So
    C1=2, C4=38, A4=47, C6=62, C#6=63.
    """
    if idx == 0:
        return None
    if idx == 1:
        return (11, 0)  # B0
    s = (idx - 2) % 12
    o = 1 + (idx - 2) // 12
    return (s, o)


def increment(semitone, octave, dev_cents, scale=1.0):
    """C-anchored phase increment for one pitch.

    increment = round( 12002 * scale * 2 ** ( (100*s + dev) / 1200 + (octave - 4) ) )

    At scale=1 this is C4-anchored so C4 (s=0, dev=0, octave=4) == 12002,
    identical to the shipped ROM table. `scale` = (pitchA/440) / cpuFactor
    retunes the reference pitch and/or pre-corrects for a slow CPU.
    """
    cents_above_c = 100 * semitone + dev_cents
    return round(C4_INC * scale * 2 ** (cents_above_c / 1200 + (octave - 4)))


def build_table(dev, scale=1.0):
    """Build the 64-word pt table for a temperament's cents-deviation vector."""
    table = []
    for idx in range(PT_LEN):
        note = note_for_index(idx)
        if note is None:
            table.append(0)  # rest -- phase never advances, voice silent
            continue
        s, o = note
        w = increment(s, o, dev[s], scale)
        if not (0 <= w < (1 << 17)):
            raise ValueError(
                "increment for index %d (semitone %d, octave %d) = %d is not a "
                "valid 17-bit positive word" % (idx, s, o, w)
            )
        table.append(w)
    return table


def freq_hz(inc):
    """Pitch as heard on the CHM-speed player (display only). The worklet always
    applies CHM_CPU_FACTOR, so this is the actual sounding frequency."""
    return inc / C4_INC * C4_HZ * CHM_CPU_FACTOR


def note_label(idx):
    note = note_for_index(idx)
    if note is None:
        return "rest"
    s, o = note
    return "%s%d" % (NOTE_NAMES[s], o)


# --------------------------------------------------------------------------
# Bootstrap machine code (constructed directly, no assembly pass)
# --------------------------------------------------------------------------
def opword(op_base, addr, indirect=False):
    """Assemble one instruction word: opcode | optional indirect | 12-bit addr."""
    return op_base | (IND if indirect else 0) | (addr & ADDR_MASK)


def build_bootstrap(base):
    """The 8-word in-RAM bootstrap loaded at `base`.

    Reads exactly 64 words from tape into pt and halts. The exact-64 count
    relies on the CPU normalizing -0 -> +0 in idx/isp (cpu.ts): cnt steps
    -64 -> ... -> -1 -> (-0 normalized to) 0, at which point `isp` skips the
    `jmp` and falls into `hlt`. Do NOT "optimize" the counter.

    Returns a list of (addr, word, mnemonic).
    """
    return [
        (base + 0, PT_BASE,                     "ptr,  %05o      / write pointer = pt" % PT_BASE),
        (base + 1, (~PT_LEN) & WORD_MASK,        "cnt,  %05o      / -%d (ones-complement)" % ((~PT_LEN) & WORD_MASK, PT_LEN)),
        (base + 2, RPB,                          "loop, rpb       / read one word -> IO"),
        (base + 3, opword(OP_DIO, base + 0, True), "      dio i ptr / store IO at C(ptr)"),
        (base + 4, opword(OP_IDX, base + 0),     "      idx ptr   / ptr++"),
        (base + 5, opword(OP_ISP, base + 1),     "      isp cnt   / cnt++, skip when >= 0"),
        (base + 6, opword(OP_JMP, base + 2),     "      jmp loop"),
        (base + 7, HLT,                          "      hlt       / done -> return to loader"),
    ]


def assemble_rim(bootstrap, base):
    """The RIM section: direct (dio ADDR ; DATA) pairs that load the bootstrap,
    then a `jmp` to the loop top (base+2) that starts it.

    The RIM dio words are DIRECT (no indirect bit): PDP1.readIn stores IO
    straight to the address field. (The in-RAM `dio i ptr` is indirect.)
    """
    words = []
    for addr, word, _ in bootstrap:
        words.append(opword(OP_DIO, addr))  # direct dio ADDR
        words.append(word)                  # the data to deposit there
    words.append(opword(OP_JMP, base + 2))  # jmp loop -> begin execution
    return words


# --------------------------------------------------------------------------
# Tape encoding
# --------------------------------------------------------------------------
def word_to_bytes(w):
    """Encode an 18-bit word as 3 tape bytes, most-significant 6 bits first.
    Each byte sets bit 0o200 (so rpb counts it) and carries 6 data bits."""
    w &= WORD_MASK
    return bytes((
        0o200 | ((w >> 12) & 0o77),
        0o200 | ((w >> 6) & 0o77),
        0o200 | (w & 0o77),
    ))


def build_tape(table, base, leader, trailer):
    """Assemble the full tape image: leader, RIM bootstrap loader, raw frequency
    words (read by the bootstrap), trailer."""
    bootstrap = build_bootstrap(base)
    rim = assemble_rim(bootstrap, base)

    out = bytearray()
    out.extend(b"\x00" * leader)
    for w in rim:
        out.extend(word_to_bytes(w))
    for w in table:
        out.extend(word_to_bytes(w))
    out.extend(b"\x00" * trailer)
    return bytes(out)


# --------------------------------------------------------------------------
# Listing (--lst)
# --------------------------------------------------------------------------
def format_listing(key, base, table, pitch_a, cpu_label, scale):
    display, dev = TEMPERAMENTS[key]
    bootstrap = build_bootstrap(base)
    lines = []
    lines.append("/ %s (%s)" % (key, display))
    lines.append("/ bootstrap @ %05o, patches pt @ %05o..%05o"
                 % (base, PT_BASE, PT_BASE + PT_LEN - 1))
    lines.append("/ pitchA=%g  cpuFactor=%s  scale=%.5f  ->  C4 increment=%d"
                 % (pitch_a, cpu_label, scale, table[38]))
    lines.append("")
    lines.append("/ --- RIM bootstrap (loaded into bank 0, started by the RIM jmp) ---")
    for addr, word, mnem in bootstrap:
        lines.append("  %05o  %06o  %s" % (addr, word, mnem))
    lines.append("")
    lines.append("/ --- frequency table written to pt (Hz = as heard on the CHM-speed player) ---")
    lines.append("/ idx  addr  note   Hz       incr")
    for idx, w in enumerate(table):
        hz = freq_hz(w)
        lines.append("  %2d  %05o  %-4s  %8.2f  %06o"
                     % (idx, PT_BASE + idx, note_label(idx), hz, w))
    return "\n".join(lines)


# --------------------------------------------------------------------------
# Verification
# --------------------------------------------------------------------------
def decode_words(tape):
    """Re-decode every counted word from a tape image (the rpb byte rule),
    skipping blank (bit-0o200-clear) bytes. Returns the list of 18-bit words."""
    words = []
    word = 0
    got = 0
    for b in tape:
        if b & 0o200:
            word = ((word << 6) | (b & 0o77)) & WORD_MASK
            got += 1
            if got == 3:
                words.append(word)
                word = 0
                got = 0
    return words


class _Tape:
    """Minimal tape reader matching src/pdp1/tape-reader.ts rpb()."""
    def __init__(self, data):
        self.data = data
        self.pos = 0

    def rpb(self):
        word = 0
        got = 0
        while got < 3:
            if self.pos >= len(self.data):
                raise EOFError("read past end of tape")
            b = self.data[self.pos]
            self.pos += 1
            if b & 0o200:
                word = (word << 6) | (b & 0o77)
                got += 1
        return word & WORD_MASK


def simulate(tape):
    """A tiny ones-complement CPU subset (rpb/readIn/dio/idx/isp/jmp/hlt) that
    runs the generated tape exactly as src/pdp1/{pdp1,cpu}.ts would, and returns
    the resulting bank-0 memory. Proves the whole pipeline end-to-end."""
    mem = {}
    t = _Tape(tape)

    # PDP1.readIn: dio/data pairs load memory; jmp starts execution.
    while True:
        instr = t.rpb()
        op = (instr >> 12) & 0o76
        if op == 0o32:                  # dio (direct in the RIM section)
            mem[instr & ADDR_MASK] = t.rpb()
        elif op == 0o60:                # jmp -> start()
            _run(mem, t, instr & ADDR_MASK)
            return mem
        else:
            raise ValueError("invalid RIM instruction %06o" % instr)


def _run(mem, t, pc):
    io = 0
    guard = 0
    while True:
        guard += 1
        if guard > 100000:
            raise RuntimeError("bootstrap did not halt")
        instr = mem.get(pc, 0)
        pc = (pc + 1) & ADDR_MASK
        op = (instr >> 12) & 0o76
        ind = (instr >> 12) & 1
        y = instr & ADDR_MASK
        if instr == RPB:
            io = t.rpb()
        elif op == 0o32:               # dio (i)
            ma = (mem.get(y, 0) & 0o177777) if ind else y
            mem[ma] = io
        elif op == 0o44:               # idx
            v = (mem.get(y, 0) + 1) & WORD_MASK
            if v == NEG_ZERO:
                v = 0
            mem[y] = v
        elif op == 0o46:               # isp
            v = (mem.get(y, 0) + 1) & WORD_MASK
            if v == NEG_ZERO:
                v = 0
            mem[y] = v
            if (v & SIGN_BIT) == 0:
                pc = (pc + 1) & ADDR_MASK
        elif op == 0o60:               # jmp
            pc = ((mem.get(y, 0) & ADDR_MASK) if ind else y)
        elif op == 0o76 and (y & 0o400):  # hlt
            return
        else:
            raise ValueError("unhandled instruction %06o at %05o" % (instr, (pc - 1) & ADDR_MASK))


def verify(base, leader, trailer):
    """Run all self-checks across every temperament. Returns True on success."""
    ok = True

    # 1. Equal-temperament regression against the shipped ROM table (scale=1).
    eq = build_table(TEMPERAMENTS["equal"][1], 1.0)
    diffs = [abs(a - b) for a, b in zip(eq, SHIPPED_PT)]
    maxdiff = max(diffs)
    worst = diffs.index(maxdiff)
    print("equal vs shipped ROM table (440 / cpu 1): max |diff| = %d (index %d, %s)"
          % (maxdiff, worst, note_label(worst)))
    if maxdiff > 1:
        print("  FAIL: equal preset deviates from ROM by more than 1", file=sys.stderr)
        ok = False

    # 2/3/4. For each shipped variant and temperament: range guard (build_table
    # raises on >17-bit), decode round-trip, and full CPU simulation.
    variants = [
        ("440",     440.0, 1.0),
        ("415",     415.0, 1.0),
        ("440-chm", 440.0, CHM_CPU_FACTOR),
        ("415-chm", 415.0, CHM_CPU_FACTOR),
    ]
    rim = assemble_rim(build_bootstrap(base), base)
    overall_max = 0
    for vlabel, pitch_a, factor in variants:
        scale = (pitch_a / 440.0) / factor
        for key, (display, dev) in TEMPERAMENTS.items():
            table = build_table(dev, scale)        # range guard
            overall_max = max(overall_max, max(table))

            tape = build_tape(table, base, leader, trailer)
            words = decode_words(tape)
            if words[:len(rim)] != rim or words[len(rim):] != table:
                print("  FAIL %s-%s: tape did not round-trip" % (key, vlabel), file=sys.stderr)
                ok = False

            patched = [simulate(tape).get(PT_BASE + i, None) for i in range(PT_LEN)]
            if patched != table:
                print("  FAIL %s-%s: CPU simulation mismatch" % (key, vlabel), file=sys.stderr)
                ok = False

    print("all %d temperaments x %d variants: range guard, round-trip, CPU sim passed"
          % (len(TEMPERAMENTS), len(variants)))
    print("max increment across all variants = %d (0o%o), 2^17 = %d"
          % (overall_max, overall_max, 1 << 17))
    print("OK" if ok else "FAILED")
    return ok


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------
def parse_cpu_factor(val):
    """--cpuFactor: a positive float, or 'chm'/'CHM' -> the CHM CPU factor.
    Returns (factor, label) where label feeds the auto-generated filename."""
    if val.lower() == "chm":
        return CHM_CPU_FACTOR, "chm"
    f = float(val)
    if f <= 0:
        raise argparse.ArgumentTypeError("cpuFactor must be positive")
    return f, "%g" % f


def validate_boot_addr(base):
    """Reject boot addresses that would clobber the resident player or escape
    bank 0. The bootstrap occupies [base, base+8)."""
    if base < 0 or base + 8 > 0o10000:
        raise argparse.ArgumentTypeError(
            "boot address 0o%o + 8 words must fit in bank 0 (0..0o7777)" % base)
    boot = set(range(base, base + 8))
    pt = set(range(PT_BASE, PT_BASE + PT_LEN))
    if boot & pt:
        raise argparse.ArgumentTypeError(
            "boot region 0o%o..0o%o overlaps the frequency table 0o%o..0o%o"
            % (base, base + 7, PT_BASE, PT_BASE + PT_LEN - 1))
    if base < 0o2304:
        raise argparse.ArgumentTypeError(
            "boot address 0o%o may overlap the resident program/literal pool; "
            "use >= 0o2304 (the `not` scratch buffer)" % base)
    return base


def main(argv=None):
    p = argparse.ArgumentParser(
        description="Generate a PDP-1 tape that patches the Music 13 frequency "
                    "table with a musical temperament.")
    p.add_argument("temperament", nargs="?", choices=sorted(TEMPERAMENTS),
                   help="temperament preset to generate")
    p.add_argument("-o", "--out", metavar="PATH",
                   help="output tape path (default: <temperament>-<pitchA>[-chm].bin)")
    p.add_argument("--pitchA", type=float, default=440.0, metavar="HZ",
                   help="reference pitch for A4 in Hz (default 440)")
    p.add_argument("--cpuFactor", type=parse_cpu_factor, default=(1.0, "1"),
                   metavar="F",
                   help="CPU speed to compensate for: a multiplier or chm|CHM "
                        "(default 1; 'chm' pre-corrects for the slow CHM PDP-1)")
    p.add_argument("--leader", type=int, default=DEFAULT_LEADER,
                   help="blank leader bytes (default %d)" % DEFAULT_LEADER)
    p.add_argument("--trailer", type=int, default=DEFAULT_TRAILER,
                   help="blank trailer bytes (default %d)" % DEFAULT_TRAILER)
    p.add_argument("--boot-addr", type=lambda x: validate_boot_addr(int(x, 0)),
                   default=DEFAULT_BOOT,
                   help="bank-0 address for the bootstrap (default 0o%o)" % DEFAULT_BOOT)
    p.add_argument("--lst", action="store_true",
                   help="print the bootstrap listing and the frequency table")
    p.add_argument("--list", action="store_true",
                   help="list available temperaments and exit")
    p.add_argument("--verify", action="store_true",
                   help="run self-tests across all temperaments and exit")
    args = p.parse_args(argv)

    if args.list:
        for key in sorted(TEMPERAMENTS):
            print("%-14s %s" % (key, TEMPERAMENTS[key][0]))
        return 0

    if args.verify:
        return 0 if verify(args.boot_addr, args.leader, args.trailer) else 1

    if not args.temperament:
        p.error("a temperament is required (or use --list / --verify)")

    factor, cpu_label = args.cpuFactor
    scale = (args.pitchA / 440.0) / factor
    table = build_table(TEMPERAMENTS[args.temperament][1], scale)

    if args.lst:
        print(format_listing(args.temperament, args.boot_addr, table,
                             args.pitchA, cpu_label, scale))
        if args.out is None:
            return 0  # listing only -- don't write a tape unless -o is given

    # Auto-name: <temperament>-<pitchA>[-chm | -cf<factor>].bin
    suffix = "" if cpu_label == "1" else ("-chm" if cpu_label == "chm" else "-cf" + cpu_label)
    out = args.out or ("%s-%g%s.bin" % (args.temperament, args.pitchA, suffix))
    tape = build_tape(table, args.boot_addr, args.leader, args.trailer)
    with open(out, "wb") as f:
        f.write(tape)
    print("wrote %s (%d bytes): %s, pitchA=%g cpuFactor=%s scale=%.5f, bootstrap @ 0o%o"
          % (out, len(tape), args.temperament, args.pitchA, cpu_label, scale, args.boot_addr),
          file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
