#!/usr/bin/env python3
"""
Rotate the Virtus gold identity to green across the stylesheets.

Works in HSL rather than by find-and-replacing hex values, so every tint,
shade and rgba() of the gold family moves together and stays internally
consistent. Only hues in the gold/brown band are touched:

  - reds (error states) and blues (links, info) are left alone
  - the amber WARNING tokens are protected by name — a warning that turns
    green stops reading as a warning
  - existing greens are left alone; they were already the success colour

Usage:  python3 tools/recolor.py [--hue 150] [--check]
        --check prints what would change without writing.
"""
import re, sys, colorsys, pathlib

TARGET_HUE   = 150.0   # degrees; 150 = a slightly blue-leaning green
GOLD_BAND    = (36.0, 62.0)   # hues counted as "the gold identity"
SAT_FLOOR    = 0.04    # below this a colour is grey; rotating it does nothing useful

# Amber is the warning colour and must survive the rotation.
PROTECTED = {'#a85e00', '#fef0cc', '#d4930a'}
PROTECTED_RGB = {(168, 94, 0), (212, 147, 10)}

def rot(r, g, b):
    h, l, s = colorsys.rgb_to_hls(r/255, g/255, b/255)
    hue = h * 360
    if s < SAT_FLOOR and not (GOLD_BAND[0] <= hue <= GOLD_BAND[1]):
        return None
    if not (GOLD_BAND[0] <= hue <= GOLD_BAND[1]):
        return None
    # Keep the colour's position within the band, so light gold stays lighter
    # than dark gold instead of everything collapsing onto one green.
    span = (hue - GOLD_BAND[0]) / (GOLD_BAND[1] - GOLD_BAND[0])
    new_hue = (TARGET_HUE - 12 + span * 24) / 360
    nr, ng, nb = colorsys.hls_to_rgb(new_hue, l, s)
    return round(nr*255), round(ng*255), round(nb*255)

def do_hex(m):
    v = m.group(0)
    if v.lower() in PROTECTED:
        return v
    r, g, b = (int(v[i:i+2], 16) for i in (1, 3, 5))
    out = rot(r, g, b)
    return v if out is None else '#%02X%02X%02X' % out

def do_rgba(m):
    r, g, b = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if (r, g, b) in PROTECTED_RGB:
        return m.group(0)
    out = rot(r, g, b)
    if out is None:
        return m.group(0)
    return 'rgba(%d,%d,%d,%s)' % (out[0], out[1], out[2], m.group(4))

def main():
    global TARGET_HUE
    check = '--check' in sys.argv
    if '--hue' in sys.argv:
        TARGET_HUE = float(sys.argv[sys.argv.index('--hue') + 1])

    root = pathlib.Path(__file__).resolve().parent.parent
    total = 0
    for name in ('src/css/app.css', 'src/css/feed.css', 'src/index.html'):
        p = root / name
        s = p.read_text()
        before = s
        s = re.sub(r'#[0-9A-Fa-f]{6}\b', do_hex, s)
        s = re.sub(r'rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)', do_rgba, s)
        changed = sum(1 for a, b in zip(before.split(), s.split()) if a != b)
        total += changed
        print(f'{name}: {changed} tokens recoloured')
        if not check:
            p.write_text(s)
    print(('would change ' if check else 'changed ') + f'{total} tokens · target hue {TARGET_HUE}°')

main()
