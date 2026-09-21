# Foreground service demo video — shot list

One video covers **both** declared permissions. Paste the same link into every
Video link box on the Play form (Connected device, and Location).

**What Google is checking:** that the app really performs a task the user would
notice while they are not interacting with it, and that a notification is visible
the whole time the service runs. Everything below exists to show exactly that.

- Length: 60–90 seconds. No narration needed; no editing needed.
- Film with a **second phone or camera**, not screen recording — the scale and
  cart in frame make the case obvious, and there is no trouble capturing the
  lock screen.
- Film **landscape**, hold steady, get close enough that the weight numbers and
  the notification text are legible when Google plays it at normal size.
- Have the scale powered on and the cart with some grain in it before you start.

---

## The six shots

| # | Shot | What must be legible | Why it is there |
|---|---|---|---|
| 1 | Open the app, **Device** tab, connect the Virtus scale | The scale listed, then "Connected" | Establishes the external device |
| 2 | **Display** tab — move grain so the weight changes | The large weight readout changing | Proves continuous data transfer |
| 3 | **Lock the screen**, then pull down the notification shade | **"Scale monitoring active"** | The core evidence: service runs with the screen off, notification visible |
| 4 | Leave the screen off and **unload** | The cart emptying, phone screen dark | The task happening while the user is not interacting |
| 5 | Unlock, open the new load, tap **See Location** | Weight, and the GPS point on the map | Justifies FOREGROUND_SERVICE_LOCATION |
| 6 | **Device** tab, disconnect the scale | Notification disappearing | Shows the user ends the service |

Shot 5 is the one people forget. The Location half of the declaration is
"Other", so the reviewer has to see *why* location is needed — a recorded load
carrying a GPS point. Without it, the connected-device half may pass and the
location half be rejected.

---

## Upload

- YouTube, visibility **Unlisted**. **Not Private** — Google cannot open Private
  videos and the declaration is rejected without explanation.
- Title it plainly, e.g. `Virtus Cart — foreground service demonstration`.
- Paste the same URL into **both** Video link fields, then Save.

## If a reviewer comes back asking for more

The written justifications are in `play-declarations.md` §1. The usual follow-up
is "we could not see the notification" — re-film shot 3 closer and slower,
holding on the shade for a full three seconds.
