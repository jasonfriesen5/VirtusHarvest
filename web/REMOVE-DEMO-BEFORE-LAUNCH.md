# Removing trial mode before launch

Trial mode simulates Fenex locally so the flow can be walked through without an
account. It touches four places. Removing it is a delete, not a refactor.

1. **Delete** `src/lib/fenexDemo.ts` and `src/lib/demoGeography.json`
2. **`src/lib/fenexClient.ts`** — remove the `fenexDemo` import and every
   `isDemo() ? … :` branch, leaving only the `call(...)` side
3. **`src/components/RemisionSettings.tsx`** — remove the `isDemo`/`setDemo`
   import, the `demo`/`setDemoOn` state, the violet toggle block, and `demo`
   from the `useEffect` dependency list
4. **`src/components/RemisionForm.tsx`** — remove the `isDemo` import and the
   violet banner

Then `npm run build`. If anything still references `fenexDemo`, the build fails —
which is the point.

## Why it is safe in the meantime

- The flag lives in `localStorage` under `vh_fenex_demo`, per browser. It is off
  unless someone deliberately ticks it.
- Nothing in trial mode makes a network call to Fenex or SET.
- The simulated document is invalid by construction: the número is
  `DEMO-001-001-0000000` and the CDC ends in `DEMO`, so a trial run can never be
  mistaken for a real one in the records.
- The PDF is a single page reading "DOCUMENTO DE PRUEBA - NO VALIDO".
