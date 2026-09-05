#!/usr/bin/env python3
"""
Compress saturation in the green band.

Gold carries 100% saturation gracefully; the same saturation at green reads as
highlighter. This pulls only the over-saturated end down (s > 0.5), so the
mid-saturation greens the app already used for success states are untouched
and the palette keeps its internal contrast.

Run once after tools/recolor.py. Idempotent: re-running leaves the compressed
values where they are, because they now sit below the threshold.
"""
import re, colorsys, pathlib

BAND  = (132.0, 168.0)
KNEE  = 0.50    # saturation above which we start compressing
SLOPE = 0.35    # how much of the excess survives

def squash(r, g, b):
    h, l, s = colorsys.rgb_to_hls(r/255, g/255, b/255)
    if not (BAND[0] <= h*360 <= BAND[1]) or s <= KNEE:
        return None
    ns = KNEE + (s - KNEE) * SLOPE
    nr, ng, nb = colorsys.hls_to_rgb(h, l, ns)
    return round(nr*255), round(ng*255), round(nb*255)

def do_hex(m):
    v = m.group(0)
    out = squash(*(int(v[i:i+2], 16) for i in (1, 3, 5)))
    return v if out is None else '#%02X%02X%02X' % out

def do_rgba(m):
    out = squash(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    if out is None:
        return m.group(0)
    return 'rgba(%d,%d,%d,%s)' % (*out, m.group(4))

root = pathlib.Path(__file__).resolve().parent.parent
for name in ('src/css/app.css', 'src/css/feed.css', 'src/index.html'):
    p = root / name
    s = p.read_text()
    s = re.sub(r'#[0-9A-Fa-f]{6}\b', do_hex, s)
    s = re.sub(r'rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)', do_rgba, s)
    p.write_text(s)
    print(f'{name}: tuned')
