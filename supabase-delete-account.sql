-- Account deletion for Virtus Cart
-- Run once in Supabase ▸ SQL Editor ▸ New query ▸ Run.
--
-- WHY A FUNCTION: deleting a row from auth.users needs privileges the app's
-- anon key does not have, and must never be exposed to the client. This runs
-- SECURITY DEFINER (with the owner's rights) but takes NO arguments — it reads
-- auth.uid() from the caller's JWT itself. A tampered client therefore cannot
-- delete anyone but itself.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Every user_id foreign key is ON DELETE CASCADE, so the final delete alone
  -- would clear these rows. They are listed anyway, children first, so deletion
  -- does not silently depend on a schema property no one re-checks — a future
  -- table added with a plain `references auth.users(id)` would otherwise make
  -- account deletion fail outright. Insurance, not a requirement.

  delete from public.ht_remisiones            where user_id = uid;
  delete from public.ht_truckloads            where user_id = uid;
  delete from public.ht_load_assignments      where user_id = uid;
  delete from public.ht_destination_customers where user_id = uid;
  delete from public.ht_issuer_tokens         where user_id = uid;
  delete from public.ht_issuers               where user_id = uid;
  delete from public.ht_emisor                where user_id = uid;
  delete from public.ht_routes                where user_id = uid;
  delete from public.weighings                where user_id = uid;
  delete from public.ht_boundaries            where user_id = uid;
  delete from public.ht_fields                where user_id = uid;
  delete from public.ht_farms                 where user_id = uid;
  delete from public.ht_trucks                where user_id = uid;
  delete from public.ht_destinations          where user_id = uid;
  delete from public.ht_operators             where user_id = uid;
  delete from public.ht_crops                 where user_id = uid;
  delete from public.ht_carts                 where user_id = uid;
  delete from public.ht_seasons               where user_id = uid;

  delete from auth.users where id = uid;
end;
$$;

-- Only signed-in users may call it; never anon, never the public role.
revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- CASCADE STATUS — RE-VERIFIED 2026-09-15
--
-- All 22 user_id foreign keys are ON DELETE CASCADE, including the tables added
-- since the original check: ht_remisiones, ht_truckloads, ht_load_assignments,
-- ht_emisor, ht_issuers, ht_issuer_tokens, ht_destination_customers, ht_routes.
-- The three that reference weighings rather than auth.users cascade too.
--
-- Declare every new table's key `references auth.users(id) on delete cascade`.
-- The explicit deletes in the function body are a second line of defence for the
-- day someone forgets.
--
-- Re-check with:
--
--   select c.conrelid::regclass::text as tbl,
--          case c.confdeltype when 'a' then 'NO ACTION' when 'c' then 'CASCADE' end as on_delete
--   from pg_constraint c join pg_namespace n on n.oid = c.connamespace
--   where c.contype = 'f' and n.nspname = 'public'
--     and c.confrelid in ('auth.users'::regclass, 'public.weighings'::regclass)
--   order by on_delete, tbl;
--
-- END-TO-END TEST — PASSED 2026-09-15. A throwaway auth user with rows in
-- ht_farms, weighings, ht_truckloads, ht_remisiones, ht_load_assignments,
-- ht_emisor, ht_issuers and ht_routes was deleted through this function with
-- request.jwt.claims set to that user; the user row and every child row were
-- gone afterwards, with no stray rows left behind.
-- ─────────────────────────────────────────────────────────────────────────────
