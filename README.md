# Virtus Feed — tablet app

Runs on the tablet mounted at the mixer. Plain scripts in `src/js/`, numbered in
load order, wrapped by Capacitor for Android and iOS. No bundler.

    ./build.sh            # src/ -> www/ and native-app/www/
    ./build.sh --sync     # ...and then cap sync android + ios

`build.sh` stamps every asset URL with a build id. Without it both Chrome and
the Android WebView happily serve a cached copy of a `.js` file after a
rebuild — you edit, sync, relaunch, and run the old script with no sign
anything is wrong.

## What's on this branch

| path | |
|---|---|
| `src/` | the app: `js/` in load order, `css/`, `index.html` |
| `native-app/` | the Capacitor wrapper |
| `supabase/` | schema and demo data |
| `tools/`, `docs/` | build helpers and notes |

The console is on `feed-web`. Virtus Harvest is on `harvest-web` and
`harvest-app`.

## The sync model

`src/js/09-sync.js` is table-driven: every entity is one row in
`SYNC_ENTITIES` and the engine loops. Harvest hand-wrote four branches per
table and the bugs came from the ones that got missed.

Two shapes travel differently, and confusing them causes real bugs:

- **`vf_settings`** is one row per account, **desktop-owned and pull-only**.
  The console is the authority; the tablet only reads it.
- **Entity tables** are **two-way**, reconciled through the dirty registry:
  cloud wins except for rows this device changed and has not uploaded.

So a setting that must be changeable from both sides belongs on an entity row,
not in `vf_settings` — there it costs nothing, whereas `vf_settings` would need
a whole push path built for it.

## A rule that looks like a detail

A missing or unreadable permission counts as **allowed**. If the tablet cannot
sync it still has to work: stranding an operator mid-shift is worse than a late
lock.
