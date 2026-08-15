# Design notes — BLE Module V1.0

## Block diagram

```
USB-C (J1) ──F1 500mA PTC──┬── D1 USBLC6 ESD ── R10/R11 22Ω ── D+/D- ── U3 nRF52840
                           │
                           └── U1 MCP73831 ──┬── BT1‖BT2  2× 14500 Li-ion
                              (500mA, R6=2k) │
                                             └── U2 AP2112K-3.3 ──┬── U3 VDD (module)
                                                                  ├── U4 NAU7802 AVDD/DVDD
                                                                  └── U5 LIS2DH12 VDD

U4 NAU7802 ── internal LDO 3.0V ── excitation ── J2 4-pin ── load cell
U4, U5 ──── I²C (SDA/SCL, R7/R8 4.7k pull-ups) ──── U3
```

## Pin map

Authoritative source is [virtus_scale.ino:41](../virtus_scale/virtus_scale.ino#L41). The PCB
must match these, or the firmware needs new `#define`s.

| nRF52840 | Net | Goes to | Firmware |
|---|---|---|---|
| P0.26 | SDA | U4 pin, U5 pin, R7 pull-up | `I2C_SDA_PIN` |
| P0.27 | SCL | U4 pin, U5 pin, R8 pull-up | `I2C_SCL_PIN` |
| P0.07 | NAU_DRDY | U4 DRDY | `NAU_DRDY_PIN` — routed, unused (firmware polls) |
| P0.06 | ACCEL_INT | U5 INT1 | `ACCEL_INT_PIN` — motion wake, not yet implemented |
| — | VBAT_SENSE | **not present** | `BATT_SENSE_PIN == -1` on this board (see REVIEW #2) |

The firmware ships `SCAN`, `FINDBUS`, and `PINTEST` BLE commands
([virtus_scale.ino:418–549](../virtus_scale/virtus_scale.ino#L418)) specifically to bring up
a new board — `FINDBUS` brute-forces every GPIO pair looking for 0x2A/0x18, so a swapped
SDA/SCL on the first article is recoverable without a rework.

## Analog front end

- NAU7802 at gain 128, 10 SPS, internal LDO set to 3.0 V for load-cell excitation.
- Full-scale input is ±(AVDD/gain). With a 2.0 mV/V cell at rated load the signal is small
  by design — keep the differential pair from J2 to U4 short, matched, and guarded by
  ground pour on both sides.
- C10 (10 µF) bypasses REFP–REFN. Place it hard against the pins.
- Keep the switching edges of the nRF52840 DC-DC (L1) away from the J2→U4 run. On a 2-layer
  board this is the layout constraint that most affects noise floor.

## Power

- **Charge:** MCP73831T-2ACI/OT, R6 = 2 kΩ → 500 mA. Against 2× 1000 mAh in parallel that's
  0.25C. Fine.
- **Regulation:** AP2112K-3.3, 600 mA. Note the EN-pin issue in [REVIEW.md](REVIEW.md) #1 —
  this is the exact failure that killed the previous board.
- **Cells wired in parallel**, per the BOM note. Both holders must see the same net on each
  side; a reversed holder shorts the pack.

## Load-cell connector

J2 is a 4-pole spring terminal: E+, E−, S+, S−. Silkscreen the pin function next to the
terminal — field-replaceable cells get rewired by users, and there is no polarity keying.

## Mechanical

`mech/BLE-Module-V1.0.step` is a Flux assembly export. The bodies are generically named
(`body`, `input_PCB`, `term1`), so it is useful for enclosure fit and connector clearance,
not for design intent. Overall envelope ≈ 125 × 74 × 42 mm including the battery holders
and the terminal block — considerably larger than the 50.8 × 101.6 mm board outline, so
size the enclosure from the STEP rather than the board.
