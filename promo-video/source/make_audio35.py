# Derives audio35.py (35 s cut) from audio.py: new section map, cue sheet and VO placement.
s = open('audio.py', encoding='utf-8').read()

def rep(a, b):
    global s
    assert a in s, a[:80]
    s = s.replace(a, b)

rep("DUR = 25.0", "DUR = 35.0")
rep("CH = {", "SEQ = [(0, 'Bm'), (2, 'G'), (3, 'A')] + [(4 + 2 * i, ['D', 'A', 'Bm', 'G'][i % 4]) for i in range(12)] + [(28, 'Em'), (29.5, 'A'), (30.5, 'D')]\nCH = {")
rep("    seq = [(0, 'Bm'), (2, 'G'), (3, 'A'), (4, 'D'), (6, 'A'), (8, 'Bm'), (10, 'G'), (12, 'D'), (14, 'A'), (16, 'Bm'), (18, 'G'), (20, 'Em'), (21, 'A'), (22, 'D')]",
    "    seq = SEQ")
rep("SEG = [(0, 2), (2, 3), (3, 4), (4, 6), (6, 8), (8, 10), (10, 12), (12, 14), (14, 16), (16, 18), (18, 20), (20, 21), (21, 22), (22, 25)]\nMAIN = (4.0, 21.5)",
    "SEG = [(SEQ[i][0], SEQ[i + 1][0] if i + 1 < len(SEQ) else DUR) for i in range(len(SEQ))]\n"
    "END = 30.5                                  # final hit / end card\n"
    "GROOVE = [(4.0, 11.5), (16.0, 30.0)]        # full drums; 11.5-16 is the breakdown under \"connects patients...\"\n"
    "def in_groove(t): return any(a <= t < b for a, b in GROOVE)\n"
    "MAIN = (4.0, 30.0)")
rep("for k in np.arange(MAIN[0], MAIN[1], BEAT):\n    i = int(k * SR); n = int(0.42 * SR); t = T(n)",
    "for k in [b for b in np.arange(MAIN[0], MAIN[1], BEAT) if in_groove(b)]:\n    i = int(k * SR); n = int(0.42 * SR); t = T(n)")
rep("i = int(22.0 * SR); n = int(1.2 * SR); duck[i:i + n]", "i = int(END * SR); n = int(1.2 * SR); duck[i:i + n]")
rep("[0, 3.6, 4.0, 20.0, 21.9, 22.0, 25], [700, 2800, 5200, 4200, 7000, 6500, 4000]",
    "[0, 3.6, 4.0, 11.5, 12.5, 15.9, 16.0, 28.0, 30.4, 30.5, 35], [700, 2800, 5200, 4600, 2600, 6000, 5200, 4200, 7000, 6500, 4000]")
rep("[0, 1.5, 3.9, 4, 22, 24.3, 25], [1.5, 1.8, 2.0, 0.75, 1.1, 0.95, 0.3]",
    "[0, 1.5, 3.9, 4, 11.5, 12.0, 15.9, 16.0, 30.5, 33.5, 35], [1.5, 1.8, 2.0, 0.75, 0.8, 1.4, 1.5, 0.75, 1.1, 0.95, 0.3]")
rep("for k, t0 in enumerate(np.arange(0, 22.0, 0.125)):", "for k, t0 in enumerate(np.arange(0, END, 0.125)):")
rep("g = 0.22 if t0 < 4 else (0.32 if t0 < 21 else 0.2)", "g = 0.22 if t0 < 4 else (0.32 if in_groove(t0) else (0.26 if t0 < END else 0.2))")
rep("place(music, x, 22.05 + dt, 0.13, pan=(-0.4 + j * 0.2))", "place(music, x, END + 0.05 + dt, 0.13, pan=(-0.4 + j * 0.2))")
rep("for t0 in np.arange(MAIN[0], MAIN[1], BEAT):\n    root = CH[chord_at(t0)][0] - 12",
    "for t0 in [b for b in np.arange(MAIN[0], MAIN[1], BEAT) if in_groove(b)]:\n    root = CH[chord_at(t0)][0] - 12")
rep("for t0 in np.arange(MAIN[0], MAIN[1], BEAT):\n    place(dr, K, t0, 0.95)",
    "for t0 in np.arange(MAIN[0], MAIN[1], BEAT):\n    if not in_groove(t0):\n        place(dr, H, t0 + 0.25, 0.08, pan=0.2); continue\n    place(dr, K, t0, 0.95)")
rep("roll(3.0, 4.0, 0.08, 0.45); roll(21.0, 22.0, 0.08, 0.5)\nfor tc in (10.0, 13.5, 16.5, 19.0): roll(tc - 0.5, tc, 0.12, 0.3)\nplace(dr, K, 22.0, 1.1)",
    "roll(3.0, 4.0, 0.08, 0.45); roll(29.5, 30.5, 0.08, 0.5); roll(15.0, 16.0, 0.06, 0.4)\nfor tc in (19.0, 22.5, 25.0): roll(tc - 0.5, tc, 0.12, 0.3)\nplace(dr, K, END, 1.1); place(dr, K, 16.0, 1.0)")
rep("for t0 in (0.42, 0.92, 1.5, 2.0):\n    n = int(0.5 * SR)", "for t0 in (0.38, 0.8, 1.86, 2.2, 2.62):\n    n = int(0.5 * SR)")

CUES = '''# S1 open
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

'''
a = s.index("# intro\nriser(2.0, 4.0, 0.32)")
b = s.index("fx = reverb(fx")
s = s[:a] + CUES + s[b:]

rep("VO_AT = {'l1': 0.40, 'l2': 4.15, 'l3': 7.05, 'l4': 10.15, 'l5': 13.6, 'l6': 16.65, 'l7': 19.05, 'l8': 22.35}",
    "VO_AT = {'v1': 0.35, 'v2': 4.1, 'v3': 7.05, 'v4': 11.55, 'v5': 16.05, 'v7': 19.75, 'v8': 22.6, 'v9': 25.1, 'v10': 30.9}")
rep("x, sr = sf.read(f'audio/vo_{k}.wav')", "x, sr = sf.read(f'audio35/vo_{k}.wav')")
for nm in ('music', 'sfx', 'vo', 'mix'):
    rep(f"'audio/{nm}.wav'", f"'audio35/{nm}.wav'")
open('audio35.py', 'w', encoding='utf-8').write(s)
print('audio35.py written')
