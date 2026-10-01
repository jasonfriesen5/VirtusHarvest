-- Administer licences from the Supabase SQL editor without needing an app
-- account. A direct database session logs in as postgres and carries no JWT.
-- Every app and website request logs in as `authenticator` and always carries
-- one, so neither condition can be met from outside. Both are required: the JWT
-- check also keeps rolled-back test sessions that impersonate a user honest.
--
-- From the SQL editor:
--   select admin_set_scale_licence('A1B2C3D4', 'demo', 'farmer@example.com', now() + interval '30 days', 'Harvest loan');
--   select admin_set_scale_licence('A1B2C3D4', 'paid', 'farmer@example.com', now() + interval '1 year',  'Bought, first year included');
--   select * from admin_list_scale_licences();
--   select * from admin_list_unregistered_scales();
create or replace function public._is_app_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select
    (session_user = 'postgres'
       and coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}') = '{}'
       and auth.uid() is null)
    or exists (select 1 from public.app_admins where user_id = auth.uid());
$$;
revoke all on function public._is_app_admin() from public, anon, authenticated;
