# Virtus Scale — Hardware

PCB design for the Virtus Scale BLE load-cell module. Companion to the firmware in
[`virtus_scale/`](../virtus_scale/) and the app in [`native-app/`](../native-app/).

## Current revision

**BLE Module V1.0** — designed in [Flux](https://flux.ai), exported 2026-04-15.
Not yet fabricated. See [REVIEW.md](REVIEW.md) before ordering.

| | |
|---|---|
| Board | 2-layer, 50.8 × 101.6 mm, 1.6 mm, HASL lead-free |
| MCU | Raytac MDBT50Q-1MV2 (nRF52840, pre-certified module) |
| ADC | NAU7802 24-bit, I²C @ 0x2A |
| Accel | LIS2DH12 (motion wake, ~2 µA) |
| Power | USB-C in → MCP73831 charger → AP2112K-3.3 LDO |
| Battery | 2× 14500 Li-ion in parallel (Keystone 2462 holders) |
| Load cell | 4-pin Phoenix spring terminal (J2) |
| Debug | 2×5 1.27 mm SWD (J3) |

## Files

| Path | What |
|---|---|
| [BOM.csv](BOM.csv) | Bill of materials, JLCPCB/LCSC part numbers |
| [DESIGN.md](DESIGN.md) | Architecture, net-level rationale, pin map |
| [REVIEW.md](REVIEW.md) | Open issues found reviewing V1.0 — **read before fab** |
| [MULTI-ADC.md](MULTI-ADC.md) | V1.1 idea: onboard ADC + external 5-cell mux board |
| [MOISTURE.md](MOISTURE.md) | Feasibility of a grain moisture sensor at the auger spout |
| `vendor/` | Original exports from Flux (BOM xlsx) |
| `mech/` | STEP model for enclosure fitting |
| `kicad/` | *(not yet created — see "Moving off Flux" below)* |

## Sourcing

Most parts assemble at JLCPCB. These four must be ordered separately:

- **U3** MDBT50Q-1MV2 — Raytac / Digikey
- **BT1, BT2** Keystone 2462 holders — Digikey `36-2462-ND`
- **J2** Phoenix PTSA 0,5/4-2,5-F — Digikey `1989764`
- Cells: Vapcell H10 1000 mAh 14500 (see the protection note in [REVIEW.md](REVIEW.md))

## Moving off Flux

The Flux project exports a BOM and a STEP but not a portable schematic or netlist, which
makes design review and version control hard. Recreating the schematic in KiCad under
`kicad/` would put the netlist in git and let CI check it. Worth doing before V1.1 — not
required before fabbing V1.0.
