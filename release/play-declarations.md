# Google Play — declarations and forms

Everything Play asks for outside the listing text. Derived from what the code
actually does, the same way `app-privacy-answers.md` was for Apple.

---

## 1. Foreground service permissions  *(the one most likely to stall you)*

Since targetSdk 34, Play requires a written declaration **per foreground service
type**, and usually a demo video. The app declares two, on one service:

```
ScaleMonitoringService — android:foregroundServiceType="connectedDevice|location"
```

### connectedDevice

> The app connects over Bluetooth Low Energy to a Virtus grain-cart scale — a
> weighing instrument mounted on farm machinery. While the operator is
> harvesting, the service holds that BLE connection open so the scale's weight
> readings continue to arrive and each load is recorded at the moment the grain
> leaves the cart.
>
> This has to run in the foreground because harvesting takes hours and the
> tractor's tablet spends most of that time with its screen off, in a mount, in
> a cab. If the connection drops the operator loses the load — the weight only
> exists while the scale is streaming it. A notification is shown for the whole
> time the service runs, and the operator ends it by disconnecting the scale in
> the app.

### location

> Each recorded load stores the GPS point where it was weighed, so the grower
> can see which part of which field the grain came from and calculate yield by
> area. The point is captured at the moment a load is logged, which — see above
> — happens while the screen is off.
>
> The app does not request ACCESS_BACKGROUND_LOCATION. Location is used only
> while this user-initiated, notification-backed service is running, and only to
> stamp a load the user is actively creating.

**Video:** Play wants a link (YouTube unlisted is fine) showing the feature in
use and the notification visible. `App Store Assets/virtus-shots/Google Tablet
Sceen/Edit Google Demo.mov` is a starting point — check it actually shows the
foreground notification, and re-record the relevant part if it doesn't.

---

## 2. Data safety form

Play's form is shaped differently from Apple's but the underlying facts are the
same, so this mirrors `app-privacy-answers.md`. **Keep the two in step** — they
describe one app, and a reviewer comparing them should find no contradiction.

**Does your app collect or share any of the required user data types? → Yes**
**Is all of the user data collected by your app encrypted in transit? → Yes**
(Supabase is HTTPS/WSS only.)
**Do you provide a way for users to request that their data is deleted? → Yes**
(URL: `https://virtusharvest.com/support`; in-app path: More ▸ Settings ▸
Delete Account.)

| Play data type | Collected | Shared | Processed ephemerally | Required | Purpose |
|---|---|---|---|---|---|
| Personal info → **Email address** | Yes | No | No | Required | App functionality, Account management |
| Personal info → **Name** | Yes | No | No | Optional | App functionality |
| Location → **Precise location** | Yes | No | No | Optional | App functionality |
| App activity → **Other user-generated content** | Yes | No | No | Required | App functionality |

Everything else: **not collected**. No advertising ID, no analytics SDK, no crash
reporter, no photos, no contacts, no financial data, no purchases.

> **"Shared" means transmitted to a third party.** Supabase is the app's own
> backend under the developer's account, which Play treats as processing, not
> sharing — so every Shared answer is No. If the Fenex remisión integration ever
> sends grower data from the app itself rather than server-side, that answer
> changes. Today it does not: the app calls a Supabase Edge Function, and the
> function talks to Fenex.

### Why Precise and not Approximate
`getCurrentPosition` runs with `enableHighAccuracy: true` and coordinates are
stored to six decimal places (~0.1 m). Approximate would be inaccurate.

---

## 3. Permissions rationale (if Play asks)

| permission | why |
|---|---|
| `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT` | find and connect to the Virtus scale |
| `ACCESS_FINE_LOCATION` | GPS point stamped on each load; also required by Android for BLE scanning |
| `FOREGROUND_SERVICE*` | keep the scale connected while harvesting — see §1 |
| `WAKE_LOCK` | the CPU must stay awake to receive BLE notifications with the screen off |
| `INTERNET` | sync to the user's account |

No `ACCESS_BACKGROUND_LOCATION`, no `QUERY_ALL_PACKAGES`, no `MANAGE_EXTERNAL_STORAGE`
— none of the permissions that draw extra scrutiny.

---

## 4. App access (reviewer credentials)

The app is useless without a sign-in, so Play **will** need a test account, and
this is a common cause of a rejected first review.

- Provide a working email and password under **App access → All functionality
  requires special access**.
- Seed it so the reviewer sees real data: `release/demo-seed.sql`.
- ⚠ The scale itself is Bluetooth hardware the reviewer will not have. Say so
  explicitly in the instructions, and point them at what *is* reachable without
  it (records, farms and fields, map, trucks, settings). Apple rejected 1.0 (9)
  over a path in the notes that didn't match the app — **open the app and walk
  the path you write down before submitting.**

Suggested note:

> Sign in with the credentials above. The account is pre-loaded with a season of
> harvest records.
>
> Live weighing requires a Virtus grain-cart scale, which is Bluetooth hardware
> not available to reviewers — the Scale tab will show "not connected". Every
> other feature works without it: Records lists loads, Fields shows farms and
> field boundaries on a map, Trucks shows capacities and loads, and More ▸
> Settings holds language, units and Delete Account.

---

## 5. Release checklist

1. Upload `VirtusCart-1.0.4-28.aab` — the **.aab**, not the .apk.
2. Play will ask you to enrol in **Play App Signing**. Accept it. Your upload key
   (`CN=Virtus Scales`) stays the upload key; Google holds the distribution key.
   Keep the keystore and `keystore.properties` backed up — losing the upload key
   means an identity reset with Google support.
3. versionCode **28** is uploaded. Play rejects a reused value, so bump
   `native-app/android/app/build.gradle` for every subsequent upload.
4. Internal testing track first. It goes live in minutes and lets you install
   from Play on a real phone before anyone else sees it.
5. Production review on a first submission for a new developer account runs days,
   not hours, and Play may additionally require up to 14 days of closed testing
   with 12 testers for a new **personal** developer account. Check which account
   type yours is before promising Manuel a date.
