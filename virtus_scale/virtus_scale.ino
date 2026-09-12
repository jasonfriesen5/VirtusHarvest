// ═══════════════════════════════════════════════════════════════════
//  Virtus Scale — nRF52840 + NAU7802 load-cell firmware
//
//  Speaks the Virtus Cart app protocol over Nordic UART Service:
//    TX (scale → app), newline-terminated:
//      P:<net>,L:<gross>,S:<stable 0/1>,U:0
//      INFO:firmware=x.y.z,model=VirtusScale,serial=XXXXXX
//      STATUS:batt=87,batt_v=3.92,ext_v=12.4,charging=0
//    RX (app → scale):
//      TARE / ZERO / CAL:<f> / SENS:<mV/V> / CAP:<kg> / RESTORE
//      INFO / STATUS / FIRMWARE / OTA_CHECK / RESET
//      SCAN / PINTEST / FINDBUS   (bring-up diagnostics)
//
//  Board:  Adafruit nRF52 core (tested target: pca10056 / nRF52840)
//  Libs:   Adafruit Bluefruit (bundled with core),
//          SparkFun Qwiic Scale NAU7802
// ═══════════════════════════════════════════════════════════════════

#include <Adafruit_TinyUSB.h>
#include <bluefruit.h>
#include <Wire.h>
#include <SparkFun_Qwiic_Scale_NAU7802_Arduino_Library.h>
#include <Adafruit_LittleFS.h>
#include <InternalFileSystem.h>
#ifdef PIN_NEOPIXEL
  #include <Adafruit_NeoPixel.h>
#endif
#include "uECC.h"      // ECDSA P-256 signing for the app<->scale auth handshake
#include "sha256.h"

// ───────────────────────── CONFIG ─────────────────────────
#define FIRMWARE_VERSION   "1.7.5"
#define MODEL_NAME         "VirtusScale"
#define BLE_NAME           "Virtus Scale"   // advertised name (app scans by NUS UUID + name prefix)
#define MAX_CONNECTIONS    4                // simultaneous BLE clients

// I2C pins the NAU7802 is wired to. Defaults to the selected board's
// standard Wire pins: on the pca10056 target that's P0.26/P0.27 (the
// custom Virtus board routing), on a Feather nRF52840 it's the pins
// labeled SDA/SCL. Override with explicit numbers for custom routing.
#define I2C_SDA_PIN        PIN_WIRE_SDA    // custom board: 26 = P0.26
#define I2C_SCL_PIN        PIN_WIRE_SCL    // custom board: 27 = P0.27
#define NAU_DRDY_PIN       7               // P0.07 — wired but unused (I2C polling)
#define ACCEL_INT_PIN      6               // P0.06 — LIS2DH12 INT1, future motion wake

// NAU7802 is I2C-only, fixed address 0x2A
#define NAU_ADDR           0x2A
#define NAU_GAIN           NAU7802_GAIN_128
#define NAU_LDO            NAU7802_LDO_3V0  // LDO output feeding the load cell
#define NAU_RATE           NAU7802_SPS_10

// Battery sense. Boards whose variant defines PIN_VBAT (Feather
// nRF52840 / Sense: onboard 100k/100k divider) are detected
// automatically; otherwise set an analog pin here, or -1 for none.
// DIVIDER = Vbat / Vpin (2.0 for a 100k/100k divider).
#if defined(PIN_VBAT)
  #define BATT_SENSE_PIN   PIN_VBAT
#else
  #define BATT_SENSE_PIN   -1
#endif
#define BATT_DIVIDER       2.0f

// Defaults used until the app pushes CAL/SENS/CAP (kept in flash)
#define DEFAULT_SENS_MVV   2.0f      // load-cell sensitivity, mV/V
#define DEFAULT_CAPACITY   1000.0f   // rated capacity, kg
#define DEFAULT_CALFACTOR  1.0f
#define DEFAULT_RESOLUTION 1.0f      // reported weight rounds to this (kg).
                                     // 1 kg = full precision sent to the app;
                                     // the app then applies the user's chosen
                                     // Display Rounding (1/2/5/10) for the big
                                     // number. Change at runtime with RES:<kg>.

// Stability: reading is "stable" when the spread of the last
// STABLE_WINDOW readings is under STABLE_BAND (kg)
#define STABLE_WINDOW      8
#define STABLE_BAND        0.5f

// ─────────────────────── GLOBALS ───────────────────────
NAU7802 nau;
BLEUart  bleuart;
BLEDis   bledis;
BLEDfu   bledfu;    // OTA DFU entry service — lets nRF Connect flash updates
#ifdef PIN_NEOPIXEL
Adafruit_NeoPixel statusPixel(NEOPIXEL_NUM, PIN_NEOPIXEL, NEO_GRB + NEO_KHZ800);
#endif

// Status LED: brief flash so average power stays tiny.
//   yellow heartbeat every 10 s = powered, no client
//   double green flash          = a client just connected
//   green heartbeat every 10 s  = connected
void blinkPixel(uint8_t r, uint8_t g, uint8_t b, uint8_t count) {
#ifdef PIN_NEOPIXEL
  for (uint8_t i = 0; i < count; i++) {
    statusPixel.setPixelColor(0, statusPixel.Color(r, g, b));
    statusPixel.show();
    delay(40);
    statusPixel.clear();
    statusPixel.show();
    if (i + 1 < count) delay(140);
  }
#else
  (void)r; (void)g; (void)b; (void)count;
#endif
}

using namespace Adafruit_LittleFS_Namespace;
#define CAL_FILE "/virtus_cal.dat"

#define CAL_MAGIC          0x56495254UL   // "VIRT"
#define CAL_LAYOUT_VERSION 2

// Layout as shipped through v1.7.4. Kept only so an existing file can be
// migrated on first boot of a newer build instead of being discarded — losing a
// customer's calibration during a firmware update would be silent and would
// show up as a scale that quietly reads wrong.
struct CalDataV1 {
  uint32_t magic;
  float    calFactor;
  float    sensMvV;
  float    capacity;
  int32_t  tareOffset;
  float    resolution;
};

struct CalData {
  uint32_t magic;          // CAL_MAGIC when valid
  uint16_t layoutVer;      // bump CAL_LAYOUT_VERSION on ANY field change
  uint16_t reserved;       // keeps the floats below 4-byte aligned
  float    calFactor;
  float    sensMvV;
  float    capacity;
  int32_t  tareOffset;     // raw counts at zero
  float    resolution;     // reported weight rounds to this (kg)
};
CalData cal;

float   countsPerKg   = 1.0f;
int32_t rawFiltered   = 0;
bool    haveReading   = false;
bool    nauReady      = false;
bool    nauSleeping   = false;   // NAU7802 parked in low-power while no BLE client
bool    appPowerSave  = false;   // app asked us to idle (SLEEP) while still connected
int32_t primaryConn   = -1;      // conn handle of the logging PRIMARY client (-1 = none)
uint32_t rolesDueAt   = 0;       // when to (re)broadcast ROLE messages
uint32_t lastRoleBcast= 0;       // last periodic role broadcast
uint32_t lastNauRetry = 0;
float   recentNet[STABLE_WINDOW];
uint8_t recentIdx     = 0;
uint8_t recentCount   = 0;
char    serialNum[13];
String  rxLine;
uint32_t lastStatusMs = 0;
uint32_t lastSampleMs = 0;   // last successful NAU7802 conversion

// ─────────────────────── CALIBRATION MATH ───────────────────────
// Full-scale ADC input is ±(AVDD/gain); cell output at rated load is
// sens(mV/V) × AVDD. AVDD cancels:  counts@rated = sens·gain/1000 · 2^23
void recomputeScale() {
  float sens = (cal.sensMvV  > 0.01f) ? cal.sensMvV  : DEFAULT_SENS_MVV;
  float capk = (cal.capacity > 0.01f) ? cal.capacity : DEFAULT_CAPACITY;
  countsPerKg = (sens * 128.0f / 1000.0f) * 8388608.0f / capk;
}

void calDefaults() {
  cal.magic      = CAL_MAGIC;
  cal.layoutVer  = CAL_LAYOUT_VERSION;
  cal.reserved   = 0;
  cal.calFactor  = DEFAULT_CALFACTOR;
  cal.sensMvV    = DEFAULT_SENS_MVV;
  cal.capacity   = DEFAULT_CAPACITY;
  cal.tareOffset = 0;
  cal.resolution = DEFAULT_RESOLUTION;
}

void calSave() {
  InternalFS.remove(CAL_FILE);
  File f(InternalFS);
  if (f.open(CAL_FILE, FILE_O_WRITE)) {
    f.write((uint8_t*)&cal, sizeof(cal));
    f.close();
  }
}

void calLoad() {
  // Read into a scratch buffer, not straight over `cal`: a stale or truncated
  // file would otherwise leave half-written values behind when validation fails.
  uint8_t buf[64];
  int got = 0;
  File f(InternalFS);
  if (f.open(CAL_FILE, FILE_O_READ)) {
    got = f.read(buf, sizeof(buf));
    f.close();
  }

  bool ok = false;
  if (got == (int)sizeof(CalData)) {
    CalData* d = (CalData*)buf;
    if (d->magic == CAL_MAGIC && d->layoutVer == CAL_LAYOUT_VERSION) { cal = *d; ok = true; }
  } else if (got == (int)sizeof(CalDataV1)) {
    // Pre-1.7.5 file: carry the calibration across and rewrite in the new
    // layout, so an OTA from 1.7.4 keeps the scale calibrated.
    CalDataV1* v1 = (CalDataV1*)buf;
    if (v1->magic == CAL_MAGIC) {
      calDefaults();
      cal.calFactor  = v1->calFactor;
      cal.sensMvV    = v1->sensMvV;
      cal.capacity   = v1->capacity;
      cal.tareOffset = v1->tareOffset;
      cal.resolution = v1->resolution;
      calSave();
      ok = true;
    }
  }
  if (!ok) calDefaults();
  if (cal.resolution < 0.01f || cal.resolution > 1000.0f) cal.resolution = DEFAULT_RESOLUTION;
  recomputeScale();
}

// ─────────────────────── BLE OUTPUT ───────────────────────
bool bleReady = false;   // true once Bluefruit.begin() has succeeded

// fan out to every connected client that enabled notifications.
// BLEUart::write sends ONE notification per call and silently drops
// anything longer than the connection MTU allows — so slice every
// line into MTU-sized chunks (clients reassemble on the newline).
// Reliable per-connection write. A long line (e.g. the 167-char AUTHR reply)
// gets split into MTU-sized chunks; on a busy/second connection — or a stack
// that negotiated a small MTU, like Windows — firing them back-to-back can
// overrun the radio's TX queue and drop a chunk. So we check each write's
// result and retry (with a small gap) until the whole line is out. This is
// what makes multi-device auth reliable.
static void bleWriteChunks(uint16_t h, const uint8_t* p, size_t total) {
  BLEConnection* conn = Bluefruit.Connection(h);
  size_t maxChunk = conn ? (size_t)(conn->getMtu() - 3) : 20;
  size_t off = 0;
  uint32_t stuckSince = millis();
  while (off < total) {
    size_t n = total - off; if (n > maxChunk) n = maxChunk;
    uint16_t wrote = bleuart.write(h, p + off, n);
    if (wrote == 0) {                       // TX queue full — let it flush
      if (millis() - stuckSince > 600) break;
      delay(4);
      continue;
    }
    off += wrote;
    stuckSince = millis();
    delay(2);                               // gap so each notification flushes
  }
}

void bleSend(const String& s) {
  if (bleReady) {
    String line = s + "\n";
    const uint8_t* p = (const uint8_t*)line.c_str();
    size_t total = line.length();
    for (uint16_t h = 0; h < BLE_MAX_CONNECTION; h++) {
      if (!Bluefruit.connected(h) || !bleuart.notifyEnabled(h)) continue;
      bleWriteChunks(h, p, total);
    }
  }
  Serial.println(s);
}

// Send to a single connection (used for per-client ROLE assignment)
void bleSendTo(uint16_t h, const String& s) {
  if (!bleReady) return;
  if (!Bluefruit.connected(h) || !bleuart.notifyEnabled(h)) return;
  String line = s + "\n";
  bleWriteChunks(h, (const uint8_t*)line.c_str(), line.length());
}

// ── PRIMARY / REMOTE role arbitration ──
// The scale is the single authority: the first client to connect is the
// PRIMARY (the one allowed to log transactions / auto-unload); every other
// client is a view-only REMOTE. This prevents two phones both saving the same
// unload. Roles are pushed to each client so the app can enforce them.
int32_t firstConnectedExcept(int32_t except) {
  for (uint16_t h = 0; h < BLE_MAX_CONNECTION; h++) {
    if ((int32_t)h == except) continue;
    if (Bluefruit.connected(h)) return (int32_t)h;
  }
  return -1;
}
void ensurePrimary() {
  // If the primary slot is empty or its client has gone, promote the
  // first remaining connected client.
  if (primaryConn < 0 || !Bluefruit.connected((uint16_t)primaryConn)) {
    primaryConn = firstConnectedExcept(-1);
  }
}
void broadcastRoles() {
  ensurePrimary();
  for (uint16_t h = 0; h < BLE_MAX_CONNECTION; h++) {
    if (!Bluefruit.connected(h) || !bleuart.notifyEnabled(h)) continue;
    bleSendTo(h, ((int32_t)h == primaryConn) ? "ROLE:primary" : "ROLE:remote");
  }
}

// Request a connection interval (units of 1.25 ms) on every live connection.
void setAllConnInterval(uint16_t units) {
  for (uint16_t h = 0; h < BLE_MAX_CONNECTION; h++) {
    if (!Bluefruit.connected(h)) continue;
    BLEConnection* c = Bluefruit.Connection(h);
    if (c) c->requestConnectionParameter(units);
  }
}

// ── App<->scale authentication (anti-clone) ──
// The scale proves it is genuine by signing the app's random challenge with
// this device private key (ECDSA P-256). The app verifies with the matching
// public key it carries. A counterfeit scale has no way to produce the key.
static const uint8_t AUTH_PRIV[32] = {
  0x27,0xd2,0x13,0x03,0x66,0xf4,0xea,0xf2,0x50,0xed,0x55,0x4a,0xdd,0x09,0x75,0x62,
  0xbe,0xe4,0x64,0x11,0x35,0xc1,0xac,0x3c,0x64,0xe9,0x6f,0x82,0xae,0x8a,0x60,0xaa
};
// uECC RNG — the nRF hardware RNG via the SoftDevice.
extern "C" int auth_rng(uint8_t* dest, unsigned size) {
  while (size) {
    uint8_t avail = 0;
    sd_rand_application_bytes_available_get(&avail);
    if (avail == 0) continue;
    uint8_t n = size < avail ? size : avail;
    if (sd_rand_application_vector_get(dest, n) != NRF_SUCCESS) continue;
    dest += n; size -= n;
  }
  return 1;
}
static int authHexVal(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return 0;
}
static int authHexToBytes(const String& s, uint8_t* out, int maxOut) {
  int n = s.length() / 2; if (n > maxOut) n = maxOut;
  for (int i = 0; i < n; i++) out[i] = (authHexVal(s[2*i]) << 4) | authHexVal(s[2*i+1]);
  return n;
}
static String authBytesToHex(const uint8_t* b, int n) {
  static const char H[] = "0123456789abcdef";
  String s; s.reserve(n * 2);
  for (int i = 0; i < n; i++) { s += H[b[i] >> 4]; s += H[b[i] & 0xF]; }
  return s;
}
// Reply "AUTHR:<nonceHex>:<sigHex>" — the nonce is echoed so each connected
// app matches the answer to its own challenge (broadcast is fine).
void handleAuth(const String& nonceHex) {
  uint8_t nonce[64];
  int nl = authHexToBytes(nonceHex, nonce, sizeof(nonce));
  if (nl < 8) { bleSend("AUTHR:" + nonceHex + ":err"); return; }
  uint8_t hash[32]; sha256(nonce, nl, hash);
  uint8_t sig[64];
  if (uECC_sign(AUTH_PRIV, hash, 32, sig, uECC_secp256r1())) {
    bleSend("AUTHR:" + nonceHex + ":" + authBytesToHex(sig, 64));
  } else {
    bleSend("AUTHR:" + nonceHex + ":err");
  }
}

void sendInfo() {
  bleSend(String("INFO:firmware=") + FIRMWARE_VERSION +
          ",model=" + MODEL_NAME + ",serial=" + serialNum +
          ",cal=" + String(cal.calFactor, 4) +
          ",sens=" + String(cal.sensMvV, 2) +
          ",cap=" + String(cal.capacity, 0) +
          ",res=" + String(cal.resolution, 1));
}

// Single-cell LiPo state-of-charge from resting voltage. Real LiPo
// discharge is flat through the middle and steep at the ends, so a
// piecewise curve tracks true remaining capacity far better than a
// straight 3.3–4.2 V line.
int lipoPercent(float v) {
  static const float vt[] = {3.30f,3.50f,3.60f,3.70f,3.75f,3.80f,3.85f,3.90f,3.95f,4.00f,4.10f,4.20f};
  static const float pt[] = {0,    5,    12,   30,   42,   55,   66,   76,   84,   90,   96,   100};
  const int n = 12;
  if (v <= vt[0])   return 0;
  if (v >= vt[n-1]) return 100;
  for (int i = 1; i < n; i++) {
    if (v < vt[i]) {
      float f = (v - vt[i-1]) / (vt[i] - vt[i-1]);
      return (int)(pt[i-1] + f * (pt[i] - pt[i-1]) + 0.5f);
    }
  }
  return 100;
}

void sendStatus() {
  String s = "STATUS:";
  if (BATT_SENSE_PIN >= 0) {
    analogReference(AR_INTERNAL);      // 0.6 V ref × gain 1/6 → 3.6 V range
    analogReadResolution(12);
    // average a few samples to steady the reading
    uint32_t acc = 0;
    for (uint8_t i = 0; i < 8; i++) acc += analogRead(BATT_SENSE_PIN);
    float vpin = (acc / 8.0f) * 3.6f / 4095.0f;
    float vbat = vpin * BATT_DIVIDER;
    int pct = constrain(lipoPercent(vbat), 0, 100);
    s += "batt=" + String(pct) + ",batt_v=" + String(vbat, 2) + ",";
  }
  s += "charging=0";
  bleSend(s);
}

// ─────────────────────── I2C BRING-UP HELPERS ───────────────────────
// nRF52 TWIM cannot do the classic 0-byte-write address probe — a
// documented hardware limitation (zero-length transfers generate no
// completion events), so all detection here probes with a 1-byte READ.
bool i2cProbe(uint8_t addr) {
  bool present = (Wire.requestFrom(addr, (size_t)1) == 1);
  while (Wire.available()) Wire.read();
  return present;
}

// Walks the whole bus and reports every device that ACKs a read.
void i2cScan() {
  uint8_t found = 0;
  bleSend(String("SCAN: SDA=P") + I2C_SDA_PIN + " SCL=P" + I2C_SCL_PIN + " (read-probe) ...");
  for (uint8_t addr = 1; addr < 127; addr++) {
    if (i2cProbe(addr)) {
      found++;
      const char* who = "";
      if (addr == NAU_ADDR) who = "  <-- NAU7802";
      if (addr == 0x18 || addr == 0x19) who = "  <-- LIS2DH12";
      // Feather nRF52840 Sense onboard sensors, for reference-rig tests
      if (addr == 0x6A) who = "  <-- LSM6DS33 (Feather IMU)";
      if (addr == 0x1C) who = "  <-- LIS3MDL (Feather mag)";
      if (addr == 0x44) who = "  <-- SHT31 (Feather humidity)";
      if (addr == 0x39) who = "  <-- APDS9960 (Feather light)";
      if (addr == 0x77) who = "  <-- BMP280 (Feather pressure)";
      bleSend(String("SCAN: device at 0x") + String(addr, HEX) + who);
    }
  }
  if (!found) {
    // raw write-probe error code, to tell failure modes apart
    Wire.beginTransmission(NAU_ADDR);
    uint8_t e = Wire.endTransmission();
    bleSend(String("SCAN: no devices found (0x2A write-err=") + e +
            ", 2=addr NACK: check wiring/power, 4=bus error: check SDA/SCL lines)");
  }
}

bool nauInit() {
  if (!i2cProbe(NAU_ADDR)) return false;   // chip must ACK a real read first

  // The library's begin() gates on a 0-byte-write ACK check that can
  // false-fail on nRF52 TWIM. It binds the Wire port before that check,
  // so when the read-probe above already proved the chip is present,
  // fall back to running its init sequence manually.
  if (!nau.begin(Wire)) {
    bleSend("NAU7802: begin() probe failed (nRF52 0-byte write) — manual init");
    nau.reset();
    delay(10);
    if (!nau.powerUp()) {
      bleSend("NAU7802 ACKs reads but power-up failed");
      return false;
    }
  }
  nau.setLDO(NAU_LDO);
  nau.setGain(NAU_GAIN);
  nau.setSampleRate(NAU_RATE);
  nau.calibrateAFE();            // re-cal analog front end after config
  haveReading = false;
  recentCount = 0;
  lastSampleMs = millis();
  bleSend(String("NAU7802 ready (revision 0x") + String(nau.getRevisionCode(), HEX) + ")");
  return true;
}

// FINDBUS: brute-force every plausible GPIO pair as SDA/SCL and probe
// for the NAU7802 (0x2A) and LIS2DH12 (0x18/0x19). If the sensors are
// wired to ANY pins, this finds them; if it hits nothing anywhere, the
// chips are not ACKing at all (power/solder) regardless of pin choice.
bool findbusSkip(uint8_t p) {
  return p == 0 || p == 1 ||          // P0.00/P0.01: 32 kHz crystal
         p == 9 || p == 10 ||         // P0.09/P0.10: NFC antenna by default
         p == 18;                     // P0.18: reset
}

void findBus() {
  bleSend("FINDBUS: sweeping all pin pairs, probing 0x2A/0x18/0x19 ...");
  int hits = 0, tested = 0;
  for (uint8_t sda = 2; sda < PINS_COUNT; sda++) {
    if (findbusSkip(sda)) continue;
    for (uint8_t scl = 2; scl < PINS_COUNT; scl++) {
      if (scl == sda || findbusSkip(scl)) continue;

      // I2C needs both lines idle-high; a stuck-low net can hang TWIM,
      // so check levels with pull-ups before committing the peripheral
      pinMode(sda, INPUT_PULLUP);
      pinMode(scl, INPUT_PULLUP);
      delayMicroseconds(50);
      bool ok = digitalRead(sda) && digitalRead(scl);
      pinMode(sda, INPUT);
      pinMode(scl, INPUT);
      if (!ok) continue;

      Wire.end();
      Wire.setPins(sda, scl);
      Wire.begin();
      tested++;
      bool nauHit = i2cProbe(NAU_ADDR);
      bool accHit = i2cProbe(0x18) || i2cProbe(0x19);
      if (nauHit || accHit) {
        hits++;
        bleSend(String("FINDBUS: HIT  SDA=P") + sda + " SCL=P" + scl +
                (nauHit ? "  NAU7802" : "") + (accHit ? "  LIS2DH12" : ""));
      }
    }
  }
  Wire.end();
  Wire.setPins(I2C_SDA_PIN, I2C_SCL_PIN);
  Wire.begin();
  if (hits) {
    bleSend(String("FINDBUS: done, ") + hits +
            " hit(s) — set I2C_SDA_PIN/I2C_SCL_PIN to the pair above");
  } else {
    bleSend(String("FINDBUS: ") + tested + " pairs tested, no ACK anywhere — "
            "sensors are unpowered or not soldered (hardware, not pins)");
  }
}

// PINTEST: takes over SDA/SCL as plain GPIO so the nets can be
// verified with a multimeter at the sensor pads, then restores I2C.
void pinTest() {
  Wire.end();

  // idle level with no pulls: 1 = external pull-up (or short to VDD)
  pinMode(I2C_SDA_PIN, INPUT);
  pinMode(I2C_SCL_PIN, INPUT);
  delay(5);
  bleSend(String("PINTEST: floating levels  SDA=") + digitalRead(I2C_SDA_PIN) +
          " SCL=" + digitalRead(I2C_SCL_PIN) + "  (1=pulled up, 0=low/floating)");

  pinMode(I2C_SDA_PIN, OUTPUT);
  pinMode(I2C_SCL_PIN, OUTPUT);
  bleSend("PINTEST: toggling 10 s — probe SDA/SCL at the SENSOR pads");
  for (int i = 0; i < 10; i++) {
    bool sdaHigh = (i % 2) == 0;
    digitalWrite(I2C_SDA_PIN, sdaHigh);
    digitalWrite(I2C_SCL_PIN, !sdaHigh);
    bleSend(String("PINTEST: SDA=") + (sdaHigh ? "3.3V" : "0V") +
            "  SCL=" + (sdaHigh ? "0V" : "3.3V"));
    delay(1000);
  }

  pinMode(I2C_SDA_PIN, INPUT);
  pinMode(I2C_SCL_PIN, INPUT);
  Wire.setPins(I2C_SDA_PIN, I2C_SCL_PIN);
  Wire.begin();
  bleSend("PINTEST: done — I2C restored");
}

// ─────────────────────── COMMANDS ───────────────────────
void handleCommand(String cmd) {
  cmd.trim();
  if (!cmd.length()) return;
  Serial.println("CMD: " + cmd);

  if (cmd == "TARE" || cmd == "ZERO") {
    if (haveReading) {
      cal.tareOffset = rawFiltered;
      calSave();
      recentCount = 0;               // stability resets after tare
      bleSend("TARE_OK");
    }
  }
  else if (cmd.startsWith("CAL:")) {
    float f = cmd.substring(4).toFloat();
    if (f > 0.0001f) { cal.calFactor = f; calSave(); bleSend("CAL_OK"); }
  }
  else if (cmd.startsWith("SENS:")) {
    float f = cmd.substring(5).toFloat();
    if (f > 0.01f) {
      cal.sensMvV = f; recomputeScale(); calSave();
      bleSend("SENS_OK");
      sendInfo();             // resync the app with authoritative values
    }
  }
  else if (cmd.startsWith("CAP:")) {
    float f = cmd.substring(4).toFloat();
    if (f > 0.01f) {
      cal.capacity = f; recomputeScale(); calSave();
      bleSend("CAP_OK");
      sendInfo();             // resync the app with authoritative values
    }
  }
  else if (cmd.startsWith("RES:")) {
    float f = cmd.substring(4).toFloat();
    if (f >= 0.01f && f <= 1000.0f) { cal.resolution = f; calSave(); bleSend("RES_OK"); }
  }
  else if (cmd == "RESTORE") {
    calDefaults();
    recomputeScale();
    calSave();
    bleSend("RESTORE_OK");
    sendInfo();               // resync the app with factory values
  }
  else if (cmd == "SCAN")                      i2cScan();
  else if (cmd == "PINTEST")                   pinTest();
  else if (cmd == "FINDBUS")                   findBus();
  else if (cmd == "INFO" || cmd == "FIRMWARE") sendInfo();
  else if (cmd == "STATUS")                    sendStatus();
  else if (cmd == "OTA_CHECK")                 bleSend("OTA_UP_TO_DATE");
  else if (cmd.startsWith("OTA_BEGIN"))        bleSend("OTA_ERR:use nRF52 DFU, not BLE-UART OTA");
  else if (cmd == "DFU") {
    // Enter the Nordic Secure-DFU bootloader for a wireless firmware
    // update (GPREGRET = 0xB1 = enter-DFU magic, then reset).
    bleSend("Entering DFU mode…");
    delay(200);
    sd_power_gpregret_clr(0, 0xFF);
    sd_power_gpregret_set(0, 0xB1);
    NVIC_SystemReset();
  }
  else if (cmd == "RESET")                     NVIC_SystemReset();
  else if (cmd == "SLEEP") {
    // App-requested power saving: stay connected but park the ADC, idle the
    // loop, AND stretch the connection interval way out so the radio barely
    // wakes. Saves module battery when the phone's screen has been inactive.
    appPowerSave = true;
    if (nauReady && !nauSleeping) { nau.powerDown(); nauSleeping = true; }
    setAllConnInterval(400);         // ~500 ms while asleep
    bleSend("STATUS:powersave=1");
  }
  else if (cmd == "WAKE") {
    appPowerSave = false;
    setAllConnInterval(96);          // back to ~120 ms responsive
    bleSend("STATUS:powersave=0");   // loop re-inits the NAU on the next pass
  }
  else if (cmd == "HANDOFF") {
    // Current primary steps down — promote another connected client (if any).
    int32_t other = firstConnectedExcept(primaryConn);
    if (other >= 0) primaryConn = other;
    rolesDueAt = millis() + 50;      // re-broadcast the new assignment
  }
  else if (cmd.startsWith("AUTH:")) {
    handleAuth(cmd.substring(5));    // sign the app's challenge, prove genuine
  }
}

void pollBleRx() {
  while (bleuart.available()) {
    char c = (char)bleuart.read();
    if (c == '\n' || c == '\r') {
      handleCommand(rxLine);
      rxLine = "";
    } else if (rxLine.length() < 64) {
      rxLine += c;
    }
  }
}

// ─────────────────────── SETUP ───────────────────────
// advertising stops when a client connects — flag a restart so the
// next client can also find us. The restart happens in loop(), not
// here: calling Advertising.start() from inside the BLE event
// callback can race the connection setup.
volatile bool advRestartPending = false;
volatile uint32_t infoDueAt = 0;   // when to volunteer INFO+STATUS after a connect

void connectCallback(uint16_t conn_hdl) {
  (void)conn_hdl;
  advRestartPending = true;
  // First client in becomes primary; the assignment is (re)broadcast a moment
  // later once the notification pipe is open.
  if (primaryConn < 0) primaryConn = (int32_t)conn_hdl;
  // the app's own INFO/STATUS request often races the notification
  // setup and its one-shot reply gets lost — send them unsolicited
  // once the pipe has had time to open
  infoDueAt = millis() + 2500;
  rolesDueAt = millis() + 2600;
}

void disconnectCallback(uint16_t conn_hdl, uint8_t reason) {
  (void)reason;
  // If the primary left, free the slot so another client is promoted on the
  // next broadcast.
  if ((int32_t)conn_hdl == primaryConn) primaryConn = -1;
  rolesDueAt = millis() + 400;
}

void setup() {
  Serial.begin(115200);

  snprintf(serialNum, sizeof(serialNum), "%08lX",
           (unsigned long)NRF_FICR->DEVICEID[0]);

  InternalFS.begin();
  calLoad();

  // NAU7802 init — setPins must come before begin
  Wire.setPins(I2C_SDA_PIN, I2C_SCL_PIN);
  Wire.begin();
  i2cScan();
  nauReady = nauInit();
  if (!nauReady) Serial.println("ERR: NAU7802 not found at 0x2A — retrying in loop");

  // BLE init
  bleReady = Bluefruit.begin(MAX_CONNECTIONS, 0);
  Serial.println(bleReady ? "BLE stack started"
                          : "ERR: BLE stack failed to start (connection count too high?)");

  // ── Power saving ──
  // Run the radio through the internal DC/DC switching regulator (~halves
  // radio current vs the LDO). The module has the required inductor.
  sd_power_dcdc_mode_set(NRF_POWER_DCDC_ENABLE);
  // 0 dBm is plenty for a phone a couple metres away in the cab and draws
  // less than the +4 dBm max.
  Bluefruit.setTxPower(0);
  // Ask for a relaxed connection interval (90–150 ms). The radio wakes far
  // less often while connected; the live weight still refreshes ~7–10×/s.
  Bluefruit.Periph.setConnInterval(72, 120);   // units of 1.25 ms
  // Kill the onboard blue "connection" LED — it sits solid-on the whole time
  // a phone is connected (incl. overnight sleep) and wastes ~1–2 mA.
  Bluefruit.autoConnLed(false);
  Bluefruit.setName(BLE_NAME);
  Bluefruit.Periph.setConnectCallback(connectCallback);
  Bluefruit.Periph.setDisconnectCallback(disconnectCallback);
  uECC_set_rng(&auth_rng);     // hardware RNG for ECDSA signing (SoftDevice up)

#ifdef PIN_NEOPIXEL
  statusPixel.begin();
  statusPixel.clear();
  statusPixel.show();
#endif

  bledfu.begin();              // must start before other services
  bledis.setManufacturer("Virtus");
  bledis.setModel(MODEL_NAME);
  bledis.begin();
  bleuart.begin();

  Bluefruit.Advertising.addFlags(BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE);
  Bluefruit.Advertising.addTxPower();
  Bluefruit.Advertising.addService(bleuart);   // app filters on NUS UUID
  Bluefruit.ScanResponse.addName();
  Bluefruit.Advertising.restartOnDisconnect(true);
  // fast (20ms) for the first 30s after boot/disconnect for quick discovery,
  // then slow (1s) to save power while nobody is looking
  Bluefruit.Advertising.setInterval(32, 1600);
  Bluefruit.Advertising.setFastTimeout(30);
  Bluefruit.Advertising.start(0);

  Serial.println(String("Virtus Scale v") + FIRMWARE_VERSION +
                 " advertising as " + BLE_NAME);
}

// ─────────────────────── LOOP ───────────────────────
void loop() {
  if (advRestartPending) {
    advRestartPending = false;
    if (Bluefruit.Periph.connected() < MAX_CONNECTIONS &&
        !Bluefruit.Advertising.isRunning()) {
      Bluefruit.Advertising.start(0);
    }
  }

  if (infoDueAt && millis() > infoDueAt) {
    infoDueAt = 0;
    sendInfo();
    sendStatus();
  }

  // Push PRIMARY/REMOTE role assignments: once shortly after a connect/
  // disconnect (rolesDueAt), plus a cheap self-healing rebroadcast every 7 s.
  if (rolesDueAt && millis() > rolesDueAt) { rolesDueAt = 0; broadcastRoles(); }
  if (Bluefruit.connected() && millis() - lastRoleBcast > 7000) {
    lastRoleBcast = millis();
    broadcastRoles();
  }

  pollBleRx();

  // commands over USB serial too, so bring-up works without BLE
  while (Serial.available()) {
    static String serLine;
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') { handleCommand(serLine); serLine = ""; }
    else if (serLine.length() < 64) serLine += c;
  }

  bool connected = Bluefruit.connected();

  // ── NeoPixel status heartbeat ──
  static bool     ledWasConnected = false;
  static uint32_t ledLastBlink    = 0;
  if (connected && !ledWasConnected) {
    blinkPixel(0, 40, 0, 2);           // just connected: 2 dim green blinks
    ledLastBlink = millis();
  }
  ledWasConnected = connected;
  // Dim, infrequent heartbeat to save battery: connected every 15 s,
  // idle every 30 s. In app power-save (SLEEP) the LED goes quiet entirely.
  uint32_t ledInterval = connected ? 15000 : 30000;
  if (!appPowerSave && millis() - ledLastBlink >= ledInterval) {
    ledLastBlink = millis();
    if (connected) blinkPixel(0, 40, 0, 1);   // connected: dim green heartbeat
    else           blinkPixel(45, 22, 0, 1);  // idle: dim yellow heartbeat
  }

  // ── No client connected: park the sensor and sleep deeply ──
  // Nothing consumes weight data while disconnected, so drop the NAU7802
  // to 200 nA and let the CPU sleep ~0.4 s at a time (radio still wakes
  // on its own for advertising). This is the big idle-power saver.
  if (!connected) {
    if (nauReady && !nauSleeping) { nau.powerDown(); nauSleeping = true; }
    delay(400);          // FreeRTOS idles the CPU during delay()
    return;
  }

  // ── App-requested power saving: client stays connected but idle. Keep the
  //    sensor parked and the loop slow until a WAKE command clears the flag
  //    (pollBleRx above still runs, so WAKE is always received). ──
  if (appPowerSave) {
    if (nauReady && !nauSleeping) { nau.powerDown(); nauSleeping = true; }
    delay(400);          // FreeRTOS idles the CPU during delay()
    return;
  }

  // ── Client connected: wake the sensor if it was parked ──
  if (nauSleeping) {
    nauSleeping = false;
    nauReady = nauInit();          // power up + re-calibrate
    if (!nauReady) { delay(200); return; }
  }

  // unsolicited status every 30 s keeps the app's battery pill fresh
  if (millis() - lastStatusMs > 30000) {
    lastStatusMs = millis();
    sendStatus();
  }

  // sensor missing at boot (or unplugged): rescan every 3 s
  if (!nauReady) {
    if (millis() - lastNauRetry > 3000) {
      lastNauRetry = millis();
      nauReady = nauInit();
      if (!nauReady) bleSend("NAU7802 not found at 0x2A (SCAN to list bus)");
    }
    delay(50);
    return;
  }

  // sensor stall watchdog: a power/bus glitch can silently reset the
  // NAU7802 mid-run (conversions stop, battery keeps reporting). If no
  // sample arrives for 3 s, drop to the auto-reinit path above.
  if (millis() - lastSampleMs > 3000) {
    nauReady = false;
    bleSend("NAU7802 stalled — reinitializing");
    return;
  }

  if (nau.available()) {
    lastSampleMs = millis();
    int32_t raw = nau.getReading();

    // 24-bit ADC clips at ±8388607: weight freezes even as load grows.
    // Report it so an over-range cell/gain mismatch is visible.
    static uint32_t lastOvlMs = 0;
    if ((raw > 8300000 || raw < -8300000) && millis() - lastOvlMs > 2000) {
      lastOvlMs = millis();
      bleSend("WARN: ADC saturated — load beyond range for current gain");
    }

    // light IIR smoothing on raw counts
    if (!haveReading) { rawFiltered = raw; haveReading = true; }
    else rawFiltered += (raw - rawFiltered) / 4;

    float gross = rawFiltered            / countsPerKg * cal.calFactor;
    float net   = (rawFiltered - cal.tareOffset) / countsPerKg * cal.calFactor;

    // report at the configured resolution (default 10 kg, RES:<kg> to change)
    float q = cal.resolution;
    float netR   = roundf(net   / q) * q;
    float grossR = roundf(gross / q) * q;

    // stability: spread of recent net readings inside the band
    recentNet[recentIdx] = net;
    recentIdx = (recentIdx + 1) % STABLE_WINDOW;
    if (recentCount < STABLE_WINDOW) recentCount++;
    bool stable = false;
    if (recentCount == STABLE_WINDOW) {
      float mn = recentNet[0], mx = recentNet[0];
      for (uint8_t i = 1; i < STABLE_WINDOW; i++) {
        if (recentNet[i] < mn) mn = recentNet[i];
        if (recentNet[i] > mx) mx = recentNet[i];
      }
      stable = (mx - mn) < STABLE_BAND;
    }

    bleSend("P:" + String(netR, 1) + ",L:" + String(grossR, 1) +
            ",S:" + (stable ? "1" : "0") + ",U:0");
  }

  // pace the loop to ~40 Hz and let the CPU sleep in between. The
  // NAU7802 samples at 10 SPS, so this still catches every reading and
  // streams at 10 Hz, while the M4 core idles most of the time.
  delay(25);
}
