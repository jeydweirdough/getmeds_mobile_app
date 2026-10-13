"""Original score + sound design + VO mix for the Getmeds promo.

Everything is synthesised here (no samples), at 120 BPM so every cut in index.html
(4.0, 7.0, 10.0, 13.5, 16.5, 19.0, 22.0) lands on a beat.
"""
import numpy as np, soundfile as sf
from scipy import signal

SR = 48000
DUR = 35.0
N = int(SR * DUR)
rng = np.random.default_rng(3)
BEAT = 0.5

def T(n): return np.arange(n) / SR
def buf(): return np.zeros((N, 2))
def place(dst, x, t, gain=1.0, pan=0.0):
    """Mix mono or stereo x into dst at time t (s), constant-power pan."""
    i = int(round(t * SR))
    if i >= N: return
    if x.ndim == 1:
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        x = np.stack([x * l * 1.414, x * r * 1.414], 1)
    if i < 0: x = x[-i:]; i = 0
    n = min(len(x), N - i)
    dst[i:i + n] += x[:n] * gain
def env(n, a, d, curve=4.0):
    t = T(n); e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-curve * np.maximum(0, t - a) / max(d, 1e-4)); return e
def lp(x, f, o=2): b, a = signal.butter(o, min(f, SR / 2 - 100) / (SR / 2), 'low'); return signal.lfilter(b, a, x, axis=0)
def hp(x, f, o=2): b, a = signal.butter(o, f / (SR / 2), 'high'); return signal.lfilter(b, a, x, axis=0)
def bp(x, lo, hi, o=2): b, a = signal.butter(o, [lo / (SR / 2), min(hi, SR / 2 - 100) / (SR / 2)], 'band'); return signal.lfilter(b, a, x, axis=0)
def saw(f, n, ph=0.0):
    p = (np.cumsum(np.full(n, f) if np.isscalar(f) else f) / SR + ph) % 1.0; return 2 * p - 1
def noise(n): return rng.standard_normal(n)
def midi(m): return 440.0 * 2 ** ((m - 69) / 12)

def reverb(x, decay=1.8, wet=0.3, pre=0.02):
    n = int(SR * decay * 1.2)
    t = T(n)
    irs = []
    for k in range(2):
        ir = rng.standard_normal(n) * np.exp(-6.9 * t / decay)
        ir = lp(ir, 7000 - 2000 * k); ir[: int(pre * SR)] = 0; ir /= np.sqrt(np.sum(ir ** 2))
        irs.append(ir)
    y = np.stack([signal.fftconvolve(x[:, 0], irs[0])[:N], signal.fftconvolve(x[:, 1], irs[1])[:N]], 1)
    return x * (1 - wet) + y * wet * 1.6

# ---------------------------------------------------------------- harmony
# bar -> chord (midi notes, root first). D major: I-V-vi-IV, intro on vi-IV, build on ii-V.
SEQ = [(0, 'Bm'), (2, 'G'), (3, 'A')] + [(4 + 2 * i, ['D', 'A', 'Bm', 'G'][i % 4]) for i in range(12)] + [(28, 'Em'), (29.5, 'A'), (30.5, 'D')]
CH = {'D': [50, 54, 57, 62], 'A': [45, 49, 52, 57], 'Bm': [47, 50, 54, 59], 'G': [43, 47, 50, 55], 'Em': [40, 43, 47, 52]}
def chord_at(t):
    seq = SEQ
    c = seq[0][1]
    for s, n in seq:
        if t >= s - 1e-9: c = n
    return c
SEG = [(SEQ[i][0], SEQ[i + 1][0] if i + 1 < len(SEQ) else DUR) for i in range(len(SEQ))]
END = 30.5                                  # final hit / end card
GROOVE = [(4.0, 11.5), (16.0, 30.0)]        # full drums; 11.5-16 is the breakdown under "connects patients..."
def in_groove(t): return any(a <= t < b for a, b in GROOVE)
MAIN = (4.0, 30.0)

# sidechain envelope from the kick grid (main section only)
duck = np.ones(N)
for k in [b for b in np.arange(MAIN[0], MAIN[1], BEAT) if in_groove(b)]:
    i = int(k * SR); n = int(0.42 * SR); t = T(n)
    duck[i:i + n] = np.minimum(duck[i:i + n], 1 - 0.72 * np.exp(-t / 0.11))
i = int(END * SR); n = int(1.2 * SR); duck[i:i + n] = np.minimum(duck[i:i + n], 1 - 0.8 * np.exp(-T(n) / 0.3))

music = buf()

# ---- pad: supersaw, filter opening through the intro
pad = buf()
for (s, e) in SEG:
    n = int((e - s) * SR) + int(0.3 * SR); t = T(n)
    notes = CH[chord_at(s)][1:] + [CH[chord_at(s)][0] + 12]
    v = np.zeros((n, 2))
    for m in notes:
        f = midi(m + 12)
        for d in (-0.13, -0.06, 0.0, 0.07, 0.12):
            ph = rng.random()
            v[:, 0] += saw(f * 2 ** (d / 12 * 1.0), n, ph); v[:, 1] += saw(f * 2 ** (-d / 12 * 1.0), n, ph + .3)
    a = np.minimum(1, t / 0.08) * np.minimum(1, np.maximum(0, (e - s + 0.3 - t)) / 0.3)
    v *= a[:, None] / 40
    place(pad, v, s)
cut = np.interp(T(N), [0, 3.6, 4.0, 11.5, 12.5, 15.9, 16.0, 28.0, 30.4, 30.5, 35], [700, 2800, 5200, 4600, 2600, 6000, 5200, 4200, 7000, 6500, 4000])
# time-varying low-pass in blocks
out = np.zeros_like(pad); B = 2400
zi = None
for k in range(0, N, B):
    b, a = signal.butter(2, cut[k] / (SR / 2), 'low')
    if zi is None: zi = np.zeros((2, 2))
    y0, zi0 = signal.lfilter(b, a, pad[k:k + B, 0], zi=zi[0]); y1, zi1 = signal.lfilter(b, a, pad[k:k + B, 1], zi=zi[1])
    out[k:k + B, 0], out[k:k + B, 1] = y0, y1; zi = np.array([zi0, zi1])
pad = out * np.interp(T(N), [0, 1.5, 3.9, 4, 11.5, 12.0, 15.9, 16.0, 30.5, 33.5, 35], [1.5, 1.8, 2.0, 0.75, 0.8, 1.4, 1.5, 0.75, 1.1, 0.95, 0.3])[:, None]
music += pad * duck[:, None] * 1.7

# ---- pluck arpeggio: 16ths over chord tones, with ping-pong delay
pl = buf()
pattern = [0, 2, 1, 3, 2, 1, 3, 2]
for k, t0 in enumerate(np.arange(0, END, 0.125)):
    notes = CH[chord_at(t0)]
    m = notes[1:][pattern[k % 8] % 3] + 24 + (12 if pattern[k % 8] == 3 else 0)
    n = int(0.3 * SR)
    x = saw(midi(m), n) * 0.6 + np.sin(2 * np.pi * midi(m) * T(n)) * 0.5
    x = lp(x, 2400 + 3000 * np.exp(-0)) * env(n, 0.002, 0.09)
    g = 0.22 if t0 < 4 else (0.32 if in_groove(t0) else (0.26 if t0 < END else 0.2))
    if t0 < 2: g *= t0 / 2
    place(pl, x, t0, g, pan=0.25 * np.sin(k))
dl = int(0.375 * SR)
d = np.zeros_like(pl); d[dl:, 0] = pl[:-dl, 1]; d[2 * dl:, 1] += pl[:-2 * dl, 0] * 0.6
music += (pl + d * 0.35) * duck[:, None] * 0.9

# ---- final bell motif on the end card
for j, (m, dt) in enumerate([(74, 0.0), (78, 0.25), (81, 0.5), (86, 0.75), (90, 1.25)]):
    n = int(2.2 * SR); t = T(n); f = midi(m)
    x = (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 6) + 0.15 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 10)) * env(n, 0.003, 0.9, 3)
    place(music, x, END + 0.05 + dt, 0.13, pan=(-0.4 + j * 0.2))

# ---- bass: off-beat pumping 8ths + sub on the hits
bs = np.zeros(N)
for t0 in [b for b in np.arange(MAIN[0], MAIN[1], BEAT) if in_groove(b)]:
    root = CH[chord_at(t0)][0] - 12
    for off in (0.25,):
        n = int(0.22 * SR); f = midi(root)
        x = lp(saw(f, n) * 0.7 + np.sin(2 * np.pi * f * T(n)), 900) * env(n, 0.004, 0.16, 3)
        place_t = t0 + off; i = int(place_t * SR); bs[i:i + n] += x[: max(0, min(n, N - i))]
music += np.stack([bs, bs], 1) * 0.42

# ---- drums
dr = buf()
def kick():
    n = int(0.45 * SR); t = T(n); f = 45 + 95 * np.exp(-t / 0.035)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.18); x[:240] += noise(240) * 0.3 * np.linspace(1, 0, 240)
    return np.tanh(x * 1.6)
def clap():
    n = int(0.3 * SR); x = np.zeros(n)
    for k, dt in enumerate((0, 0.011, 0.022)):
        i = int(dt * SR); m = n - i; x[i:] += noise(m) * np.exp(-T(m) / (0.008 if k < 2 else 0.09))
    return bp(x, 900, 4500) * 0.9
def hat(open_=False):
    n = int((0.25 if open_ else 0.06) * SR); x = hp(noise(n), 7500) * np.exp(-T(n) / (0.07 if open_ else 0.014)); return x
def snare():
    n = int(0.2 * SR); t = T(n)
    return bp(noise(n), 1500, 9000) * np.exp(-t / 0.05) * 0.7 + np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.04) * 0.5
K, C, H, HO, S = kick(), clap(), hat(), hat(True), snare()
for t0 in np.arange(MAIN[0], MAIN[1], BEAT):
    if not in_groove(t0):
        place(dr, H, t0 + 0.25, 0.08, pan=0.2); continue
    place(dr, K, t0, 0.95)
    place(dr, HO, t0 + 0.25, 0.22, pan=0.2)
    place(dr, H, t0 + 0.125, 0.1, pan=-0.3); place(dr, H, t0 + 0.375, 0.1, pan=-0.3)
    if int(round((t0 - 4) / BEAT)) % 2 == 1: place(dr, C, t0, 0.55)
for t0 in np.arange(2.0, 4.0, 0.125): place(dr, H, t0, 0.05 + 0.08 * (t0 - 2) / 2, pan=0.3)
# snare rolls into the two hits, and short fills into cuts
def roll(t0, t1, g0, g1):
    t = t0; k = 0
    while t < t1 - 0.01:
        p = (t - t0) / (t1 - t0); place(dr, S, t, g0 + (g1 - g0) * p, pan=0.1)
        t += 0.125 if p < 0.5 else (0.0625 if p < 0.85 else 0.03125)
roll(3.0, 4.0, 0.08, 0.45); roll(29.5, 30.5, 0.08, 0.5); roll(15.0, 16.0, 0.06, 0.4)
for tc in (19.0, 22.5, 25.0): roll(tc - 0.5, tc, 0.12, 0.3)
place(dr, K, END, 1.1); place(dr, K, 16.0, 1.0)
# word slams in the intro
for t0 in (0.38, 0.8, 1.86, 2.2, 2.62):
    n = int(0.5 * SR); t = T(n); f = 60 + 60 * np.exp(-t / 0.05)
    place(dr, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.2), t0, 0.55)
music += dr

# ---------------------------------------------------------------- sound design
fx = buf()
def whoosh(tp, pre=0.45, post=0.35, lo=300, hi=6000, g=0.5, pan_from=-0.6, pan_to=0.6):
    n = int((pre + post) * SR); t = T(n)
    x = noise(n)
    a = np.where(t < pre, (t / pre) ** 2.5, np.exp(-(t - pre) / (post / 3)))
    fc = lo + (hi - lo) * np.where(t < pre, (t / pre) ** 2, np.exp(-(t - pre) / (post / 2)))
    y = np.zeros(n); B = 512; z = np.zeros(4)
    for k in range(0, n, B):
        b, aa = signal.butter(2, [max(60, fc[k] * 0.5) / (SR / 2), min(SR / 2 - 200, fc[k] * 1.6) / (SR / 2)], 'band')
        y[k:k + B], z = signal.lfilter(b, aa, x[k:k + B], zi=z if k else signal.lfilter_zi(b, aa) * 0)
    y *= a
    p = np.linspace(pan_from, pan_to, n)
    st = np.stack([y * np.cos((p + 1) * np.pi / 4), y * np.sin((p + 1) * np.pi / 4)], 1) * 1.4
    place(fx, st, tp - pre, g)
def impact(t0, g=1.0):
    n = int(2.5 * SR); t = T(n); f = 32 + 50 * np.exp(-t / 0.12)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.7)
    body = lp(noise(n), 1200) * np.exp(-t / 0.12) * 0.8
    crash = hp(noise(n), 4000) * np.exp(-t / 0.9) * 0.35
    metal = sum(np.sin(2 * np.pi * f0 * t) for f0 in (3150, 4370, 5523, 6910)) * np.exp(-t / 0.5) * 0.04
    x = np.tanh((sub * 1.3 + body) * 1.2) + crash + metal
    place(fx, np.stack([x, x * 0.96 + crash * 0.1], 1), t0, g)
def riser(t0, t1, g=0.35):
    n = int((t1 - t0) * SR); t = T(n); p = t / (t1 - t0)
    x = noise(n); y = np.zeros(n); B = 512; z = None
    for k in range(0, n, B):
        fc = 400 + 7000 * p[k] ** 2
        b, a = signal.butter(2, [fc * 0.7 / (SR / 2), min(SR / 2 - 200, fc * 1.4) / (SR / 2)], 'band')
        if z is None: z = np.zeros(4)
        y[k:k + B], z = signal.lfilter(b, a, x[k:k + B], zi=z)
    tone = saw(110 * 2 ** (p * 2), n) * 0.12
    y = (y + lp(tone, 3000)) * p ** 2
    place(fx, np.stack([y, np.roll(y, 300)], 1), t0, g)
def pop(t0, f0=700, g=0.35, pan=0.0):
    n = int(0.12 * SR); t = T(n); f = f0 * (1 + 0.9 * np.exp(-t / 0.012))
    place(fx, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.035), t0, g, pan)
def tap(t0, g=0.4, pan=0.0):
    n = int(0.05 * SR); t = T(n)
    x = hp(noise(n), 2500) * np.exp(-t / 0.004) * 0.6 + np.sin(2 * np.pi * 1800 * t) * np.exp(-t / 0.008) * 0.5
    place(fx, x, t0, g, pan)
def key(t0, g=0.18):
    n = int(0.04 * SR); t = T(n); f = 2200 + rng.random() * 1400
    place(fx, bp(noise(n), f * 0.6, f * 1.5) * np.exp(-t / 0.006) + np.sin(2 * np.pi * 400 * t) * np.exp(-t / 0.01) * 0.3, t0, g, rng.random() * 0.4 - 0.2)
def bell(t0, m, g=0.2, dec=0.6, pan=0.0):
    n = int(1.6 * SR); t = T(n); f = midi(m)
    x = (np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 5)) * np.exp(-t / dec) * np.minimum(1, t / 0.002)
    place(fx, x, t0, g, pan)
def swish(t0, g=0.25): whoosh(t0 + 0.12, pre=0.12, post=0.18, lo=1500, hi=9000, g=g, pan_from=-0.3, pan_to=0.3)

# S1 open
riser(2.0, 4.0, 0.32)
for t0 in (0.3, 0.75, 1.85): swish(t0, 0.16)
swish(1.55, 0.14)
whoosh(4.0, pre=0.7, post=0.2, lo=200, hi=5000, g=0.45, pan_from=0, pan_to=0)
impact(4.0, 0.95)
# S2 brand
whoosh(4.95, pre=0.25, post=0.3, lo=800, hi=7000, g=0.22, pan_from=-0.6, pan_to=0.5)
for i, (t0, m) in enumerate([(5.12, 86), (5.3, 90), (5.82, 93), (6.02, 98)]): bell(t0, m, 0.07, 0.5, -0.3 + i * 0.2)
# S9 therapies -> cancer medicines
whoosh(7.0, g=0.5)
whoosh(7.35, pre=0.3, post=0.6, lo=150, hi=1800, g=0.25, pan_from=-0.2, pan_to=0.2)
whoosh(9.6, pre=0.35, post=0.3, lo=300, hi=4000, g=0.3, pan_from=0.6, pan_to=0.2)
pop(10.05, 640, 0.3, 0.4); bell(10.08, 93, 0.07, 0.4, 0.4)
for k in range(15): bell(10.15 + 1.0 * (1 - (1 - (k + 1) / 15) ** (1 / 3)), 96 + (k % 3), 0.018, 0.07, -0.6)
whoosh(11.5, pre=0.3, post=0.3, lo=500, hi=8000, g=0.5, pan_from=0.8, pan_to=-0.8)
# S10 people (breakdown)
pop(11.62, 480, 0.35, 0.0); bell(11.7, 86, 0.1, 0.9, 0); bell(11.78, 93, 0.08, 0.9, 0)
for i, t0 in enumerate((12.55, 13.05, 13.5, 13.8)):
    pop(t0, 560 + i * 70, 0.26, -0.6 + i * 0.4); bell(t0 + 0.03, [81, 85, 88, 93][i], 0.07, 0.5, -0.6 + i * 0.4); swish(t0 - 0.12, 0.08)
for i, t0 in enumerate((14.5, 14.6, 14.7)): bell(t0, [93, 97, 100][i], 0.05, 0.6, 0.2)
riser(15.0, 16.0, 0.28)
whoosh(16.0, pre=0.45, post=0.25, lo=200, hi=7000, g=0.5, pan_from=0, pan_to=0)
n = int(0.8 * SR); t = T(n); place(fx, np.sin(2 * np.pi * np.cumsum(45 + 45 * np.exp(-t / .06)) / SR) * np.exp(-t / 0.3), 16.0, 0.7)
# S3 search
whoosh(16.6, pre=0.35, post=0.25, lo=600, hi=5000, g=0.18, pan_from=-0.5, pan_to=-0.1)
pop(16.62, 520, 0.28, -0.2)
for k in range(9): key(16.78 + k * 0.068)
for t0, f0 in ((16.85, 660), (17.3, 740), (17.95, 830)): pop(t0, f0, 0.32, 0.5)
swish(17.42, 0.14)
whoosh(19.0, pre=0.3, post=0.3, lo=500, hi=8000, g=0.5, pan_from=0.8, pan_to=-0.8)
# S5 request
pop(19.27, 600, 0.28, 0.3); tap(19.55, 0.45, 0.3)
pop(19.97, 620, 0.28, 0.2); tap(20.22, 0.45, 0.2); swish(20.42, 0.16); bell(20.85, 93, 0.12, 0.25, 0.4)
pop(20.97, 700, 0.28, 0.3); tap(21.25, 0.45, 0.3)
bell(21.43, 86, 0.16, 0.7, 0.5); bell(21.55, 93, 0.16, 0.9, 0.5); bell(21.67, 98, 0.12, 1.0, 0.5)
whoosh(22.5, pre=0.3, post=0.3, lo=400, hi=7000, g=0.45, pan_from=0, pan_to=0)
# S6 chat
for t0, (a, b) in ((22.8, (88, 93)), (23.2, (86, 91)), (23.6, (84, 88))):
    bell(t0, a, 0.1, 0.12, 0.4); bell(t0 + 0.06, b, 0.1, 0.18, 0.4)
whoosh(24.1, pre=0.35, post=0.1, lo=200, hi=3000, g=0.3, pan_from=0, pan_to=0)
n = int(0.6 * SR); t = T(n); place(fx, np.sin(2 * np.pi * np.cumsum(50 + 40 * np.exp(-t / .05)) / SR) * np.exp(-t / 0.25), 24.1, 0.6)
whoosh(25.0, pre=0.45, post=0.3, lo=300, hi=6000, g=0.42, pan_from=0.5, pan_to=-0.2)
# S7 explore
swish(25.35, 0.12)
for t0 in (27.15, 27.9, 28.45):
    n = int(0.5 * SR); t = T(n); place(fx, np.sin(2 * np.pi * np.cumsum(70 + 50 * np.exp(-t / .04)) / SR) * np.exp(-t / 0.16), t0, 0.45)
for t0, f0 in ((28.9, 620), (29.1, 700), (29.3, 790), (29.5, 880)): pop(t0, f0, 0.28, 0.4); bell(t0 + 0.02, 81 + int((f0 - 620) / 40), 0.05, 0.2, 0.4)
riser(29.0, 30.5, 0.3)
whoosh(30.5, pre=0.45, post=0.2, g=0.45, pan_from=0, pan_to=0)
impact(30.5, 0.9)
# S8 end card
for t0, m in ((31.62, 93), (32.58, 98)): bell(t0, m, 0.08, 0.8, -0.3)
pop(33.3, 560, 0.3, -0.3); bell(33.35, 98, 0.08, 0.6, -0.3)

fx = reverb(fx, decay=1.4, wet=0.18)
music = reverb(music, decay=2.2, wet=0.22)

# ---------------------------------------------------------------- voice-over
VO_AT = {'v1': 0.35, 'v2': 4.1, 'v3': 7.05, 'v4': 11.55, 'v5': 16.05, 'v7': 19.75, 'v8': 22.6, 'v9': 25.1, 'v10': 30.9}
vo = buf()
for k, t0 in VO_AT.items():
    x, sr = sf.read(f'audio35/vo_{k}.wav')
    x = signal.resample_poly(x, SR, sr)
    x = hp(x, 90, 2)
    # gentle presence lift + de-ess-ish low-pass
    x = x + 0.25 * bp(x, 2500, 5000); x = lp(x, 11000)
    place(vo, x, t0, 1.0)
# simple compressor on the VO bus
lvl = np.abs(vo[:, 0]); e = signal.lfilter([0.002], [1, -0.998], lvl)
g = np.where(e > 0.06, (0.06 / np.maximum(e, 1e-9)) ** 0.5, 1.0)
vo *= g[:, None]
vo = vo / np.max(np.abs(vo)) * 0.85
vo = reverb(vo, decay=0.6, wet=0.07)

# duck music + fx under the VO
ve = signal.lfilter([0.0015], [1, -0.9985], np.abs(vo[:, 0]))
ve = np.minimum(1, ve / (np.percentile(ve[ve > 1e-4], 70) + 1e-9))
mduck = 1 - 0.5 * ve
music *= mduck[:, None]
fx *= (1 - 0.25 * ve)[:, None]

music /= np.max(np.abs(music)); fx /= np.max(np.abs(fx))
mix = music * 0.42 + fx * 0.5 + vo * 1.45
fade = np.ones(N); fade[-int(0.6 * SR):] = np.linspace(1, 0, int(0.6 * SR)) ** 2
mix *= fade[:, None]
mix = np.tanh(mix * 1.15) / np.tanh(1.15)
mix /= np.max(np.abs(mix)) / 0.97
sf.write('audio35/music.wav', (music * 0.42 * fade[:, None]).astype(np.float32), SR)
sf.write('audio35/sfx.wav', (fx * 0.5).astype(np.float32), SR)
sf.write('audio35/vo.wav', (vo * 0.95).astype(np.float32), SR)
sf.write('audio35/mix.wav', mix.astype(np.float32), SR, subtype='FLOAT')
print('ok', mix.shape)
