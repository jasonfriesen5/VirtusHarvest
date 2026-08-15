-- Account deletion for Virtus Harvest
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
-- CHECK THIS BEFORE RELYING ON IT
--
-- Deleting auth.users only removes the user's rows automatically if each table
-- references it with ON DELETE CASCADE. Run this to see which of your tables do:
--
--   select tc.table_name,
--          kcu.column_name,
--          rc.delete_rule
--   from information_schema.table_constraints tc
--   join information_schema.key_column_usage kcu
--     on tc.constraint_name = kcu.constraint_name
--   join information_schema.referential_constraints rc
--     on tc.constraint_name = rc.constraint_name
--   where tc.constraint_type = 'FOREIGN KEY'
--     and tc.table_schema = 'public';
--
-- Any table whose delete_rule is not CASCADE will be left behind as orphaned
-- rows after the account is gone. Either add the cascade:
--
--   alter table public.ht_logs
--     drop constraint ht_logs_user_id_fkey,
--     add constraint ht_logs_user_id_fkey
--       foreign key (user_id) references auth.users(id) on delete cascade;
--
-- ...or delete them explicitly inside the function above.
--
-- This matters legally as well as technically: the privacy policy states that
-- deleting the account removes the associated data, so orphaned rows would make
-- that statement untrue.
--
-- TO TEST: create a throwaway account in the app, add a load, delete the
-- account from More ▸ Cloud ▸ Delete Account, then confirm the rows are gone.
-- ─────────────────────────────────────────────────────────────────────────────
