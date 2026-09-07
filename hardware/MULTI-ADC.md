# Multi-cell expansion — onboard ADC or external mux board

Design notes for the V1.1 idea: one NAU7802 on the main board for single-cell use, plus a
connector that accepts a separately-powered satellite board carrying an I²C mux and five
more NAU7802s.

**Usage is either/or** — the scale runs the onboard ADC, *or* the five on the satellite.
Never both at once. That simplifies the firmware considerably.

## System picture

```
┌─ MAIN ENCLOSURE ─────────────────────┐
│                                      │
│  nRF52840 ─┬─ SDA/SCL ─┬─ NAU7802    │      ┌─ SATELLITE BOARD ──────────┐
│            │           │   (0x2A)    │      │                            │
│            │           │      │      │      │  TCA9548A ─┬─ NAU7802 ─ cell 1
│            │           │      └──────┼──────┼─ bayonet   ├─ NAU7802 ─ cell 2
│            │           │   E+/E-/S+/S-      │  (0x70)    ├─ NAU7802 ─ cell 3
│            │           │  single cell │     │            ├─ NAU7802 ─ cell 4
│            │           │              │     │            └─ NAU7802 ─ cell 5
│            │           └──── J4 ──────┼─────┼── SDA/SCL/GND              │
│            │                          │     │                            │
│  MCP73831 ─┴── VIN ◄──── J4 ──────────┼─────┼── +V out    ◄── EXTERNAL PSU
│      │                                │     │                (mains or 12 V)
│      └── battery (charges from either │     └────────────────────────────┘
│          USB-C or the satellite PSU)  │
└──────────────────────────────────────┘
```

Two pigtails leave the enclosure on **different, non-mateable connectors**:

1. **Load cell** — E+/E−/S+/S−, bayonet connector, for single-cell use.
2. **Expansion** — I²C + power, for the satellite board.

## External power on the satellite: yes, do this

Powering the satellite from its own supply is the right decision and it solves the problem
outright.

Excitation current is set by the cell's **input** resistance — the resistance across E+/E−,
which for grain-cart cells runs 380–400 Ω once the manufacturer's temperature-compensation
resistors are included. (The ~350 Ω figure usually quoted is *output* resistance, across
S+/S−, which doesn't set the excitation draw.) At the 3.0 V the firmware configures:

| | Per cell | 5 cells |
|---|---|---|
| Excitation, 3.0 V / 390 Ω | 7.7 mA | 38.5 mA |
| NAU7802 operating current | ~2.3 mA | 11.5 mA |
| **Satellite 3.3 V rail** | | **~50 mA** |

On the 2000 mAh pack that would have been roughly 40 hours. Off vehicle power it's
irrelevant — 50 mA is nothing to a 1 A buck. It also matches how the thing gets used: five
cells means a fixed platform installation, which is exactly where vehicle power lives.

Referred back to the 5.2 V rail that's ~35 mA, so the satellite's own draw is small next to
the 500 mA it passes up the cable for charging. **The buck is sized by the charger, not by
the cells** — 1 A remains the right choice with comfortable margin.

**The satellite regulates its own 3.3 V locally.** Don't send 3.3 V down the cable from the
main board — send the raw supply and regulate at the satellite, so the cable drop lands on
the input of a regulator instead of on your analog reference.

## Charging the main board from that supply

This is the part that needs care, because you now have **two power sources that can be
present at the same time** — USB-C and the satellite PSU.

### The failure to design out

If the satellite's 5 V reaches the USB-C connector's VBUS pin, you are driving 5 V *out* of
a USB receptacle. That's out of spec, and it can damage a laptop you later plug in. It has
to be impossible, not unlikely.

### The fix: OR the two inputs

```
USB-C VBUS ──F1 PTC──► ideal diode ──┐
                                     ├──► MCP73831 VIN ──► battery
Satellite +V ──fuse──► ideal diode ──┘
```

Either source charges the battery; neither can backfeed the other.

**Use ideal-diode ICs, not Schottkys.** The margin is too thin for plain diodes: the
MCP73831 needs VIN above roughly 4.5 V to reach a 4.2 V full charge, and a Schottky at
500 mA drops 0.3–0.4 V, leaving 4.6 V from a 5 V supply that's already allowed to sag to
4.75 V. Charging would taper early or stall. An LM66100 (SOT-23-6, 1.5 A) drops ~50 mV and
costs about the same as the Schottky. Two of them, one per input.

They also give you reverse-polarity protection on the satellite input for free — worth
having on a farm connector someone will eventually wire backwards.

**Add a fuse on the satellite input.** F1 only protects the USB path.

### Send 5.2 V, not 5.0 V

Set the satellite's buck to **~5.2 V** rather than 5.0 V. Two reasons:

- It absorbs the cable drop. At 500 mA charge current plus the satellite's own draw, ~1 m of
  24 AWG round-trip costs ~0.1 V. Starting at 5.2 V you arrive at the MCP73831 with ~5.05 V
  after the ideal diode — comfortably above the ~4.5 V it needs for a full 4.2 V charge.
- It makes the OR deterministic. When both USB and the satellite are connected, the higher
  rail wins, so external power is preferred and the battery charges from the vehicle rather
  than from a laptop. That's the behaviour you want, and it falls out of the diode OR
  automatically instead of needing logic.

Keep the power pair at 24 AWG or heavier. The MCP73831's 6 V absolute max gives plenty of
headroom above 5.2 V.

## Satellite input: 12 V vehicle power

Vehicle power is the harsh part of this design. A bare buck converter wired to a tractor's
12 V will not survive long. The input stage needs, in order:

```
12 V in ─ fuse ─ reverse-polarity P-FET ─ TVS clamp ─ wide-Vin buck ─ 5.2 V ─┬─ cable to main board
                                                                            └─ 3.3 V LDO ─ mux + 5× ADC
```

**Transients to design against** (ISO 16750-2 / ISO 7637-2 if you want to be formal):

| Event | Level | Consequence |
|---|---|---|
| Load dump | 35–40 V+, hundreds of ms | Destroys an underrated buck outright |
| Jump start | 24 V sustained | A TVS clamping too low cooks itself |
| Cold crank | dips to ~6 V | Buck must keep regulating at low input |
| Reverse polarity | −12 V | Kills everything without protection |

**Pick the buck's voltage rating above the clamp, not at it.** A 60 V part like the LMR16010
(1 A) or LM5164 removes load dump as a concern rather than relying on the TVS to catch every
spike. You need roughly 600 mA at 5.2 V — 500 mA charging plus ~100 mA for the satellite's
own rails — so 1 A is the right size with margin.

**TVS standoff around 30–33 V.** Below that it conducts during a 24 V jump start and
destroys itself. An SMBJ33A pairs correctly with a 60 V buck.

**Reverse polarity: use a P-channel MOSFET**, not a series Schottky. At 600 mA a Schottky
burns ~0.25 W and drops voltage you need; a P-FET costs millivolts.

**Cold crank matters here.** If the buck drops out at 6 V input, charging stops every time
the engine turns over. Both parts above keep regulating well below that.

Keep all of this on the satellite, never in the sealed main enclosure — it isolates the
switching noise from the nRF52840 and the onboard ADC, and it means the main board only ever
sees a clean 5.2 V.

### Grounding caution

The expansion cable ties the main board's ground to vehicle chassis ground. If someone also
plugs USB into a laptop while the satellite is connected, laptop ground and chassis ground
are now bonded through your board. Usually harmless, but it's a path for large currents if
the vehicle has a bad chassis bond — worth a note in the manual, and an argument for keeping
the USB port as a service interface rather than something used in the field.

## Mode detection — no switch needed

With this architecture the mode is self-evident: the satellite is either plugged in or it
isn't. On boot, probe I²C for the TCA9548A at 0x70. Found → external mode, enumerate
channels 0–4. Not found → onboard mode.

Your firmware already has this machinery — `SCAN` probes the bus and `FINDBUS` brute-forces
it ([virtus_scale.ino:418–516](../virtus_scale/virtus_scale.ino#L418)).

Because the satellite carries power into the main board, **satellite power presence is a
second, independent detect signal** — you can sense the ORed input rail and know the
expansion cable is live without any bus traffic. That's a free backstop; it needs one
divider to a spare ADC pin, and you may want that pin anyway for "am I on external power."

Add `MODE:AUTO|INT|EXT` to the existing BLE command set (`CAL`, `SENS`, `CAP`, `RES`) as a
manual override for field diagnosis. No physical switch, and no reset-press gesture — see
[REVIEW.md](REVIEW.md) #9 for why the reset button should stay a plain reset.

## Why the mux is mandatory

Worth restating because it justifies the whole satellite: **the NAU7802's I²C address is
fixed at 0x2A with no address pins** ([virtus_scale.ino:47](../virtus_scale/virtus_scale.ino#L47)).
Five of them cannot share a bus. The choice is "mux, or a different ADC" — and a TCA9548A
8-channel switch is the standard, correct answer.

**Address collision, and why it's a non-issue here.** When a mux channel is open, that
channel's NAU7802 shows up at 0x2A alongside the onboard one. The TCA9548A's control
register resets to 0x00 (all channels closed), so the onboard ADC is reachable by default,
and in external mode the firmware simply never addresses 0x2A with all channels shut. Since
you're not using both at once, this never becomes a live constraint.

## Connectors

### Load-cell pigtail (bayonet)

- 4 conductors: E+, E−, S+, S−. **Use shielded cable.**
- **Terminate the shield at the main board end only.** Grounding both ends creates a ground
  loop through the cell body, which on a µV-level bridge signal is a real noise source.
- Bayonet is a good choice for farm use — positive latching, glove-friendly.

### Expansion pigtail (I²C + power)

| Pin | Net | Note |
|---|---|---|
| 1 | +V from satellite PSU | into the ideal-diode OR |
| 2 | GND | **required** — I²C needs a common reference between the two boards |
| 3 | SDA | |
| 4 | SCL | |
| 5 | *(optional)* DETECT | tie to GND on satellite; skippable given the 0x70 probe |

Four conductors is the minimum and matches how you pictured it. The fifth is optional.

### The two connectors must be physically non-mateable

You already said "a different connector" — hold that line, and make it impossible rather
than merely inconvenient. If someone can plug the expansion pigtail into the load-cell
bayonet, they put the supply rail straight onto the NAU7802's differential inputs and kill
it. Different shell size or different keying, not just different colour.

## I²C over a cable

The bus was designed for traces on one board. Between two enclosures it needs help:

- **Drop to 100 kHz.** The NAU7802 tops out at 400 kHz anyway and you're sampling at 10 SPS.
- **Pull-ups on the main board only** (R7/R8, 4.7 kΩ). This matters more now that the
  satellite is independently powered: if the satellite had its own pull-ups and were live
  while the main board was off, it would backfeed the main 3.3 V rail through the
  nRF52840's ESD diodes. Leave them off the satellite entirely.
- **ESD-protect SDA/SCL at the connector** with a low-capacitance TVS array. You already do
  this for USB with D1 (USBLC6-2SC6). A cable leaving the enclosure on a farm *will* take
  static hits — this is not optional.
- **22–33 Ω series resistors** on SDA/SCL at the connector to damp ringing.
- **Budget 400 pF of bus capacitance**; cable runs 50–100 pF/m. At the planned **under 1 m**
  this is comfortable at 100 kHz with no buffer. Leave an unpopulated LTC4311 footprint at
  the satellite end anyway — if the run ever grows past ~1 m it's a part to place, not a
  respin.
- **Twist SDA and SCL with the ground return** in the cable, and keep the power pair as its
  own twisted pair. The satellite's buck is switching a metre away from a µV-level analog
  front end; don't run its supply current alongside the bus lines untwisted.

## Sealing

Two pigtails are two leak paths. Use moulded pigtails with the gland integral to the
enclosure wall rather than panel connectors with a separate seal, and specify the IP rating
you're targeting before picking parts — it constrains the connector choice more than
anything else here.

## Alternative considered: SPI instead of a mux

An ADS1220 or ADS1232 on SPI gives each ADC its own chip-select, needing no mux. Rejected
because it discards the NAU7802 driver, the calibration path, and a proven analog front end,
to solve a problem the TCA9548A already solves for about a dollar. Recorded so it isn't
re-litigated later.

## Decisions made

- **Supply:** 12 V vehicle power, bucked to 5.2 V on the satellite.
- **Cells:** grain-cart type, 380–400 Ω input resistance → ~50 mA on the satellite 3.3 V rail.
- **Cable:** under 1 m. No bus buffer; LTC4311 footprint left unpopulated.
- **Usage:** either/or — onboard ADC or the five on the satellite, never both.
- **Mode select:** automatic (probe 0x70), with a `MODE:` BLE override. No switch, no
  reset gesture.

## Open questions

1. **Can the NAU7802's internal LDO source 7.7 mA per channel?** See [REVIEW.md](REVIEW.md)
   #10 — this affects the existing V1.0 board too, not just the satellite.
2. **Target IP rating** — constrains both connectors more than any other requirement.
3. **Is the satellite in the same weather exposure as the main enclosure?** If it sits in a
   junction box on the platform, its sealing requirement may be lighter.
4. **Fused at the vehicle end too?** An inline fuse at the battery tap is standard practice
   for vehicle-powered accessories and is separate from the fuse on the satellite board.
