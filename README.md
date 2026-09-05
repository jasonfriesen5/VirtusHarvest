# Virtus Harvest — web console

The desktop console at `virtusharvest.com`. React 19 + Vite + Tailwind v4 +
TypeScript, deployed to Netlify, reading the same Supabase project as the phone
app.

    cd web
    cp .env.example .env
    npm install
    npm run dev

`web/README.md` has the detail: what each page does, the naming caveat that
shapes the Manage screen, and the two things that have to be set up outside
this repo.

## What's on this branch

| path | |
|---|---|
| `web/` | the console |
| `supabase/functions/fenex/` | the only code that talks to the Fenex API |

The phone app is on `harvest-app`. Virtus Feed is on `feed-web` and `feed-app`.
Firmware lives in its own repository.

## Nota de Remisión

Paraguay only, and off unless an account turns it on. Three files carry the
integration with Fenex:

- `web/src/lib/fenexPayload.ts` — mirrors Fenex's `RemissionCreateRequest`
  and reimplements its validation, so a bad document fails here rather than
  at SET, where there is no sandbox and no cancellation.
- `web/src/lib/fenexMapping.ts` — turns one truckload into that payload.
- `supabase/functions/fenex/index.ts` — the Edge Function proxy. Fenex tokens
  never reach the browser.
