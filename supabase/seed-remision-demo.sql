-- ─────────────────────────────────────────────────────────────────────────────
-- Remisión demo seed — account aufpfostensteh@gmail.com
--
-- Purpose: give the Truckloads/Remisión work a clean, realistic data set to be
-- checked against. It clears the half-finished experiments that accumulated in
-- this account and replaces them with five truckloads whose totals are the ones
-- a real Paraguayan trip produces (32,000 and 33,000 kg).
--
-- DELIBERATELY KEPT, because they carry hand-entered SIFEN data that is
-- expensive to recreate:
--   • truck  IVECO      (mobclmrmebm) — transportista, RUC, driver CI, address
--   • dest.  SILO WALL  (mobcmddleao) — RUC, razón social, DNIT geography
--   • farm   Piririta   (mnx1uno7pya) — address + DNIT geography
--   • ht_emisor row — RUC 3744941-9, remision_enabled = true
--
-- Idempotent: re-running it drops the seeded rows and re-inserts them.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- The account everything below is scoped to. Every statement filters on it, so
-- no other user's data can be touched even by accident.
CREATE TEMP TABLE _u AS SELECT '0a2c3e4f-1ea5-4cbd-9678-556845649778'::uuid AS id;


-- ── 1. Clear the half-finished transactions ─────────────────────────────────
-- Children first: all three reference weighings(id).

DELETE FROM ht_load_assignments WHERE user_id = (SELECT id FROM _u);
DELETE FROM ht_truckloads       WHERE user_id = (SELECT id FROM _u);
DELETE FROM ht_remisiones       WHERE user_id = (SELECT id FROM _u);
DELETE FROM weighings           WHERE user_id = (SELECT id FROM _u);

-- Destinations that were never filled in. SILO WALL and Home Bins stay: one
-- needs a remisión, one does not, which is the pair worth testing against.
DELETE FROM ht_destinations
 WHERE user_id = (SELECT id FROM _u) AND id = 'msoii8blxqn';   -- "Elevator A"

-- One season, so no season gate can hide the seed. "Corn 2026" was a duplicate
-- of "2026" holding a handful of test rows that are gone now.
DELETE FROM ht_seasons
 WHERE user_id = (SELECT id FROM _u) AND id = 'mspe1u24xg5';   -- "Corn 2026"


-- ── 2. Real names on the entities ───────────────────────────────────────────

UPDATE ht_operators SET name = 'Rudi Klassen', role = 'Cart operator',
       ci = '4128677', address = 'Colonia Santa Clara, Tacuatí'
 WHERE user_id = (SELECT id FROM _u) AND id = 'ms22w8u5q15';   -- was "Operator 1"

INSERT INTO ht_operators (id, user_id, name, role, ci, address)
VALUES ('vh_seed_op_anibal', (SELECT id FROM _u), 'Aníbal Ramírez',
        'Truck driver', '3987214', 'San Estanislao')
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, role = EXCLUDED.role,
      ci = EXCLUDED.ci, address = EXCLUDED.address;

-- Farms. Piririta already has its address and DNIT codes; Farm 2 had nothing,
-- so it gets both a name and the geography a remisión needs.
UPDATE ht_farms
   SET name = 'Est. Tres Marías',
       address = 'Estancia Tres Marías, Ruta 3 km 214',
       department = 'SAN PEDRO', department_code = '3',
       district = 'TACUATI',     district_code = '17',
       city_name = 'TACUATI',    city_code = '501',
       updated_at = now()
 WHERE user_id = (SELECT id FROM _u) AND id = 'mnx1uxdzk1x';   -- was "Farm 2"

UPDATE ht_fields SET name = 'Potrero Norte', area = 92.4,  updated_at = now()
 WHERE user_id = (SELECT id FROM _u) AND id = 'mnx1vi60rum';   -- was "Field A"
UPDATE ht_fields SET name = 'Cañada Sur',    area = 47.1,  updated_at = now()
 WHERE user_id = (SELECT id FROM _u) AND id = 'mnx1vohhlq8';   -- was "Field B"
UPDATE ht_fields SET name = 'Potrero Alto',  area = 138.6, updated_at = now()
 WHERE user_id = (SELECT id FROM _u) AND id = 'mnx1w5j3egp';   -- was "Field A"

-- Second truck. Left WITHOUT transportista data on purpose: next to the fully
-- configured IVECO it shows what an incomplete truck looks like when a remisión
-- is attempted, which is the case most likely to be got wrong.
UPDATE ht_trucks
   SET name = 'Scania 113', plate = 'BCF447', driver = 'Aníbal Ramírez',
       capacity = 33000, make_model = 'Scania R113', updated_at = now()
 WHERE user_id = (SELECT id FROM _u) AND id = 'mskqqoqoj0h';   -- was "Truck #2"

-- The IVECO's driver field still said "Person A" while driver_ci/address were
-- real; align it with the cédula already recorded against it.
UPDATE ht_trucks SET driver = 'Rudi Klassen', updated_at = now()
 WHERE user_id = (SELECT id FROM _u) AND id = 'mobclmrmebm';


-- ── 3. Five truckloads ──────────────────────────────────────────────────────
-- A truckload is cart loads followed by an is_truck_empty row. Weighings store
-- farm/field/truck/destination by NAME, not id, so these must match the names
-- set above exactly or the app will treat them as different entities.

INSERT INTO weighings
  (id, user_id, worker, farm, zone, field_id, crop, buggy, unload, delivered_to,
   weight, wet_weight, dry_weight, moisture, unit, is_truck_empty, synced,
   season_id, timestamp)
VALUES
  -- TL1 — IVECO → SILO WALL, maíz, 32,000 kg (2 Sep)
  ('vh_seed_t1_l1', (SELECT id FROM _u), 'Rudi Klassen', 'Piririta', 'Potrero Norte', 'mnx1vi60rum', 'Corn', 'IVECO', 'SILO WALL', 'SILO WALL', 8120, 8120, NULL, 16.2, 'kg', false, true, 'mskqvc9lv38', '2026-09-02 11:05:00+00'),
  ('vh_seed_t1_l2', (SELECT id FROM _u), 'Rudi Klassen', 'Piririta', 'Potrero Norte', 'mnx1vi60rum', 'Corn', 'IVECO', 'SILO WALL', 'SILO WALL', 7940, 7940, NULL, 16.0, 'kg', false, true, 'mskqvc9lv38', '2026-09-02 11:38:00+00'),
  ('vh_seed_t1_l3', (SELECT id FROM _u), 'Rudi Klassen', 'Piririta', 'Cañada Sur',    'mnx1vohhlq8', 'Corn', 'IVECO', 'SILO WALL', 'SILO WALL', 8260, 8260, NULL, 16.5, 'kg', false, true, 'mskqvc9lv38', '2026-09-02 12:14:00+00'),
  ('vh_seed_t1_l4', (SELECT id FROM _u), 'Rudi Klassen', 'Piririta', 'Cañada Sur',    'mnx1vohhlq8', 'Corn', 'IVECO', 'SILO WALL', 'SILO WALL', 7680, 7680, NULL, 16.1, 'kg', false, true, 'mskqvc9lv38', '2026-09-02 12:49:00+00'),
  ('vh_seed_t1_out',(SELECT id FROM _u), 'Rudi Klassen', NULL, NULL, NULL, NULL, 'IVECO', 'SILO WALL', 'SILO WALL', 32000, 32000, NULL, NULL, 'kg', true, true, 'mskqvc9lv38', '2026-09-02 13:02:00+00'),

  -- TL2 — IVECO → SILO WALL, maíz, 33,000 kg (3 Sep)
  ('vh_seed_t2_l1', (SELECT id FROM _u), 'Rudi Klassen', 'Piririta', 'Potrero Norte', 'mnx1vi60rum', 'Corn', 'IVECO', 'SILO WALL', 'SILO WALL', 8450, 8450, NULL, 15.8, 'kg', false, true, 'mskqvc9lv38', '2026-09-03 08:20:00+00'),
  ('vh_seed_t2_l2', (SELECT id FROM _u), 'Rudi Klassen', 'Piririta', 'Potrero Norte', 'mnx1vi60rum', 'Corn', 'IVECO', 'SILO WALL', 'SILO WALL', 8300, 8300, NULL, 15.9, 'kg', false, true, 'mskqvc9lv38', '2026-09-03 08:57:00+00'),
  ('vh_seed_t2_l3', (SELECT id FROM _u), 'Rudi Klassen', 'Piririta', 'Cañada Sur',    'mnx1vohhlq8', 'Corn', 'IVECO', 'SILO WALL', 'SILO WALL', 8120, 8120, NULL, 16.3, 'kg', false, true, 'mskqvc9lv38', '2026-09-03 09:35:00+00'),
  ('vh_seed_t2_l4', (SELECT id FROM _u), 'Rudi Klassen', 'Piririta', 'Cañada Sur',    'mnx1vohhlq8', 'Corn', 'IVECO', 'SILO WALL', 'SILO WALL', 8130, 8130, NULL, 16.4, 'kg', false, true, 'mskqvc9lv38', '2026-09-03 10:11:00+00'),
  ('vh_seed_t2_out',(SELECT id FROM _u), 'Rudi Klassen', NULL, NULL, NULL, NULL, 'IVECO', 'SILO WALL', 'SILO WALL', 33000, 33000, NULL, NULL, 'kg', true, true, 'mskqvc9lv38', '2026-09-03 10:26:00+00'),

  -- TL3 — Scania 113 → SILO WALL, soja, 32,000 kg (4 Sep). Different farm and
  -- the truck with no transportista data.
  ('vh_seed_t3_l1', (SELECT id FROM _u), 'Aníbal Ramírez', 'Est. Tres Marías', 'Potrero Alto', 'mnx1w5j3egp', 'Soybeans', 'Scania 113', 'SILO WALL', 'SILO WALL', 10700, 10700, NULL, 13.2, 'kg', false, true, 'mskqvc9lv38', '2026-09-04 09:10:00+00'),
  ('vh_seed_t3_l2', (SELECT id FROM _u), 'Aníbal Ramírez', 'Est. Tres Marías', 'Potrero Alto', 'mnx1w5j3egp', 'Soybeans', 'Scania 113', 'SILO WALL', 'SILO WALL', 10650, 10650, NULL, 13.0, 'kg', false, true, 'mskqvc9lv38', '2026-09-04 09:52:00+00'),
  ('vh_seed_t3_l3', (SELECT id FROM _u), 'Aníbal Ramírez', 'Est. Tres Marías', 'Potrero Alto', 'mnx1w5j3egp', 'Soybeans', 'Scania 113', 'SILO WALL', 'SILO WALL', 10650, 10650, NULL, 13.1, 'kg', false, true, 'mskqvc9lv38', '2026-09-04 10:31:00+00'),
  ('vh_seed_t3_out',(SELECT id FROM _u), 'Aníbal Ramírez', NULL, NULL, NULL, NULL, 'Scania 113', 'SILO WALL', 'SILO WALL', 32000, 32000, NULL, NULL, 'kg', true, true, 'mskqvc9lv38', '2026-09-04 10:44:00+00'),

  -- TL4 — IVECO → SILO WALL, soja, 33,000 kg (5 Sep)
  ('vh_seed_t4_l1', (SELECT id FROM _u), 'Rudi Klassen', 'Est. Tres Marías', 'Potrero Alto', 'mnx1w5j3egp', 'Soybeans', 'IVECO', 'SILO WALL', 'SILO WALL', 11150, 11150, NULL, 13.4, 'kg', false, true, 'mskqvc9lv38', '2026-09-05 07:48:00+00'),
  ('vh_seed_t4_l2', (SELECT id FROM _u), 'Rudi Klassen', 'Est. Tres Marías', 'Potrero Alto', 'mnx1w5j3egp', 'Soybeans', 'IVECO', 'SILO WALL', 'SILO WALL', 10980, 10980, NULL, 13.3, 'kg', false, true, 'mskqvc9lv38', '2026-09-05 08:29:00+00'),
  ('vh_seed_t4_l3', (SELECT id FROM _u), 'Rudi Klassen', 'Est. Tres Marías', 'Potrero Alto', 'mnx1w5j3egp', 'Soybeans', 'IVECO', 'SILO WALL', 'SILO WALL', 10870, 10870, NULL, 13.5, 'kg', false, true, 'mskqvc9lv38', '2026-09-05 09:07:00+00'),
  ('vh_seed_t4_out',(SELECT id FROM _u), 'Rudi Klassen', NULL, NULL, NULL, NULL, 'IVECO', 'SILO WALL', 'SILO WALL', 33000, 33000, NULL, NULL, 'kg', true, true, 'mskqvc9lv38', '2026-09-05 09:19:00+00'),

  -- TL5 — still loading. No closing row, so it shows as "On truck" and drives
  -- the fill bar at roughly half of the IVECO's 32,000 kg rating.
  ('vh_seed_t5_l1', (SELECT id FROM _u), 'Rudi Klassen', 'Piririta', 'Cañada Sur', 'mnx1vohhlq8', 'Corn', 'IVECO', 'SILO WALL', 'SILO WALL', 8050, 8050, NULL, 16.6, 'kg', false, true, 'mskqvc9lv38', '2026-09-06 08:15:00+00'),
  ('vh_seed_t5_l2', (SELECT id FROM _u), 'Rudi Klassen', 'Piririta', 'Cañada Sur', 'mnx1vohhlq8', 'Corn', 'IVECO', 'SILO WALL', 'SILO WALL', 7900, 7900, NULL, 16.7, 'kg', false, true, 'mskqvc9lv38', '2026-09-06 08:58:00+00');


-- ── 4. Remisión rows for the four delivered truckloads ──────────────────────
-- One of each state the Truckloads screen renders, so every branch of
-- _tlRemisionState() has something to show. No Fenex call is implied: these are
-- local rows only, exactly what the app writes before anything is submitted.

INSERT INTO ht_remisiones (closing_weighing_id, user_id, status, fenex_status, numero, error_message)
VALUES
  ('vh_seed_t1_out', (SELECT id FROM _u), 'issued', 'APPROVED',  '001-001-0000041', NULL),
  ('vh_seed_t2_out', (SELECT id FROM _u), 'sending','SUBMITTED', '001-001-0000042', NULL),
  -- Rejected on the Scania, which is the truck with no transportista data —
  -- the rejection and its cause line up, so the screen can be read end to end.
  ('vh_seed_t3_out', (SELECT id FROM _u), 'failed', 'REJECTED',  NULL,
   'Transportista RUC missing on the truck — complete it before resending.'),
  ('vh_seed_t4_out', (SELECT id FROM _u), 'draft',  'DRAFT',     NULL,              NULL)
ON CONFLICT (closing_weighing_id) DO UPDATE
  SET status = EXCLUDED.status, fenex_status = EXCLUDED.fenex_status,
      numero = EXCLUDED.numero, error_message = EXCLUDED.error_message,
      updated_at = now();

COMMIT;
