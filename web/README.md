# Virtus Harvest — web console

Desktop companion to the Virtus Harvest mobile app. Same Supabase project, same
login, same records. Built with React + Vite + Tailwind; deployed to Netlify at
`view.virtusharvest.com`.

## Running locally

```bash
cd web
cp .env.example .env
npm install
npm run dev
```

Opens on <http://localhost:5180>. Sign in with the same email and password you
use in the mobile app.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check, then build to `web/dist` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Types only, no build |

## What's in it

| Page | Purpose |
| --- | --- |
| **Dashboard** | Totals, moisture, harvest days; per-day, per-field, per-crop and yield-per-hectare charts |
| **Records** | Every weighing — search, filter by field/crop/operator/truck/date, sort, edit, delete, export CSV |
| **Live** | Today's loads newest-first, running totals, active trucks (updates over Supabase Realtime) |
| **Map** | Field boundaries and located loads on Google Maps, plus a per-field yield table |
| **Manage** | Farms, fields, crops, trucks, grain carts, operators, seasons, destinations |

The header carries a season selector, a kg/lb/t unit toggle and a light/dark
switch. All three persist across reloads.

## Branding

The palette is built around the phone app's `--accent:#C47D00`, exposed as the
`brand-*` scale in [`src/index.css`](src/index.css). One caveat worth keeping:
white text on `brand-500` (#C47D00) measures 3.34:1, below the 4.5:1 WCAG AA
threshold — so 500 is the *identity* step (logo chip, chart marks, map polygons,
active nav) and filled buttons use `brand-600` (#A56800, 4.59:1). Charts use
`#c47d00` on light and `#c98500` on dark; the dark step is brighter because the
light value falls outside the contrast band on a dark surface.

`public/virtus-icon.png` is a copy of `Glas Virtus Icon.png` from the repo root.
Replace both together if the mark ever changes. The full artwork carries the
"HARVEST" wordmark, so the 28px header mark CSS-zooms to the V-and-wheat and
crops the wordmark out.

## How it reads the data

Every table is scoped by `user_id` and protected by row-level security, so the
console only ever sees the signed-in account's own rows — the same rule the
mobile app follows.

An account is a few hundred rows across ten small tables, so `DataProvider`
loads all of it once and every page filters in memory. That keeps the dashboard,
records table, map and live view perfectly consistent, and makes the season and
date filters instant. If an account ever grows past a few thousand weighings,
move `weighings` to a paged, server-filtered query and leave the rest alone.

### The naming caveat that shapes the Manage page

In `weighings`, only `field_id` and `season_id` are real references. `farm`,
`crop`, `buggy` (truck), `zone` (field), `unload`/`delivered_to` (destination)
and `worker` (operator) are stored as **plain text names**, copied at the moment
the load was weighed.

So renaming an entity would orphan every historic record that carries the old
name, and reports would silently split in two. Renaming in **Manage** therefore
also rewrites the matching text on every affected weighing, and the dialog shows
the exact row count before you confirm. The mapping lives in
[`src/lib/entities.ts`](src/lib/entities.ts):

| Entity | Column(s) rewritten on `weighings` |
| --- | --- |
| Farms | `farm` |
| Fields | `zone` |
| Crops | `crop` |
| Trucks | `buggy` |
| Operators | `worker` |
| Destinations | `unload` and `delivered_to` |
| Seasons | none — referenced by id |
| Grain carts | none — no column on `weighings` |

Rows flagged `is_truck_empty` are unload events, not harvested loads. They are
excluded from every total, and shown in Records only via the "Show truck-empty
events" checkbox.

## Deploying to Netlify

`netlify.toml` is already configured (base `web`, publish `web/dist`, SPA
redirect). To set the site up:

1. Connect the repository in Netlify. It picks up `netlify.toml` automatically.
2. Under **Site configuration → Environment variables**, add `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY` and `VITE_GOOGLE_MAPS_KEY`. Vite bakes these in at
   build time, so changing one needs a redeploy.
3. Under **Domain management**, add `view.virtusharvest.com` and create the DNS
   record Netlify shows you.

Both Supabase values are safe in the browser — the publishable key only grants
what RLS allows. Never put the `service_role` key in an environment variable
prefixed `VITE_`; it bypasses RLS and would be shipped to every visitor.

## Two things that must be set up outside this repo

**Google Maps referrer.** The map uses the same API key as the mobile app, and
that key is referrer-restricted. Add `view.virtusharvest.com/*` and
`http://localhost:5180/*` to the key's allowed referrers in Google Cloud Console
→ Credentials, or the map fails to load with no visible error.

**Supabase Realtime.** The Live page subscribes to `weighings`. If the table is
not in the realtime publication the page falls back to polling every 30 seconds
and shows an amber notice. To turn on true realtime, run once:

```sql
alter publication supabase_realtime add table public.weighings;
```

The header badge reads **Live** when the channel is connected and **Polling**
when it fell back.
