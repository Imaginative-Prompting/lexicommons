#!/usr/bin/env python3
"""Checks the meaning colors stay distinguishable under color-vision deficiency.

Simulates protanopia, deuteranopia and tritanopia (Machado et al. 2009, severity 1.0) and reports CIEDE2000 distances
for every pair of meaning colors, plus each color's contrast against the theme background. Exit 1 if any pair drops
below MIN_DE in any simulation, or a color's contrast falls below MIN_CONTRAST.

    python3 scripts/check-palette.py
"""
import itertools, math, sys

MIN_CONTRAST = 4.5          # text-strength colors against the background (WCAG AA)
MIN_MARK_CONTRAST = 1.0     # highlighter marks sit behind ink text; their own contrast doesn't matter

# Pairs that can appear side by side in a study session, with how far apart they must stay under every
# simulation. Right vs wrong is the one that must never be confused. "new" and "hint" use no hue at all (bright
# or dim ink plus an icon), so they're not in the palette.
REQUIRED = {
    ("right", "wrong"): 20.0,
    ("right", "slipping"): 12.0,
    ("wrong", "slipping"): 12.0,
    ("moved", "right"): 12.0,
    ("moved", "wrong"): 12.0,
}

# "moved" is a highlighter mark behind ink text, so it's checked as a mark, not as text.
PALETTES = {
    "dark": {"bg": "#000000", "right": "#5AB0F0", "wrong": "#FF6E40", "slipping": "#F2D25C", "moved": "#7A3E6E"},
    "light": {"bg": "#FDFDFC", "right": "#0B6FB3", "wrong": "#C2410C", "slipping": "#3D3200", "moved": "#F5C6E4"},
}
MARKS = {"moved"}

MACHADO = {
    "protan": [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
    "deutan": [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
    "tritan": [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
}

def hex_rgb(h): return [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
def lin(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def unlin(c): c = min(max(c, 0), 1); return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055

def simulate(rgb, kind):
    if kind == "normal": return rgb
    l = [lin(c) for c in rgb]
    m = MACHADO[kind]
    return [unlin(sum(m[r][k] * l[k] for k in range(3))) for r in range(3)]

def lab(rgb):
    r, g, b = (lin(c) for c in rgb)
    x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
    y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
    f = lambda t: t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    return 116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))

def de2000(l1, l2):
    L1, a1, b1 = l1; L2, a2, b2 = l2
    C1, C2 = math.hypot(a1, b1), math.hypot(a2, b2)
    Cb = (C1 + C2) / 2
    G = 0.5 * (1 - math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)))
    a1p, a2p = a1 * (1 + G), a2 * (1 + G)
    C1p, C2p = math.hypot(a1p, b1), math.hypot(a2p, b2)
    h1p = math.degrees(math.atan2(b1, a1p)) % 360
    h2p = math.degrees(math.atan2(b2, a2p)) % 360
    dLp, dCp = L2 - L1, C2p - C1p
    dh = h2p - h1p
    if C1p * C2p == 0: dh = 0
    elif dh > 180: dh -= 360
    elif dh < -180: dh += 360
    dHp = 2 * math.sqrt(C1p * C2p) * math.sin(math.radians(dh / 2))
    Lbp, Cbp = (L1 + L2) / 2, (C1p + C2p) / 2
    hbp = h1p + h2p
    if C1p * C2p != 0:
        hbp = (h1p + h2p + 360) / 2 if abs(h1p - h2p) > 180 else (h1p + h2p) / 2
    T = 1 - 0.17 * math.cos(math.radians(hbp - 30)) + 0.24 * math.cos(math.radians(2 * hbp)) + 0.32 * math.cos(math.radians(3 * hbp + 6)) - 0.20 * math.cos(math.radians(4 * hbp - 63))
    Sl = 1 + 0.015 * (Lbp - 50) ** 2 / math.sqrt(20 + (Lbp - 50) ** 2)
    Sc, Sh = 1 + 0.045 * Cbp, 1 + 0.015 * Cbp * T
    Rt = -2 * math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7)) * math.sin(math.radians(60 * math.exp(-(((hbp - 275) / 25) ** 2))))
    return math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh))

def luminance(rgb): return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2])
def contrast(a, b):
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)

failures = 0
for theme, pal in PALETTES.items():
    bg = hex_rgb(pal["bg"])
    names = [n for n in pal if n != "bg"]
    print(f"\n{theme} theme")
    for n in names:
        c = contrast(hex_rgb(pal[n]), bg)
        need = MIN_MARK_CONTRAST if n in MARKS else MIN_CONTRAST
        flag = "" if c >= need else "  <-- low contrast"
        failures += c < need
        print(f"  {n:9s} {pal[n]}  contrast {c:4.1f}{'  (mark)' if n in MARKS else ''}{flag}")
    for (a, b), need in REQUIRED.items():
        worst = min(
            (de2000(lab(simulate(hex_rgb(pal[a]), k)), lab(simulate(hex_rgb(pal[b]), k))), k)
            for k in ("normal", "protan", "deutan", "tritan")
        )
        flag = "" if worst[0] >= need else "  <-- too close"
        failures += worst[0] < need
        print(f"  {a:8s} vs {b:8s} worst dE2000 {worst[0]:5.1f} ({worst[1]})  need {need:4.1f}{flag}")
print(f"\n{failures} problem(s)")
sys.exit(1 if failures else 0)
