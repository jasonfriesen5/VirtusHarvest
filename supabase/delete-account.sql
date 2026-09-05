-- Account deletion for Virtus Feed
--
-- WHY A FUNCTION: deleting from auth.users needs privileges the publishable key
-- does not have and must never be exposed to the client. This runs SECURITY
-- DEFINER but takes NO arguments — it reads auth.uid() from the caller's own
-- JWT, so a tampered client can only ever delete itself.
--
-- CASCADE: unlike Harvest, every vf_* table declares
-- `references auth.users(id) on delete cascade` in the initial schema, so this
-- single delete removes the user's data too. Harvest shipped with NO ACTION
-- foreign keys and account deletion failed outright for any account that held
-- data — which broke App Store 5.1.1(v) and made the privacy policy untrue.
-- If you ever add a vf_* table, give it the same cascade or this breaks again.
--
-- STORAGE: invoice photos live in the private `invoices` bucket at
-- <user_id>/<move_id>.jpg, which no foreign key reaches. They are deleted
-- explicitly below — a photographed invoice is user data like any row.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth, storage
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  delete from storage.objects
   where bucket_id = 'invoices'
     and (storage.foldername(name))[1] = uid::text;

  delete from auth.users where id = uid;
end;
$$;

-- Signed-in users only; never anon, never public.
revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
