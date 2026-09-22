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

| Play data type | Collected | Shared | Ephemeral | Required | Purpose |
|---|---|---|---|---|---|
| Personal info → **Email address** | Yes | No | No | Required | App functionality, Account management |
| Personal info → **Name** | Yes | No | No | Optional | App functionality |
| Personal info → **Address** | Yes | No | No | Optional | App functionality |
| Personal info → **Other info** | Yes | No | No | Optional | App functionality |
| Location → **Precise location** | Yes | No | No | Optional | App functionality |
| App activity → **Other user-generated content** | Yes | No | No | Required | App functionality |

Everything else: **not collected**. No advertising ID, no analytics SDK, no crash
reporter, no photos, no contacts, no financial data, no purchases.

### Address and Other info are there because of the remisión

A remisión is a SIFEN fiscal document, so issuing one needs identity data the rest
of the app never touches: **RUC** tax numbers and **razón social** legal names for
the issuer, the receiver and the hauler (`ht_destinations.ruc/razon_social/address`,
`ht_trucks.transportista_ruc/_name/_address`), and the hauler may instead be
identified by **CI**, a national ID number.

- **Address** covers the receiver and hauler addresses.
- **Other info** covers the RUC and CI numbers. A company RUC is not personal data,
  but a sole trader's is, and a CI always is — so declare it.

Both are **Optional**: they are only ever collected from growers who turn the
remisión switch on, which is off at install.

### Why "Shared" is No, including for the remisión

Play defines sharing as transferring user data to a third party, and that includes
transfers from your own backend — so "the edge function calls Fenex, not the app"
is not by itself the reason. The reason is that Play exempts two things that both
apply here: a transfer a **user specifically initiates** (the grower taps to issue
the remisión, having switched the feature on), and a transfer made **to comply with
a legal obligation**, which a fiscal document filed with the tax authority is.

Supabase is separately exempt as a service provider processing on your behalf.

If the app ever sends grower data anywhere the user did not ask for and the law
does not require, this answer changes.

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

Paste this into **Instructions**. That field is capped at **500 characters**, so
it is deliberately terse — 463 with a normal YouTube URL in place, leaving 37
spare. Anything longer gets cut off mid-sentence, and the hardware paragraph is
the part a reviewer must see.

Paths are verified against the running app: the tabs are Display, Fields, Trucks,
Dest and Device, with Settings under More. Apple rejected 1.0 (9) over a path in
the notes that was not where the notes said it was.

```
HARDWARE: live weighing needs the physical Virtus scale, which we cannot ship to reviewers. Without it the Display tab shows no weight and Device lists no scale. This is expected, not a defect. Video of the app with a real scale: https://youtu.be/5rHVuxwlDDU

The demo account holds 2 farms, 4 fields, 3 trucks and ~18 loads. Everything else works without hardware: Fields, Trucks, Dest, adding loads manually, and More > Settings > Delete Account.
```

The **Name** field above it takes something like `Full app`, with the demo email
and password in the credential fields — those are separate fields and do not
count against the 500.

### The demo video

Google expects to see the declared feature actually running, with the foreground
notification visible. Record a fresh one — the existing
`App Store Assets/virtus-shots/Google Tablet Sceen/Edit Google Demo.mov` shows the
old VIRTUS HARVEST branding, which reads as a different app.

Shot list, about 60-90 seconds, on a phone with a scale connected:

1. Open the app, go to the Device tab, connect the scale.
2. Show live weight changing on the Display tab.
3. Lock the screen. Pull down the notification shade so "Scale monitoring active"
   is clearly visible.
4. With the screen still off, unload so a load is recorded.
5. Unlock, show the new load in the history with its weight and GPS point.
6. Disconnect the scale and show the notification disappearing — this
   demonstrates the service ends when the user ends it.

Upload to YouTube as **Unlisted** (not Private — Google cannot open Private), then
paste the link in both the foreground service declaration and the App access
instructions above.

## 5. Release checklist

1. Upload `VirtusCart-1.0.4-29.aab` — the **.aab**, not the .apk.
2. Play will ask you to enrol in **Play App Signing**. Accept it. Your upload key
   (`CN=Virtus Scales`) stays the upload key; Google holds the distribution key.
   Keep the keystore and `keystore.properties` backed up — losing the upload key
   means an identity reset with Google support.
3. versionCode **29** is uploaded. Play rejects a reused value, so bump
   `native-app/android/app/build.gradle` for every subsequent upload.
4. Internal testing track first. It goes live in minutes and lets you install
   from Play on a real phone before anyone else sees it.
5. Production review on a first submission for a new developer account runs days,
   not hours, and Play may additionally require up to 14 days of closed testing
   with 12 testers for a new **personal** developer account. Check which account
   type yours is before promising Manuel a date.
