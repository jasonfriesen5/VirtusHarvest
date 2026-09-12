# Grain moisture sensing — feasibility

Notes on adding a moisture reading from a sensor at the auger spout.

## Short answer: power is not the constraint

Moisture sensing is cheaper than the load cell you already run continuously.

| | Current | Duty | Per unload |
|---|---|---|---|
| Capacitive front end (oscillator or CDC) | 1–5 mA | only while augering | ~0.4 mAh |
| Grain temperature probe (DS18B20) | 1.5 mA active, ~1 µA idle | one read/sec | negligible |
| **Total, 5-minute unload** | | | **<0.5 mAh** |

At twenty loads a day that's ~8 mAh against a 2000 mAh pack — under half a percent. Compare
with the onboard NAU7802 and its bridge, which draw ~10 mA *continuously*
([REVIEW.md](REVIEW.md) #10). The moisture sensor only needs to run while grain is actually
moving, and you already know when that is from the weight changing.

And if the sensor ends up on the vehicle-powered satellite side, the question disappears
entirely.

**So the honest answer is: power isn't what makes this hard. Measurement validity is.**

## What actually makes it hard

Capacitive (dielectric) sensing is how essentially all grain moisture meters work — water's
dielectric constant is ~80 against ~2–5 for dry grain, so bulk permittivity tracks moisture
strongly. The physics is easy. Four things around it are not.

### 1. Bulk density — the dominant error at a spout

The measurement responds to *mass of water per unit volume*. At the spout, grain is
free-falling and aerated, and its density swings with auger speed, fill level, and crop. A
10% density change looks a lot like a 10% moisture change.

This is why commercial in-line units don't measure free-falling grain — they measure where
the flighting compacts it, or they fill a fixed-volume cell. **The auger spout is the
easiest place to mount and the worst place to measure.**

### 2. Temperature

Grain permittivity is strongly temperature-dependent — uncompensated, roughly a few tenths
of a moisture point per °C. Harvest spans 5 °C to 35 °C, so this is not optional.

You need **grain** temperature, not air and not board temperature. A DS18B20 in the sensor
head, in contact with the flow. 1-Wire survives a long cable well.

### 3. Crop and variety calibration

Corn, soybeans, wheat, and canola have completely different curves. Commercial meters ship
with dozens of crop calibrations built from thousands of paired oven-dried samples. Variety
and test weight shift things further within a crop.

This is the part that takes seasons, not weekends.

### 4. Excitation frequency

Worth knowing before picking a part. Below ~1 MHz, the reading is dominated by ionic
conduction and surface moisture — you measure the damp skin of the kernel rather than the
water inside it. Real grain meters run in the MHz range for that reason.

That matters because the convenient I²C capacitance-to-digital chips are all low-frequency:

| Part | I²C addr | Excitation | Verdict |
|---|---|---|---|
| TI FDC1004 | 0x50 | 25 kHz | Easy, but wrong frequency band for grain |
| ADI AD7745/6 | 0x48 | 32 kHz | Same |
| Discrete LC oscillator + counter | n/a | 10–30 MHz | More design work, right physics |

**The oscillator approach is likely the better one**, and it has a second benefit — see
below.

## Getting the signal back from the spout

Do **not** run I²C several metres to an auger spout. The bus was designed for traces on one
board; a grain cart has hydraulics, a PTO, and an alternator, and the spout usually folds,
so the cable crosses a hinge that will eventually fail.

Three options, best first:

1. **Self-contained BLE node at the spout.** No cable at all, no hinge wear, no ground loop.
   Powered from cart 12 V. You already have the BLE stack, the app, and a provisioning
   story — this reuses all of it. The scale and the moisture node both report to the phone,
   and the app joins them. This is probably the right answer.
2. **Oscillator at the head, frequency down the cable.** If it must be wired: put the
   sensing element and its oscillator at the spout and send back a square wave. Frequency
   survives cable attenuation and noise far better than I²C, and the nRF52840 counts it on a
   TIMER/COUNTER with essentially zero CPU cost. This is why the oscillator approach wins
   twice.
3. **RS-485 with a small MCU at the head.** Robust over tens of metres, but you're adding a
   second micro and a protocol.

### If it is wired, the bus has room

No address conflict exists. The NAU7802 is 0x2A, the TCA9548A 0x70, the LIS2DH12 0x18/0x19 —
a CDC at 0x48 or 0x50 drops straight onto the main bus. The fixed-address problem that
forced the mux ([MULTI-ADC.md](MULTI-ADC.md)) doesn't apply here.

## Where to mount it

| Location | Density consistency | Abrasion | Retrofit effort |
|---|---|---|---|
| Auger spout | Poor — aerated free fall | Moderate | Easy |
| Auger tube wall | Better — flighting compacts grain | Severe | Moderate |
| Slipstream sample cell | Best — fixed volume, fills and dumps | Low | Hard |

The sample cell is how you get a number you can defend. A diverter fills a small chamber,
the reading is taken on a known volume, the chamber dumps. It's the difference between ±2%
and ±0.5%, and it's mechanical work rather than electronics work.

## What to promise

Being blunt about the achievable, because this is the part that decides whether it's worth
building:

- **Realistic and genuinely useful:** *relative* moisture — "this load is running two points
  wetter than the last one" — with a single-point user calibration against the handheld
  tester they already own. That supports blending and drying decisions, which is most of the
  value, and it's reachable in one season.
- **Hard:** absolute % moisture across crops, competitive with a Dickey-john or GAC. That
  needs a sample cell, per-crop curves, and a multi-season calibration program against
  oven-dried references.

Ship the first, and be clear in the app that it's a trend indication rather than a
grading-grade number. Selling an absolute number you can't back is worse than selling a
relative one you can.

## Firmware fit

Small, and the patterns already exist:

- The status line already carries `batt=`, `batt_v=`, `ext_v=`, `charging=`
  ([virtus_scale.ino:8](../virtus_scale/virtus_scale.ino#L8)). Adding `moist=` and
  `graintemp=` is one more append.
- Calibration already persists in flash with a versioned layout and a migration path
  (`CAL_LAYOUT_VERSION`, [virtus_scale.ino:110](../virtus_scale/virtus_scale.ino#L110)).
  Moisture coefficients extend that struct the same way — bump the version, migrate, done.
- Sampling gates naturally on weight changing, so the sensor is idle unless grain is moving.

## Regulatory note

Moisture affects settlement price. If a number from this device is ever used in a trade
transaction, that's legal-for-trade territory — Measurement Canada here, NIST HB 44 / NTEP
in the US. Farm-internal use for your own blending and drying decisions is unaffected. Keep
the app's language on the trend side of that line.

## Open questions

1. **Which crops matter first?** Calibration is per-crop, so the answer sets the scope.
2. **Cabled or a separate BLE node?** Decides whether this touches the main board at all.
3. **Is a slipstream sample cell acceptable mechanically**, or does it have to read the flow
   in place? This is the accuracy ceiling, decided mechanically rather than electrically.
4. **Do you have access to an oven-dry reference** or a trusted bench meter for building
   calibration curves? Without a reference there's no path past relative indication.
