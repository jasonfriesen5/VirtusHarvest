-- ============================================================================
-- Virtus Cart — App Review demo account seed
--
-- Re-runnable. Wipes the demo account's data and rebuilds it, so the account can
-- be reset to a clean, presentable state before every submission.
--
-- WHY THIS EXISTS: App Review requires a working demo login, and the app exposes
-- Delete Account (Guideline 5.1.1(v)). A reviewer testing that requirement can
-- permanently destroy the account — at which point the credentials in App Store
-- Connect stop working and the next submission fails. Before each submission,
-- sign in as the demo user to confirm it still exists; if it doesn't, recreate
-- the account in the app and run this file.
--
-- HOW TO USE
--   1. Create the account in the app first (sign up + confirm the email).
--   2. Check demo_email below.
--   3. Run the whole file in the Supabase SQL editor.
--   4. Sign in on a device and Sync to pull it down.
--
-- SAFETY: aborts if the email has no auth user, and refuses to run against the
-- known real accounts. Only ever touches rows owned by the demo user.
-- ============================================================================

do $$
declare
  demo_email text := 'demo@virtusharvest.com';
  uid   uuid;
  s_id  text := 'demo_season_2026';
  f1    text := 'demo_farm_riverbend';
  f2    text := 'demo_farm_eastview';
  z1    text := 'demo_field_north';
  z2    text := 'demo_field_creek';
  z3    text := 'demo_field_home';
  z4    text := 'demo_field_airport';
begin
  if demo_email in ('aufpfostensteh@gmail.com','jonathanfriesen438@gmail.com') then
    raise exception 'Refusing to run against a real account (%)', demo_email;
  end if;

  select id into uid from auth.users where email = demo_email;
  if uid is null then
    raise exception 'No auth user for % — create the account in the app first.', demo_email;
  end if;

  -- ── Wipe (same order delete_own_account() uses) ───────────────────────────
  delete from public.weighings       where user_id = uid;
  delete from public.ht_boundaries   where user_id = uid;
  delete from public.ht_fields       where user_id = uid;
  delete from public.ht_farms        where user_id = uid;
  delete from public.ht_trucks       where user_id = uid;
  delete from public.ht_destinations where user_id = uid;
  delete from public.ht_operators    where user_id = uid;
  delete from public.ht_crops        where user_id = uid;
  delete from public.ht_carts        where user_id = uid;
  delete from public.ht_seasons      where user_id = uid;

  -- ── Season ────────────────────────────────────────────────────────────────
  insert into public.ht_seasons (id, user_id, name, created_at)
  values (s_id, uid, '2026 Harvest', now() - interval '60 days');

  -- ── Farms ─────────────────────────────────────────────────────────────────
  insert into public.ht_farms (id, user_id, name) values
    (f1, uid, 'Riverbend Farms'),
    (f2, uid, 'Eastview Acres');

  -- ── Fields ────────────────────────────────────────────────────────────────
  insert into public.ht_fields (id, user_id, farm_id, name, area, area_unit, notes) values
    (z1, uid, f1, 'North Quarter', 58.20, 'ha', 'Tile drained, good access off the grid road'),
    (z2, uid, f1, 'Creek Field',   32.50, 'ha', 'Low corner stays wet in spring'),
    (z3, uid, f1, 'Home Section',  64.75, 'ha', null),
    (z4, uid, f2, 'Airport Field', 41.20, 'ha', null);

  -- ── One drawn boundary, so the Field Map has something on it ──────────────
  -- Shape matches what the app writes: [{ id, points:[{lat,lng}, …] }]
  insert into public.ht_boundaries (field_id, user_id, points) values
    (z1, uid, '[{"id":"b_demo_north_1","points":[
        {"lat":42.68012,"lng":-80.80121},
        {"lat":42.68295,"lng":-80.80098},
        {"lat":42.68302,"lng":-80.79612},
        {"lat":42.68018,"lng":-80.79640}
      ]}]'::jsonb);

  -- ── Trucks ────────────────────────────────────────────────────────────────
  insert into public.ht_trucks (id, user_id, name, plate, driver, capacity, make_model, notes) values
    ('demo_truck_1', uid, 'Super B',     'JHT 418', 'Marcus Reimer', 42000, 'Peterbilt 379', null),
    ('demo_truck_2', uid, 'Tandem',      'KPD 902', 'Elena Fehr',    15000, 'Ford F-900',    'Used for short hauls to the bins'),
    ('demo_truck_3', uid, 'Grain Liner', 'RWQ 233', 'Marcus Reimer', 38000, 'Kenworth T800', null);

  -- ── Destinations ──────────────────────────────────────────────────────────
  insert into public.ht_destinations (id, user_id, name) values
    ('demo_dest_1', uid, 'Home Bins'),
    ('demo_dest_2', uid, 'Riverside Terminal'),
    ('demo_dest_3', uid, 'Co-op Elevator');

  -- ── Operators ─────────────────────────────────────────────────────────────
  insert into public.ht_operators (id, user_id, name, role) values
    ('demo_op_1', uid, 'Marcus Reimer', 'Truck Driver'),
    ('demo_op_2', uid, 'Elena Fehr',    'Cart Operator'),
    ('demo_op_3', uid, 'Sam Dyck',      'Combine');

  -- ── Crops ─────────────────────────────────────────────────────────────────
  insert into public.ht_crops (id, user_id, name) values
    (uid||'_Wheat',    uid, 'Wheat'),
    (uid||'_Canola',   uid, 'Canola'),
    (uid||'_Corn',     uid, 'Corn'),
    (uid||'_Soybeans', uid, 'Soybeans'),
    (uid||'_Oats',     uid, 'Oats');

  -- ── Grain cart, so the Device tab lists hardware ──────────────────────────
  insert into public.ht_carts (id, user_id, name, serial) values
    ('demo_cart_1', uid, 'Grain Cart', 'E6E48D60');

  -- ── Loads ─────────────────────────────────────────────────────────────────
  -- Spread over ten days across four fields, three trucks and three
  -- destinations, so every tab and the season totals have real content.
  insert into public.weighings
    (id, user_id, worker, farm, buggy, crop, zone, field_id, unload, delivered_to,
     weight, wet_weight, dry_weight, moisture, unit, notes, timestamp, lat, lng,
     is_truck_empty, auto_detected, synced, season_id)
  select
    'demo_w_'||n, uid, worker, farm, buggy, crop, zone, fid, dest, dest,
    wt, wt, round(wt * (1 - (moist-13)/100.0), 2), moist, 'kg', note,
    now() - (days || ' days')::interval, lat, lng,
    false, auto, true, s_id
  from (values
    ( 1,'Elena Fehr',   'Riverbend Farms','Super B',    'Wheat',   'North Quarter', z1,'Home Bins',          14820.5,13.8,10,42.68105,-80.79880,true, null),
    ( 2,'Elena Fehr',   'Riverbend Farms','Super B',    'Wheat',   'North Quarter', z1,'Home Bins',          15230.0,13.6, 9,42.68140,-80.79805,true, null),
    ( 3,'Marcus Reimer','Riverbend Farms','Grain Liner','Wheat',   'North Quarter', z1,'Riverside Terminal', 13975.2,14.1, 9,42.68062,-80.79931,false,'Wet corner, ran slower'),
    ( 4,'Elena Fehr',   'Riverbend Farms','Super B',    'Wheat',   'Creek Field',   z2,'Home Bins',          12480.0,13.2, 8,42.67720,-80.79510,true, null),
    ( 5,'Marcus Reimer','Riverbend Farms','Tandem',     'Wheat',   'Creek Field',   z2,'Home Bins',           9860.4,13.0, 8,42.67688,-80.79602,false,null),
    ( 6,'Elena Fehr',   'Riverbend Farms','Grain Liner','Canola',  'Home Section',  z3,'Co-op Elevator',     16310.8, 9.4, 6,42.67450,-80.80210,true, null),
    ( 7,'Elena Fehr',   'Riverbend Farms','Grain Liner','Canola',  'Home Section',  z3,'Co-op Elevator',     15980.0, 9.1, 6,42.67512,-80.80155,true, null),
    ( 8,'Marcus Reimer','Riverbend Farms','Super B',    'Canola',  'Home Section',  z3,'Riverside Terminal', 17240.6, 8.8, 5,42.67488,-80.80302,false,'First load off the new header'),
    ( 9,'Sam Dyck',     'Riverbend Farms','Tandem',     'Canola',  'Home Section',  z3,'Home Bins',           8420.0, 9.6, 5,42.67530,-80.80088,true, null),
    (10,'Elena Fehr',   'Eastview Acres', 'Super B',    'Soybeans','Airport Field', z4,'Riverside Terminal', 18650.3,12.4, 4,42.69120,-80.78440,true, null),
    (11,'Marcus Reimer','Eastview Acres', 'Grain Liner','Soybeans','Airport Field', z4,'Riverside Terminal', 17920.0,12.1, 4,42.69188,-80.78395,true, null),
    (12,'Elena Fehr',   'Eastview Acres', 'Super B',    'Soybeans','Airport Field', z4,'Co-op Elevator',     16780.9,12.8, 3,42.69065,-80.78512,false,null),
    (13,'Sam Dyck',     'Riverbend Farms','Tandem',     'Oats',    'Creek Field',   z2,'Home Bins',           7240.0,12.2, 2,42.67702,-80.79488,true, null),
    (14,'Elena Fehr',   'Riverbend Farms','Super B',    'Corn',    'North Quarter', z1,'Home Bins',          19430.7,16.5, 1,42.68122,-80.79760,true, 'Moisture still high, going to the dryer'),
    (15,'Marcus Reimer','Riverbend Farms','Grain Liner','Corn',    'North Quarter', z1,'Co-op Elevator',     20115.0,16.2, 1,42.68090,-80.79845,false,null)
  ) as t(n, worker, farm, buggy, crop, zone, fid, dest, wt, moist, days, lat, lng, auto, note);

  raise notice 'Seeded demo account % (uid %)', demo_email, uid;
end $$;

-- ── Verify ──────────────────────────────────────────────────────────────────
with u as (select id from auth.users where email = 'demo@virtusharvest.com')
select 'farms' t, count(*) n from public.ht_farms        where user_id=(select id from u)
union all select 'fields',       count(*) from public.ht_fields       where user_id=(select id from u)
union all select 'boundaries',   count(*) from public.ht_boundaries   where user_id=(select id from u)
union all select 'trucks',       count(*) from public.ht_trucks       where user_id=(select id from u)
union all select 'destinations', count(*) from public.ht_destinations where user_id=(select id from u)
union all select 'operators',    count(*) from public.ht_operators    where user_id=(select id from u)
union all select 'crops',        count(*) from public.ht_crops        where user_id=(select id from u)
union all select 'carts',        count(*) from public.ht_carts        where user_id=(select id from u)
union all select 'seasons',      count(*) from public.ht_seasons      where user_id=(select id from u)
union all select 'loads',        count(*) from public.weighings       where user_id=(select id from u)
order by 1;
