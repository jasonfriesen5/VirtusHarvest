-- ============================================================================
-- Admin console support for scale licences.
--
-- Backs the web console's Admin page: pick an account, see every scale tied to
-- it, set each one to a demo or a paid year with a button. Every function
-- checks _is_app_admin() first and returns nothing / refuses otherwise, so an
-- ordinary signed-in user gains nothing by calling them.
--
-- Dates are computed here from the server clock, never sent by the browser.
-- ============================================================================

-- Answers only "am I an admin?" for the caller, so the console knows whether to
-- show the Admin tab. Reveals nothing about anyone else.
create or replace function public.admin_whoami()
returns boolean
language sql stable security definer
set search_path = public
as $$ select public._is_app_admin(); $$;
revoke all on function public.admin_whoami() from public, anon;
grant execute on function public.admin_whoami() to authenticated;


-- Every account, with how many distinct scales are tied to it by any route:
-- a cart's stored serial, a connection seen, or a licence assigned.
create or replace function public.admin_list_accounts()
returns table (user_id uuid, email text, name text, created_at timestamptz,
               last_sign_in_at timestamptz, scale_count int)
language sql stable security definer
set search_path = public, auth
as $$
  with links as (
    select user_id as uid, upper(serial) as serial from public.ht_carts where serial is not null and serial <> ''
    union
    select account_id, serial from public.scale_sightings
    union
    select account_id, serial from public.scale_licences where account_id is not null
  )
  select u.id, u.email::text,
         coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')::text,
         u.created_at, u.last_sign_in_at,
         (select count(distinct l.serial)::int from links l where l.uid = u.id)
    from auth.users u
   where public._is_app_admin()
   order by u.last_sign_in_at desc nulls last;
$$;
revoke all on function public.admin_list_accounts() from public, anon;
grant execute on function public.admin_list_accounts() to authenticated;


-- One account's scales and where each stands. licence_email is set when the
-- licence belongs to a different account — a demo lent elsewhere, or a sold
-- scale now used by someone else — so that is visible rather than surprising.
create or replace function public.admin_account_scales(p_user_id uuid)
returns table (serial text, cart_name text, last_seen timestamptz, kind text,
               valid_until timestamptz, licence_email text, note text, server_now timestamptz)
language sql stable security definer
set search_path = public, auth
as $$
  with serials as (
    select upper(serial) as serial from public.ht_carts
     where user_id = p_user_id and serial is not null and serial <> ''
    union
    select serial from public.scale_sightings where account_id = p_user_id
    union
    select serial from public.scale_licences where account_id = p_user_id
  )
  select s.serial,
         (select string_agg(c.name, ', ' order by c.name) from public.ht_carts c
           where c.user_id = p_user_id and upper(c.serial) = s.serial),
         (select max(g.last_seen) from public.scale_sightings g where g.serial = s.serial),
         l.kind, l.valid_until,
         case when l.account_id is distinct from p_user_id then lu.email::text end,
         l.note, now()
    from serials s
    left join public.scale_licences l on l.serial = s.serial
    left join auth.users lu on lu.id = l.account_id
   where public._is_app_admin()
   order by s.serial;
$$;
revoke all on function public.admin_account_scales(uuid) from public, anon;
grant execute on function public.admin_account_scales(uuid) to authenticated;


-- The buttons. One call per click; the server works out the dates.
--   demo_30   lend to this account for 30 days from now
--   paid_1y   paid, one year from now (purchase — first year included)
--   extend_1y one more year from whichever is later, today or the current end,
--             so renewing early never loses the time already paid for
--   clear     remove the licence; the scale goes back to unregistered, which
--             (by the safety rule) always weighs
create or replace function public.admin_apply_scale_action(p_serial text, p_user_id uuid, p_action text)
returns jsonb
language plpgsql security definer
set search_path = public, auth
as $$
declare
  s   text := upper(btrim(coalesce(p_serial, '')));
  cur public.scale_licences%rowtype;
begin
  if not public._is_app_admin() then
    raise exception 'Not authorised';
  end if;
  if s !~ '^[0-9A-Z_-]{4,32}$' then
    raise exception 'Invalid serial %', p_serial;
  end if;
  if p_action in ('demo_30', 'paid_1y')
     and not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'No such account';
  end if;

  select * into cur from public.scale_licences where serial = s;

  if p_action = 'demo_30' then
    insert into public.scale_licences (serial, kind, account_id, valid_until, note)
    values (s, 'demo', p_user_id, now() + interval '30 days', 'Demo loan')
    on conflict (serial) do update
      set kind = 'demo', account_id = p_user_id,
          valid_until = now() + interval '30 days', updated_at = now();

  elsif p_action = 'paid_1y' then
    insert into public.scale_licences (serial, kind, account_id, valid_until, note)
    values (s, 'paid', p_user_id, now() + interval '1 year', 'Paid — first year included')
    on conflict (serial) do update
      set kind = 'paid', account_id = p_user_id,
          valid_until = now() + interval '1 year', updated_at = now();

  elsif p_action = 'extend_1y' then
    if cur.serial is null then
      raise exception 'Scale % has no licence to extend', s;
    end if;
    update public.scale_licences
       set valid_until = greatest(valid_until, now()) + interval '1 year', updated_at = now()
     where serial = s;

  elsif p_action = 'clear' then
    delete from public.scale_licences where serial = s;

  else
    raise exception 'Unknown action %', p_action;
  end if;

  return (select jsonb_build_object('serial', l.serial, 'kind', l.kind, 'valid_until', l.valid_until)
            from public.scale_licences l where l.serial = s);
end;
$$;
revoke all on function public.admin_apply_scale_action(text, uuid, text) from public, anon;
grant execute on function public.admin_apply_scale_action(text, uuid, text) to authenticated;
