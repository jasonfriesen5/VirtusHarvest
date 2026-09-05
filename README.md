# Virtus Feed — web console

The desktop dashboard for the feedlot, and the main editing surface: prices and
ration formulas are owned here, not on the tablet. React + Vite + Tailwind +
TypeScript, Spanish-first with an English toggle.

    cd web
    cp .env.example .env
    npm install
    npm run dev          # http://localhost:5181

`web/README.md` has the detail.

## What's on this branch

| path | |
|---|---|
| `web/` | the console |

The tablet app is on `feed-app`. Virtus Harvest is on `harvest-web` and
`harvest-app`.

## Two things worth knowing before changing anything

**Stock is a measured ledger, not a running number.** `vf_stock_moves` records
receipts, feed-outs and physical counts; the balance is their sum. The gap
between the book and a count *is* the shrink figure, so a count is never
allowed to quietly overwrite the balance.

**Cost is frozen at consumption, never recomputed.** An ingredient has no
single price — it has FIFO layers, one per delivery, drawn oldest first. The
resolved cost is written onto the load line when the mixer is loaded. Reading
it back from the ingredient's current price is what used to let a purchase
today rewrite what last month's feeding cost.

## The build gate

`npm run build` runs `tools/check-i18n.mjs`. Every Spanish string needs an
entry in `src/lib/i18n.en.ts` or the build fails.
