-- ============================================================================
-- Promotion switch: while it is on, a NEW account that connects a BRAND-NEW
-- scale gets a 30-day demo automatically.
--
-- Chosen deliberately (2026-10-01) over restricting this to a pool of loaner
-- scales: a bought scale that connects before it is marked paid WILL become a
-- demo. The business process is to press Paid immediately on sale. To keep that
-- slip visible rather than silent, every demo this hands out is tagged
-- source = 'promotion' and listed on the Admin page with its days left.
--
-- It only ever creates a demo where there was NO licence at all. It never
-- touches a scale that is paid, complimentary, or already a demo.
--
-- Narrowed to match "every new user that signs up":
--   * the account was created after the promotion was switched on, and
--   * the scale has never been seen on any account before, and
--   * the scale is not paired to another account's cart.
-- ============================================================================

alter table public.scale_licences
  add column if not exists source text not null default 'admin'
  check (source in ('admin', 'promotion'));

create table if not exists public.app_promotion (
  id          int primary key default 1 check (id = 1),   -- a single row
  active      boolean not null default false,
  demo_days   int not null default 30 check (demo_days between 1 and 365),
  started_at  timestamptz,
  ended_at    timestamptz,
  updated_at  timestamptz not null default now()
);
alter table public.app_promotion enable row level security;
insert into public.app_promotion (id) values (1) on conflict (id) do nothing;


-- What the app asks on connect — now able to hand out a promotion demo first.
create or replace function public.scale_licence_status(p_serial text)
returns jsonb
language plpgsql security definer
set search_path = public, auth
as $$
declare
  uid   uuid := auth.uid();
  s     text := upper(btrim(coalesce(p_serial, '')));
  r     public.scale_licences%rowtype;
  promo public.app_promotion%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if s !~ '^[0-9A-Z_-]{4,32}$' then
    return jsonb_build_object('status', 'unregistered', 'server_now', now());
  end if;

  select * into r from public.scale_licences where serial = s;

  -- Promotion: only where there is no licence at all. The "never seen" test
  -- runs BEFORE this connection is recorded as a sighting below.
  if not found then
    select * into promo from public.app_promotion where id = 1;
    if promo.active
       and promo.started_at is not null
       and (select created_at from auth.users where id = uid) >= promo.started_at
       and not exists (select 1 from public.scale_sightings where serial = s)
       and not exists (select 1 from public.ht_carts
                        where upper(serial) = s and user_id is distinct from uid)
    then
      insert into public.scale_licences (serial, kind, account_id, valid_until, note, source)
      values (s, 'demo', uid, now() + make_interval(days => promo.demo_days), 'Promotion demo', 'promotion')
      on conflict (serial) do nothing;
      select * into r from public.scale_licences where serial = s;
    end if;
  end if;

  insert into public.scale_sightings (serial, account_id)
  values (s, uid)
  on conflict (serial, account_id) do update set last_seen = now();

  if r.serial is null then
    return jsonb_build_object('status', 'unregistered', 'server_now', now());
  end if;

  if r.kind = 'paid' then
    return jsonb_build_object(
      'status', case when r.valid_until >= now() then 'paid' else 'paid_renewal_due' end,
      'valid_until', r.valid_until,
      'server_now', now());
  end if;

  if r.account_id is distinct from uid then
    return jsonb_build_object('status', 'demo_other_account', 'server_now', now());
  end if;

  return jsonb_build_object(
    'status', case when r.valid_until >= now() then 'demo' else 'demo_ended' end,
    'valid_until', r.valid_until,
    'server_now', now());
end;
$$;
revoke all on function public.scale_licence_status(text) from public, anon;
grant execute on function public.scale_licence_status(text) to authenticated;


-- ── Admin: the switch ─────────────────────────────────────────────────────
create or replace function public.admin_get_promotion()
returns table (active boolean, demo_days int, started_at timestamptz, ended_at timestamptz)
language sql stable security definer
set search_path = public
as $$
  select p.active, p.demo_days, p.started_at, p.ended_at
    from public.app_promotion p
   where p.id = 1 and public._is_app_admin();
$$;
revoke all on function public.admin_get_promotion() from public, anon;
grant execute on function public.admin_get_promotion() to authenticated;

-- Turning it on stamps started_at, which is what decides who counts as a new
-- sign-up — so switching it off and on again starts a fresh promotion.
create or replace function public.admin_set_promotion(p_active boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public._is_app_admin() then
    raise exception 'Not authorised';
  end if;
  update public.app_promotion
     set active     = p_active,
         started_at = case when p_active and not active then now() else started_at end,
         ended_at   = case when not p_active and active then now() else ended_at end,
         updated_at = now()
   where id = 1;
end;
$$;
revoke all on function public.admin_set_promotion(boolean) from public, anon;
grant execute on function public.admin_set_promotion(boolean) to authenticated;


-- Every demo the promotion handed out, still standing as a demo. This is the
-- safety net for option B: a buyer whose scale was not marked paid in time
-- shows up here with a countdown.
create or replace function public.admin_list_promotion_demos()
returns table (serial text, user_id uuid, account_email text, valid_until timestamptz,
               created_at timestamptz, server_now timestamptz)
language sql stable security definer
set search_path = public, auth
as $$
  select l.serial, l.account_id, u.email::text, l.valid_until, l.created_at, now()
    from public.scale_licences l
    left join auth.users u on u.id = l.account_id
   where public._is_app_admin()
     and l.source = 'promotion'
     and l.kind = 'demo'
   order by l.valid_until;
$$;
revoke all on function public.admin_list_promotion_demos() from public, anon;
grant execute on function public.admin_list_promotion_demos() to authenticated;


-- Any button press is an admin decision, so it re-tags the row 'admin' and the
-- scale leaves the promotion list once dealt with.
create or replace function public.admin_apply_scale_action(p_serial text, p_user_id uuid, p_action text)
returns jsonb
language plpgsql security definer
set search_path = public, auth
as $$
declare
  s       text := upper(btrim(coalesce(p_serial, '')));
  cur     public.scale_licences%rowtype;
  n_years int;
  new_end timestamptz;
  pay_id  uuid;
begin
  if not public._is_app_admin() then
    raise exception 'Not authorised';
  end if;
  if s !~ '^[0-9A-Z_-]{4,32}$' then
    raise exception 'Invalid serial %', p_serial;
  end if;
  if p_action in ('demo_30', 'paid_1y', 'paid_3y', 'paid_5y', 'extend_1y', 'comp')
     and not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'No such account';
  end if;

  select * into cur from public.scale_licences where serial = s;

  if p_action = 'demo_30' then
    insert into public.scale_licences (serial, kind, account_id, valid_until, note, source)
    values (s, 'demo', p_user_id, now() + interval '30 days', 'Demo loan', 'admin')
    on conflict (serial) do update
      set kind = 'demo', account_id = p_user_id,
          valid_until = now() + interval '30 days', note = 'Demo loan', source = 'admin', updated_at = now();

  elsif p_action in ('paid_1y', 'paid_3y', 'paid_5y', 'extend_1y') then
    n_years := case p_action when 'paid_3y' then 3 when 'paid_5y' then 5 else 1 end;
    -- Stack on a live paid term; start from today for anything else (a demo,
    -- a lapsed term, a complimentary scale being converted, or nothing).
    new_end := case
                 when cur.kind = 'paid' and cur.valid_until > now()
                      and cur.valid_until < timestamptz '9000-01-01'
                 then cur.valid_until
                 else now()
               end + make_interval(years => n_years);
    insert into public.scale_licences (serial, kind, account_id, valid_until, note, source)
    values (s, 'paid', p_user_id, new_end, 'Paid', 'admin')
    on conflict (serial) do update
      set kind = 'paid', account_id = p_user_id, valid_until = new_end, note = 'Paid', source = 'admin', updated_at = now();
    insert into public.scale_payments (serial, account_id, kind, years, valid_until, created_by)
    values (s, p_user_id, 'paid', n_years, new_end, auth.uid())
    returning id into pay_id;

  elsif p_action = 'comp' then
    new_end := timestamptz '9999-12-31 00:00:00+00';
    insert into public.scale_licences (serial, kind, account_id, valid_until, note, source)
    values (s, 'paid', p_user_id, new_end, 'Complimentary', 'admin')
    on conflict (serial) do update
      set kind = 'paid', account_id = p_user_id, valid_until = new_end,
          note = 'Complimentary', source = 'admin', updated_at = now();
    insert into public.scale_payments (serial, account_id, kind, years, valid_until, created_by)
    values (s, p_user_id, 'complimentary', null, new_end, auth.uid())
    returning id into pay_id;

  elsif p_action = 'clear' then
    delete from public.scale_licences where serial = s;

  else
    raise exception 'Unknown action %', p_action;
  end if;

  return (select jsonb_build_object('serial', s, 'kind', l.kind, 'valid_until', l.valid_until,
                                    'payment_id', pay_id)
            from (select 1) one
            left join public.scale_licences l on l.serial = s);
end;
$$;
revoke all on function public.admin_apply_scale_action(text, uuid, text) from public, anon;
grant execute on function public.admin_apply_scale_action(text, uuid, text) to authenticated;
