-- ============================================================================
-- Scale licences — demo loans and paid years, keyed by the scale's serial.
--
-- THE SAFETY RULE. Stated here so nobody inverts it later:
--
--   Only a row of kind 'demo' can ever stop a scale weighing.
--
-- No row, a paid row, a paid row past its date, the phone offline, this
-- database unreachable — every one of those keeps weighing. A customer who paid
-- for the hardware must never be locked out of it. The app enforces the same
-- rule; this table only ever narrows access for scales you lend out.
--
-- Clients cannot read or write any of these tables directly. RLS is on with no
-- policies, so the only way in is through the SECURITY DEFINER functions below:
-- scale_licence_status() for the app, admin_* for you.
-- ============================================================================

-- Who may change licences. Rows are added by hand in the SQL editor.
create table if not exists public.app_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;

create table if not exists public.scale_licences (
  serial      text primary key check (serial ~ '^[0-9A-Z_-]{4,32}$'),
  kind        text not null check (kind in ('demo', 'paid')),
  -- SET NULL, not CASCADE: deleting an account must not erase the record that
  -- a scale was sold or lent. A demo row left without an account simply stops
  -- weighing for everyone until you reassign it.
  account_id  uuid references auth.users(id) on delete set null,
  valid_until timestamptz not null,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.scale_licences enable row level security;

-- Every serial each account has connected. Lets you spot scales in the field
-- that were never registered, without asking anyone.
create table if not exists public.scale_sightings (
  serial     text not null,
  account_id uuid not null references auth.users(id) on delete cascade,
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  primary key (serial, account_id)
);
alter table public.scale_sightings enable row level security;


create or replace function public._is_app_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;
-- Not granted to anyone: only called inside the SECURITY DEFINER functions below,
-- which run as the owner and need no EXECUTE from the caller.
revoke all on function public._is_app_admin() from public, anon, authenticated;


-- ── What the app asks on every connect ─────────────────────────────────────
-- Returns the caller's standing with this scale plus the server's clock, so the
-- app counts demo days from the server rather than a phone whose date can be
-- changed.
create or replace function public.scale_licence_status(p_serial text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  s   text := upper(btrim(coalesce(p_serial, '')));
  r   public.scale_licences%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if s !~ '^[0-9A-Z_-]{4,32}$' then
    return jsonb_build_object('status', 'unregistered', 'server_now', now());
  end if;

  insert into public.scale_sightings (serial, account_id)
  values (s, uid)
  on conflict (serial, account_id) do update set last_seen = now();

  select * into r from public.scale_licences where serial = s;
  if not found then
    return jsonb_build_object('status', 'unregistered', 'server_now', now());
  end if;

  if r.kind = 'paid' then
    return jsonb_build_object(
      'status', case when r.valid_until >= now() then 'paid' else 'paid_renewal_due' end,
      'valid_until', r.valid_until,
      'server_now', now());
  end if;

  -- Demo. Who it is lent to is not disclosed to anyone else.
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


-- ── Admin: lend, sell, renew, reassign ─────────────────────────────────────
--   select admin_set_scale_licence('A1B2C3D4', 'demo', 'farmer@example.com', now() + interval '30 days', 'Harvest 2026 loan');
--   select admin_set_scale_licence('A1B2C3D4', 'paid', 'farmer@example.com', now() + interval '1 year',  'Bought, first year included');
create or replace function public.admin_set_scale_licence(
  p_serial        text,
  p_kind          text,
  p_account_email text,
  p_valid_until   timestamptz,
  p_note          text default null
)
returns public.scale_licences
language plpgsql security definer
set search_path = public, auth
as $$
declare
  s    text := upper(btrim(coalesce(p_serial, '')));
  acct uuid;
  r    public.scale_licences%rowtype;
begin
  if not public._is_app_admin() then
    raise exception 'Not authorised';
  end if;
  if p_kind not in ('demo', 'paid') then
    raise exception 'kind must be demo or paid';
  end if;
  if p_valid_until is null then
    raise exception 'valid_until is required';
  end if;

  if p_account_email is not null and btrim(p_account_email) <> '' then
    select id into acct from auth.users where lower(email) = lower(btrim(p_account_email));
    if acct is null then
      raise exception 'No account for %', p_account_email;
    end if;
  end if;

  if p_kind = 'demo' and acct is null then
    raise exception 'A demo scale must be lent to an account';
  end if;

  insert into public.scale_licences (serial, kind, account_id, valid_until, note)
  values (s, p_kind, acct, p_valid_until, p_note)
  on conflict (serial) do update
    set kind        = excluded.kind,
        account_id  = excluded.account_id,
        valid_until = excluded.valid_until,
        note        = coalesce(excluded.note, public.scale_licences.note),
        updated_at  = now()
  returning * into r;

  return r;
end;
$$;
revoke all on function public.admin_set_scale_licence(text, text, text, timestamptz, text) from public, anon;
grant execute on function public.admin_set_scale_licence(text, text, text, timestamptz, text) to authenticated;


create or replace function public.admin_list_scale_licences()
returns table (serial text, kind text, account_email text, valid_until timestamptz,
               note text, last_seen timestamptz)
language sql stable security definer
set search_path = public, auth
as $$
  select l.serial, l.kind, u.email::text, l.valid_until, l.note,
         (select max(s.last_seen) from public.scale_sightings s where s.serial = l.serial)
    from public.scale_licences l
    left join auth.users u on u.id = l.account_id
   where public._is_app_admin()
   order by l.valid_until;
$$;
revoke all on function public.admin_list_scale_licences() from public, anon;
grant execute on function public.admin_list_scale_licences() to authenticated;


-- Scales seen in use that have no licence row — sold before registration, or
-- missed. Each is still weighing (see the safety rule); this is how you find them.
create or replace function public.admin_list_unregistered_scales()
returns table (serial text, last_account_email text, last_seen timestamptz)
language sql stable security definer
set search_path = public, auth
as $$
  select distinct on (s.serial) s.serial, u.email::text, s.last_seen
    from public.scale_sightings s
    join auth.users u on u.id = s.account_id
   where public._is_app_admin()
     and not exists (select 1 from public.scale_licences l where l.serial = s.serial)
   order by s.serial, s.last_seen desc;
$$;
revoke all on function public.admin_list_unregistered_scales() from public, anon;
grant execute on function public.admin_list_unregistered_scales() to authenticated;
