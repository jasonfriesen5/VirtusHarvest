# tools/

## Palette

`app.gold-palette.css` is `src/css/app.css` exactly as it came out of Virtus
Harvest, in the original gold. Kept because the green rebrand is not
automatically reversible: `recolor.py` rotates the gold hue band (36–62°) to
green, and once rotated those colours sit outside the band, so re-running with
`--hue 45` does nothing.

**To go back to gold:** copy this file over `src/css/app.css`, then revert the
gold values in `src/css/feed.css` by hand (there are only a handful, all in the
`.feed-bar-*` and `.btn-gold` rules).

**To try a different green** — or any other hue — restore this file first, then:

```
python3 tools/recolor.py --hue 165 && python3 tools/tune-green.py
```

`recolor.py` deliberately protects the amber warning tokens and every red and
blue, so error, warning and link colours survive any rotation.

`tune-green.py` compresses saturation above 0.5. Gold carries full saturation
gracefully; green at the same saturation reads as highlighter.
