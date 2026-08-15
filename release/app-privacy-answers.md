# App Store Connect — App Privacy answers

Derived from what the code actually transmits (Supabase `auth.users` plus the ten
`public` tables), not from intent. No third-party analytics, crash-reporting or
advertising SDKs exist in the project — the only native dependencies are
Bluetooth LE, Filesystem and the Virtus DFU plugin.

App Privacy lives in the left sidebar, **not** on the version page. It applies to
every version, so this is a one-time setup.

**First question — "Do you or your third-party partners collect data from this
app?" → Yes.**

---

## Data types to mark as COLLECTED (4)

For all four, the follow-up answers are identical:

- **Linked to the user's identity?** → **Yes** (rows are keyed by `user_id`)
- **Used for tracking?** → **No**
- **Purposes** → **App Functionality** only. Do not tick Analytics, Product
  Personalization, Advertising or Developer's Advertising.

| # | ASC category | ASC data type | What it actually is | Where it lives |
|---|---|---|---|---|
| 1 | Contact Info | **Email Address** | account sign-in address | `auth.users.email` |
| 2 | Contact Info | **Name** | operator/driver names the farm enters | `ht_operators.name`, `weighings.worker` |
| 3 | Location | **Precise Location** | GPS point per load, field boundaries | `weighings.lat/lng`, `ht_boundaries.points` |
| 4 | User Content | **Other User Content** | weights, crop, moisture, farm/field/truck names, notes | `weighings`, `ht_*` |

### Why Precise and not Coarse
`getCurrentPosition` is called with `enableHighAccuracy: true` and coordinates
are stored to six decimal places (~0.1 m). Declaring Coarse would be inaccurate.

### Why Name is on the list
`ht_operators.name` and `weighings.worker` hold names of real people — the
growers' drivers and staff. Apple treats that as Contact Info → Name, separately
from User Content. `PrivacyInfo.xcprivacy` declares it too; the manifest and
these answers are expected to agree.

---

## NOT collected — everything else

| type | why |
|---|---|
| **Photos or Videos** | the profile photo is written to `localStorage` as `ht_profile_photo` and never uploaded. Apple defines "collect" as transmitting off device. |
| **Identifiers** | no IDFA, no advertising or device identifier is transmitted. The Supabase `user_id` scopes a user's own rows; it is not collected *as* a data type for any listed purpose. |
| **Usage Data / Diagnostics** | no analytics SDK, no crash reporter. |
| **Financial / Payment / Purchases** | none. No IAP. |
| **Health, Sensitive Info, Contacts, Browsing History, Audio** | none. |
| **Physical Address** | destinations are elevators and bins named by the grower, not addresses. |

**Do not enable App Tracking Transparency** and do not add
`NSUserTrackingUsageDescription` — nothing is used for tracking.

---

## Account deletion (Guideline 5.1.1(v))

- **Supported: Yes.**
- Reviewer path: **More ▸ Settings ▸ Delete Account**
- Calls the `delete_own_account()` Postgres function, which clears all ten
  user-owned tables and then the `auth.users` row.

⚠ **The FKs from the app tables to `auth.users` are `NO ACTION`, not `CASCADE`.**
That function only works because it deletes every user-owned table by hand first.
**Any new user-owned table must be added to it**, or account deletion starts
failing on the foreign key — which would break 5.1.1(v) compliance.

Verified end-to-end on 2026-08-12: a test account and every associated row were
removed, with zero orphaned records across all ten tables plus `auth.identities`
and `auth.sessions`.

---

## Don't forget

There is a **Publish** button. Answers that are saved but not published do not
count, and the version stays blocked from submission.
