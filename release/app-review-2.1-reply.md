# Guideline 2.1 — reply pack

Two parts: the video you have to record, then text to paste into the App Review
reply. This is a standard information request on a first submission, not a
finding against the app.

---

# PART A — the screen recording

Apple asked for a recording **on a physical device**, starting from app launch,
showing the typical flow, and explicitly including **registration, login, account
deletion**, and **any permission prompts**.

## Before you record

- Use your **iPhone**, not the simulator — they asked for a physical device.
- **Create a throwaway account for the deletion demo** (e.g. `reviewdemo2@…`).
  **Do not delete `demo@virtusharvest.com`** — that's the reviewer's login, and
  deleting it breaks the credentials in App Store Connect.
- **Delete and reinstall the app first**, so the Bluetooth and Location prompts
  actually appear. Once granted, iOS never shows them again — and Apple
  specifically asked to see them.
- Have the scale powered on and nearby. Showing live weight is the strongest
  thing you can put in this video.
- Turn on Do Not Disturb so notifications don't cover the screen.

Record with Control Centre → Screen Recording. Aim for 3–5 minutes.

## Shot list, in order

1. **Launch from the home screen** — they want to see the app start cold.
2. **Create Account** — sign up with the throwaway address. Show the form and
   the confirmation.
3. **Permission prompts** — the Bluetooth prompt on first Scan, and the Location
   prompt. Pause a beat on each so they're clearly visible.
4. **Connect the scale** — Device tab → Scan → connect. Let the Model, Serial,
   Firmware and Battery rows populate.
5. **Live weighing** — the Display tab with a real weight. Tare, then put weight
   on the cart so the number moves and settles to "Stable".
6. **Record a load** — Unload, showing it logged against a field, truck and
   destination.
7. **Show the record** — Fields tab → a field → its transaction list and
   kg/ha total.
8. **Field Map** — show a drawn boundary on the satellite view.
9. **Sign out, then sign back in** — this is the "login" flow they asked for.
10. **Account deletion** — More ▸ Settings ▸ Delete Account on the **throwaway**
    account. Show the confirmation dialog and the app returning to a signed-out
    state.

If you can't get the scale connected on camera, still record everything else and
say so in the notes — but with the hardware in hand it's worth doing properly,
because it answers the hardware question better than any amount of text.

## Attaching it

The App Review reply box accepts attachments. If the file is too large, trim it
or upload it somewhere reachable (your own domain works) and paste the link in
the reply.

---

# PART B — paste this into the reply

Fill the two bracketed bits and delete this line.

---

Thank you for the review. The requested information is below, and a screen
recording captured on a physical iPhone is attached.

**2. DEVICES AND OPERATING SYSTEMS TESTED**

- iPhone 17 Pro — iOS 26.6 — physical device,
  tested with the Virtus scale hardware connected over Bluetooth LE
- iPad Pro 13-inch (M5) — iPadOS 26.5 — Simulator, used for layout and record
  management testing (Bluetooth is not available in the Simulator)

Testing covered account creation, sign-in, sign-out, account deletion, cloud
sync across two devices on the same account, Bluetooth connection to the scale,
live weighing, calibration, over-the-air firmware update, and record creation,
editing and deletion.

**3. WHAT THE APP DOES, AND FOR WHOM**

Virtus Harvest is the companion app for the Virtus grain cart scale, a Bluetooth
LE weighing device fitted to agricultural grain carts. The audience is grain
growers and their operators.

The problem it solves: during harvest, grain is moved from the combine to a
grain cart and then into trucks. Growers need to know how much came off each
field, which truck carried it and where it was delivered. Traditionally this is
tracked on paper in the cab, or not at all, and reconciled weeks later against
elevator tickets.

The app reads live weight from the scale over Bluetooth and records each load
against a field, truck, destination, crop and operator, with a GPS point and
moisture reading. It totals yield per field and per hectare, works offline in
areas without signal, and syncs to the grower's account when back in service so
the same records appear on every device they use.

**4. SETUP AND ACCESS**

Demo account (also entered in the Sign-In fields of App Review Information):

  Email: demo@virtusharvest.com
  Password: [as entered in the Sign-In Information fields]

The account is pre-loaded with two farms, four fields, drawn field boundaries,
three trucks, three destinations, three operators, and around eighteen recorded
loads, so every screen has representative data on first sign-in.

Please note the hardware dependency: live weighing requires the physical Virtus
scale, which we are not able to ship to the review team. Without it the weight
display shows no reading and the Device tab shows no scale. This is expected
behaviour, not a defect, and the attached recording shows those screens working
with real hardware connected.

Everything else is fully reviewable with the demo account and no hardware:

- Fields tab — create farms and fields, draw a field boundary on the map
- Trucks and Destinations tabs — create a truck with a capacity
- More ▸ Seasons and Operators — record management
- More ▸ Settings — units (kg / lb / bushels), language, dark mode
- Transactions can be added manually and appear in the field history
- More ▸ Settings ▸ Delete Account — permanent account deletion

**5. EXTERNAL SERVICES USED**

- Supabase — user authentication and the Postgres database that stores the
  grower's own records. Access is restricted by row-level security so an account
  can only read and write its own data.
- Google Maps JavaScript API — displays the satellite map used for viewing and
  drawing field boundaries, under the Google Maps Platform terms.
- Apple Core Bluetooth — connects to the customer's own Virtus scale.

There are no payment processors, no advertising networks, no analytics or
crash-reporting SDKs, and no AI services. No data is shared with third parties
for their own purposes, and nothing is used for tracking.

**6. REGIONAL DIFFERENCES**

None. The app functions identically in every region. It includes English and
Spanish interface languages, selectable by the user, and supports kilograms,
pounds and bushels as a user preference. No feature, content or behaviour varies
by country.

**7. REGULATED INDUSTRY / THIRD-PARTY MATERIAL**

The app does not operate in a regulated industry. It is a record-keeping and
measurement tool for a grower's own farm operation and does not provide
financial, medical, legal or other regulated services.

The only third-party material displayed is Google Maps satellite imagery, used
under the Google Maps Platform Terms of Service via a licensed API key.

The Bluetooth connection is only ever to the customer's own Virtus scale
hardware, purchased from us. No other devices are contacted.

Contact for any further questions: support@virtusharvest.com
