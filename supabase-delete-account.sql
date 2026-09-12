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

  -- IMPORTANT — see the note at the bottom of this file.
  -- If your tables do NOT cascade from auth.users, delete them explicitly here
  -- first, e.g.:
  --
  --   delete from public.ht_logs     where user_id = uid;
  --   delete from public.ht_carts    where user_id = uid;
  --   delete from public.ht_fields   where user_id = uid;
  --   delete from public.ht_farms    where user_id = uid;
  --   delete from public.ht_trucks   where user_id = uid;
  --   delete from public.ht_destinations where user_id = uid;
  --   delete from public.ht_operators    where user_id = uid;
  --   delete from public.ht_seasons      where user_id = uid;
  --
  -- Uncomment and adjust to match your actual table and column names.

  delete from auth.users where id = uid;
end;
$$;

-- Only signed-in users may call it; never anon, never the public role.
revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- CASCADE STATUS — VERIFIED 2026-08-18
--
-- Deleting auth.users only removes the user's rows automatically if each table
-- references it with ON DELETE CASCADE. Originally none of them did: all ten
-- foreign keys were NO ACTION, so `delete from auth.users` was REJECTED for any
-- account that held data, and account deletion failed with a foreign-key error.
-- That made the App Store 5.1.1(v) feature non-functional and the privacy
-- policy's deletion claim untrue.
--
-- Fixed by migration `cascade_user_data_on_account_delete`, which re-created
-- every user_id foreign key with ON DELETE CASCADE:
--
--   weighings, ht_boundaries, ht_carts, ht_crops, ht_destinations,
--   ht_farms, ht_fields, ht_operators, ht_seasons, ht_trucks
--
-- Because the cascade is now in the schema, the function body needs no explicit
-- deletes, and any NEW table picks up the same behaviour as long as its
-- user_id foreign key is declared `references auth.users(id) on delete cascade`.
-- Declare it that way when you add one — that is the whole maintenance burden.
--
-- Re-check at any time with:
--
--   select tc.table_name, rc.delete_rule
--   from information_schema.table_constraints tc
--   join information_schema.referential_constraints rc
--     on tc.constraint_name = rc.constraint_name
--   where tc.constraint_type = 'FOREIGN KEY'
--     and tc.table_schema = 'public'
--   order by rc.delete_rule, tc.table_name;
--
-- Anything that is not CASCADE will be orphaned when an account is deleted.
--
-- STILL WORTH DOING: an end-to-end test. Create a throwaway account in the app,
-- add a load, delete the account from More ▸ Cloud ▸ Delete Account, then
-- confirm the rows are gone. The schema is correct, but only a real run proves
-- the whole path works.
-- ─────────────────────────────────────────────────────────────────────────────
