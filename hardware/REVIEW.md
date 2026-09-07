# V1.0 review — open issues

Findings from reviewing [BOM.csv](BOM.csv) against the firmware and the V1.0 schematic
intent. Nothing here is fabbed yet, so all of it is cheap to fix now.

Ordered by consequence. Items 1–3 change the BOM.

---

## 1. AP2112K EN pin has no pull-up in the BOM — blocking

The AP2112K enable pin is active-high with **no internal pull-up**. Floating EN means the
LDO never turns on and the whole board is dead. There is no resistor in the BOM assigned to
EN, and R3 (1 MΩ) has no stated purpose.

This is the same root cause as the failure on the current board — see the hardware memory
note. Do not let it through twice.

**Fix:** tie EN to VIN directly, or add a 100 kΩ pull-up to VIN. If R3 was *intended* as
that pull-up, 1 MΩ is too weak to be reliable against leakage — change it to 100 kΩ and
label the net.

**Verify in Flux before ordering:** what net is R3 actually on, and what is U2 pin 3 tied to?

## 2. No battery-sense divider — battery % will read nothing

The firmware computes battery percent from an ADC pin
([virtus_scale.ino:392–399](../virtus_scale/virtus_scale.ino#L392)), but on a non-Feather
board `BATT_SENSE_PIN` falls through to `-1`, and the BOM has no divider resistors on VBAT.
The app's battery indicator will be dead on this hardware.

**Fix:** add a 100 kΩ/100 kΩ divider from VBAT to a spare nRF52840 AIN pin (`BATT_DIVIDER`
is already 2.0f for exactly this). A 10 nF cap across the low leg helps the sample settle.
Then set `BATT_SENSE_PIN` in firmware. Two resistors and a cap — do it now, not in V1.1.

**Consider:** a MOSFET to disconnect the divider between reads. At 100 k/100 k the divider
draws ~20 µA continuously, which against a 2000 mAh pack is ~11 mA·day — small, but it is
the largest sleep-current item on the board other than the module.

## 3. No battery protection circuit — safety

The BOM has holders, a charger, and an LDO, but no protection IC (DW01 + dual FET, or
BQ2970/BQ297xx) and no fuse on the pack side. Vapcell H10 14500s are unprotected flat-tops.
That leaves a user-replaceable Li-ion pack with no over-discharge, over-current, or
short-circuit cutoff, in a farm environment.

Parallel cells add a second concern: a user installing one charged and one flat cell gets an
uncontrolled cell-to-cell current through the holders on insertion.

**Fix:** add a protection IC + dual N-FET between the pack and the charge/load node. This is
a ~$0.40 addition and it is the difference between a product you can ship and one you can't.
If you disagree and want to ship without it, say so and I'll leave it — but it should be a
decision, not an omission.

## 4. C8 marked 100 µF, should be 100 nF — already flagged

Your own BOM note catches this: Flux shows 100 µF for the NAU7802 DVDD decoupling. The
[BOM.csv](BOM.csv) line is already corrected to 100 nF (C14663). **Fix it in the Flux
schematic too**, or the exported pick-and-place will disagree with the BOM.

## 5. F1 PTC is undersized for simultaneous charge + run

MF-PSMF050X-2 holds 500 mA and trips at ~1 A. Charging at 500 mA while the MCU runs and
advertises puts steady-state current at or just over the hold threshold, which causes the
PTC to creep warm and its resistance to climb — the symptom is charging that mysteriously
slows down or stalls when the board is awake.

**Fix:** move to a 1.1 A hold part (e.g. MF-PSMF110X). USB-C at 5 V/500 mA still bounds the
real current; the PTC is there for faults, not for current limiting.

## 6. R10/R11 22 Ω series on USB D+/D− — verify against the module

The nRF52840 USB PHY has internal impedance matching, and Nordic's reference designs route
D+/D− straight to the connector with no series resistors. 22 Ω in series is a habit carried
over from other MCUs and can push the eye out of spec.

**Fix:** confirm against the MDBT50Q-1MV2 datasheet's USB reference. If it shows a direct
connection, change R10/R11 to 0 Ω — keep the pads so you can populate them if testing says
otherwise.

## 7. R5 is through-hole in an otherwise SMD design

The 1 kΩ charge-LED resistor is specified as `CR1/4W-1K` through-hole. Everything else is
0603/0402. A single through-hole part adds a hand-solder step to every unit and JLCPCB won't
place it.

**Fix:** change to 0603, e.g. C21190 (1 kΩ).

## 8. Layout constraints for the 2-layer board

Not BOM issues, but decide these before routing:

- **Antenna keepout.** The MDBT50Q's pre-certification only holds if the keepout in Raytac's
  datasheet is respected — no copper, no ground pour, no traces on either layer under and
  around the antenna end of the module. On a 2-layer board this means the ground pour has to
  be deliberately cut back. Getting this wrong forfeits the FCC/IC modular approval, which is
  the main reason to pay for the module.
- **Ground return under the analog path.** J2 → U4 needs continuous ground on the opposite
  layer. Do not let a signal trace cut that return path.
- **L1 placement.** The DC-DC inductor loop should be tight and as far from U4 and J2 as the
  outline allows.
- **Star ground.** Bring the NAU7802 analog ground and the digital/charging ground together
  at one point near the LDO output, not distributed across the pour.

## 9. Reset button needs UICR.PSELRESET programmed, or it does nothing

The hardware is already right: SW1 (SW1AB-480-T50) and R12 (10 kΩ pull-up) are in the BOM,
same arrangement as the Feather Sense, and the nRF52840 uses P0.18 as nRESET on both.

But P0.18 is a **normal GPIO until UICR.PSELRESET is programmed**. The flash script at
[flash_feather.jlink:10–12](../dfu_flash_feather/flash_feather.jlink#L10) writes
BOOTLOADERADDR, the MBR params page, and REGOUT0 — but not PSELRESET. Line 5 is `erase`,
which wipes UICR, so nothing else restores it either. On a fresh custom board the button
will be dead and it will look like a hardware fault.

**Fix:** add both PSELRESET registers to the same UICR block, set to pin 18:

```
w4 0x10001200 0x00000012   # PSELRESET[0] = P0.18
w4 0x10001204 0x00000012   # PSELRESET[1] = P0.18
```

Both must be written — the nRF52840 requires the two to agree before it enables the reset
function. UICR only takes effect after a reset, which line 13 already does.

**Also add:** a 100 nF cap from RESET to GND for debounce. Not currently in the BOM. Keep it
at 100 nF — much larger and it slows the rise enough to interfere with SWD attach on J3.

Note this is a per-board provisioning step, not a firmware change — it re-applies every time
the chip is fully erased.

## 10. Verify the NAU7802's internal LDO can drive a 390 Ω bridge

Applies to the **current V1.0 board**, not just the planned satellite.

The firmware runs the bridge off the NAU7802's *internal* LDO at 3.0 V
([virtus_scale.ino:459](../virtus_scale/virtus_scale.ino#L459), `setLDO(NAU7802_LDO_3V0)`).
Grain-cart cells have 380–400 Ω input resistance, so that internal LDO must source
**~7.7 mA continuously** for excitation, on top of the ADC's own analog draw.

That is in the region where the NAU7802's internal regulator gets marginal. I have not
confirmed the datasheet's LDO load-current limit — **check it before fab**, because if the
LDO can't hold regulation into 390 Ω the symptoms are nasty and non-obvious: extra noise,
thermal drift, and a zero that walks with temperature. It would read plausibly and calibrate
fine on the bench.

Two things make this less alarming than it sounds:

- The measurement is **ratiometric** — REFP/REFN track the excitation rail, and the cal math
  explicitly relies on AVDD cancelling
  ([virtus_scale.ino:156](../virtus_scale/virtus_scale.ino#L156)). Steady sag largely divides
  out. It's LDO *instability*, not sag, that hurts.
- 3.0 V is the lowest excitation the part offers, so the current draw is already at its
  minimum for this bridge.

**If the datasheet says it's marginal**, the fix is to bypass the internal LDO and feed AVDD
from an external rail (the NAU7802 supports this — clear the `AVDDS` bit instead of calling
`setLDO`). On the satellite that's easy: it has a real 3.3 V rail with current to spare. On
the main board it means a dedicated low-noise LDO for AVDD rather than sharing the
AP2112K output with the radio, since the nRF52840's TX current bursts would otherwise land
on the excitation rail.

**Decide this before routing** — an external-AVDD design needs a separate rail and its own
filtering, which is a layout change, not a stuff option.

---

## Suggested order of work

1. Resolve #1 (EN pin) — answer the "what is R3 on" question in Flux first.
2. Add #2 (battery divider) and #3 (protection) to the schematic.
3. Sweep #4–#7 as a batch BOM edit, and settle #9 (PSELRESET) and #10 (AVDD source).
4. Re-export BOM, update [BOM.csv](BOM.csv), then route with #8 in mind.
