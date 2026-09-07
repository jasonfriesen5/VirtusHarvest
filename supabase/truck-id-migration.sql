-- Link weighings to trucks by stable id so duplicate truck names stay separate.
-- Safe to run more than once.

alter table public.weighings
  add column if not exists truck_id text;

-- Backfill only records whose name identifies exactly one truck for that user.
-- Duplicate names are deliberately left null because the database cannot infer
-- which physical truck an older name-only transaction belonged to.
update public.weighings as w
set truck_id = t.id
from public.ht_trucks as t
where w.truck_id is null
  and w.user_id = t.user_id
  and lower(btrim(w.buggy)) = lower(btrim(t.name))
  and 1 = (
    select count(*)
    from public.ht_trucks as candidate
    where candidate.user_id = w.user_id
      and lower(btrim(candidate.name)) = lower(btrim(w.buggy))
  );

create index if not exists weighings_user_truck_id_timestamp_idx
  on public.weighings (user_id, truck_id, timestamp desc)
  where truck_id is not null;

comment on column public.weighings.truck_id is
  'Stable ht_trucks.id used for transaction ownership; buggy remains the display-name snapshot.';
