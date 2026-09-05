-- Virtus Feed — Supabase schema
-- Every table is user-scoped with RLS, same shape as Virtus Harvest's ht_* tables.
-- Ids are client-generated text (uid()) so records exist offline before they sync.

-- ── Cycles (Harvest's seasons). Scope everything to this from day one. ──
create table if not exists vf_cycles (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  start_date  date,
  end_date    date,
  active      boolean default true,
  updated_at  timestamptz default now()
);

-- ── Lots / corrales (Harvest's fields). Head count is every metric's denominator. ──
create table if not exists vf_lots (
  id              text primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  cycle_id        text,
  name            text not null,
  pen_code        text,
  head_count      integer default 0,
  category        text,              -- novillo, vaquilla, toro...
  entry_date      date,
  entry_weight_kg numeric,           -- avg per head at entry
  target_weight_kg numeric,
  ration_id       text,              -- current diet
  meals_per_day   integer default 2,
  route_order     integer default 0, -- pen order on the feed route
  active          boolean default true,
  notes           text,
  updated_at      timestamptz default now()
);

-- ── Ingredients (Harvest's crops) ──
create table if not exists vf_ingredients (
  id           text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  category     text,                 -- forraje, concentrado, mineral, aditivo
  dm_pct       numeric default 100,  -- dry matter %, silage ~30, grain ~87
  cost_per_kg  numeric default 0,    -- in currency below
  currency     text default 'PYG',
  stock_kg     numeric default 0,    -- drawn down by deliveries
  active       boolean default true,
  updated_at   timestamptz default now()
);

-- ── Rations / recetas — the diet formula, versioned ──
create table if not exists vf_rations (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  version     integer default 1,
  notes       text,
  active      boolean default true,
  updated_at  timestamptz default now()
);

create table if not exists vf_ration_items (
  id            text primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  ration_id     text not null,
  ingredient_id text not null,
  kg_per_head   numeric,             -- as-fed kg per head per day
  pct_of_mix    numeric,             -- alternative expression
  seq           integer default 0,   -- LOAD ORDER — matters on a real mixer
  updated_at    timestamptz default now()
);

-- ── Mixers (Harvest's carts): a named wagon bound to one BLE scale ──
create table if not exists vf_mixers (
  id           text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  capacity_kg  numeric,
  device_id    text,                 -- BLE identifier
  device_name  text,
  serial       text,
  updated_at   timestamptz default now()
);

create table if not exists vf_operators (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  role        text,
  active      boolean default true,
  updated_at  timestamptz default now()
);

-- ── Feedings — the event. Harvest's `weighings`. ──
create table if not exists vf_feedings (
  id                text primary key,
  user_id           uuid not null references auth.users(id) on delete cascade,
  cycle_id          text,
  mixer_id          text,
  mixer_name        text,
  ration_id         text,
  ration_name       text,
  operator_name     text,
  meal              text,            -- 'AM' | 'PM' | 'EXTRA'
  status            text default 'loading',  -- loading | delivering | done
  started_at        timestamptz default now(),
  finished_at       timestamptz,
  total_loaded_kg   numeric default 0,
  total_delivered_kg numeric default 0,
  lat               numeric,
  lng               numeric,
  updated_at        timestamptz default now()
);

-- Ingredients IN. Target comes from the ration; actual comes from the scale.
create table if not exists vf_feed_loads (
  id              text primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  feeding_id      text not null,
  ingredient_id   text,
  ingredient_name text,              -- snapshot: what the record said at the time
  target_kg       numeric,
  actual_kg       numeric,
  seq             integer default 0,
  at              timestamptz default now()
);

-- Feed OUT, per lot.
create table if not exists vf_feed_deliveries (
  id           text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  feeding_id   text not null,
  lot_id       text,
  lot_name     text,                 -- snapshot, see above
  head_count   integer,              -- snapshot: pens change size mid-cycle
  target_kg    numeric,
  actual_kg    numeric,
  seq          integer default 0,
  at           timestamptz default now()
);

-- ── Bunk score / lectura de comedero. Drives tomorrow's target. ──
create table if not exists vf_bunk_scores (
  id            text primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  lot_id        text,
  score         integer,             -- 0 = empty ... 4 = untouched
  operator_name text,
  at            timestamptz default now()
);

-- ── Periodic weigh-ins → average daily gain & feed conversion ──
create table if not exists vf_weigh_ins (
  id            text primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  lot_id        text,
  lot_name      text,
  avg_weight_kg numeric,
  head_count    integer,
  at            timestamptz default now()
);

-- ══ RLS: every table, owner-only ══
do $$
declare t text;
begin
  foreach t in array array[
    'vf_cycles','vf_lots','vf_ingredients','vf_rations','vf_ration_items',
    'vf_mixers','vf_operators','vf_feedings','vf_feed_loads',
    'vf_feed_deliveries','vf_bunk_scores','vf_weigh_ins'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "own rows" on %I', t);
    execute format(
      'create policy "own rows" on %I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- ══ Indexes on the columns the app actually filters by ══
create index if not exists vf_lots_user_cycle    on vf_lots(user_id, cycle_id);
create index if not exists vf_feedings_user_cyc  on vf_feedings(user_id, cycle_id, started_at desc);
create index if not exists vf_loads_feeding      on vf_feed_loads(user_id, feeding_id);
create index if not exists vf_deliv_feeding      on vf_feed_deliveries(user_id, feeding_id);
create index if not exists vf_deliv_lot          on vf_feed_deliveries(user_id, lot_id, at desc);
create index if not exists vf_ration_items_ration on vf_ration_items(user_id, ration_id, seq);
