# Virtus Feed — Plan

Feedlot (confinamiento) feed recording for Paraguay. Scale lives on the **mixer wagon**.

## The one-sentence product
The operator loads the mixer against a target and discharges into pens; the app
records every kilo automatically and turns it into cost per head per day.

## Why this works with the Virtus Scale
Harvest weighs a crop **once**, on the way out. Feed weighs the same ration
**twice a day, every day**, which means:
- The app must already know what the next feeding is. The operator confirms, never enters.
- The value is in the *variance* — formulated vs. actually loaded vs. actually delivered.
  Only a scale can see that, and sloppy loading is the biggest hidden cost in a feedlot.

## Domain model

| Entity | Harvest analogue | Notes |
|---|---|---|
| `cycles` | seasons | Feeding cycle. **Everything is scoped to it from day one.** |
| `lots` | fields | The pen/corral. Head count is the denominator for every metric. |
| `ingredients` | crops | Silage, corn, soy, urea, minerals. DM %, cost/kg, stock. |
| `rations` + `ration_items` | — | The diet formula. Versioned; diets change as cattle grow. |
| `mixers` | carts | The machine + its bound BLE scale. |
| `feedings` | weighings | The event. Has **loads[]** and **deliveries[]**. |
| `operators` | operators | Straight port. |

### The two-sided record
A feeding is not one weight. It is:
- `feed_loads` — ingredients **in**, each against a target from the ration.
- `feed_deliveries` — kg **out**, per lot.

Loaded should equal delivered. When it doesn't, that is the report.

### Id + name snapshot
Every load/delivery row stores **both** `ingredient_id` and `ingredient_name`
(same for lots). Harvest stored only names, so renames backfilled history.
Id is for joins, the name snapshot is what the record actually said at the time.

## Operator flow (gloves, sun, one hand, tractor cab)
1. Open → **"Corral 4 — mañana"** is already queued from the schedule.
2. **Load**: ingredient list with target kg. Huge live weight. Bar fills green. Tap next.
3. **Deliver**: lots in route order. Weight counts down. Tap to confirm each pen.
4. Done. Cost, kg/head, DM intake, inventory drawdown are all computed.

If the operator has to type a number, that is a design bug.

## v1 scope
In: the flow above, cost/head/day, ingredient stock + runway, load variance,
bunk score, Spanish-first, offline-first, cloud sync.
Out: SENACSA traceability, medicated-feed withdrawal, ration *formulation*
(we record what a nutritionist prescribed, we don't compete with them).

## Ported from Harvest
CSS design system (2,046 lines incl. the Android WebView paint fixes), BLE +
scale + OTA + ECDSA auth stack, sync engine and `vf_dirty` registry, Supabase
auth and the account-vs-operator split, calibration, diagnostics, wheel picker,
units, i18n scaffolding, GPS, toast. ~6,400 lines of infrastructure.

## Architecture change from Harvest
Harvest is one 756 KB `index.html`. Feed splits into `src/css/app.css` and
numbered `src/js/*.js` concatenated at build time into `www/index.html`.
Capacitor doesn't care, and it stops the file from becoming unnavigable.
