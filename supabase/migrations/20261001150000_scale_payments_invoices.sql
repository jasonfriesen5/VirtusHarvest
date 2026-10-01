-- ============================================================================
-- Payments, invoices, multi-year terms and complimentary scales.
--
--  * Paid · 1 / 3 / 5 years. Paying on a scale that is already paid ADDS to its
--    current end date, so renewing early never loses time already paid for.
--  * Complimentary: paid status with no end, for scales you give away. Stored
--    as kind 'paid' ending 9999-12-31, so the app needs no new state to obey it
--    — and so it falls under the same never-stops-weighing rule as any paid scale.
--  * Every paid / complimentary click writes a payment record, and a PDF invoice
--    can be attached to it. PDFs live in a private bucket only admins can read.
-- ============================================================================

create table if not exists public.scale_payments (
  id           uuid primary key default gen_random_uuid(),
  serial       text not null,
  account_id   uuid references auth.users(id) on delete set null,
  kind         text not null check (kind in ('paid', 'complimentary')),
  years        int check (years is null or years between 1 and 25),
  valid_until  timestamptz not null,   -- the end date this payment produced
  invoice_path text,
  note         text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
alter table public.scale_payments enable row level security;
create index if not exists scale_payments_serial_idx on public.scale_payments (serial, created_at desc);


-- The buttons, again. extend_1y is kept as an alias of paid_1y so the console
-- that is already deployed keeps working until it is redeployed.
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
    insert into public.scale_licences (serial, kind, account_id, valid_until, note)
    values (s, 'demo', p_user_id, now() + interval '30 days', 'Demo loan')
    on conflict (serial) do update
      set kind = 'demo', account_id = p_user_id,
          valid_until = now() + interval '30 days', note = 'Demo loan', updated_at = now();

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
    insert into public.scale_licences (serial, kind, account_id, valid_until, note)
    values (s, 'paid', p_user_id, new_end, 'Paid')
    on conflict (serial) do update
      set kind = 'paid', account_id = p_user_id, valid_until = new_end, note = 'Paid', updated_at = now();
    insert into public.scale_payments (serial, account_id, kind, years, valid_until, created_by)
    values (s, p_user_id, 'paid', n_years, new_end, auth.uid())
    returning id into pay_id;

  elsif p_action = 'comp' then
    new_end := timestamptz '9999-12-31 00:00:00+00';
    insert into public.scale_licences (serial, kind, account_id, valid_until, note)
    values (s, 'paid', p_user_id, new_end, 'Complimentary')
    on conflict (serial) do update
      set kind = 'paid', account_id = p_user_id, valid_until = new_end,
          note = 'Complimentary', updated_at = now();
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


-- A scale's payment history, newest first.
create or replace function public.admin_scale_payments(p_serial text)
returns table (id uuid, kind text, years int, valid_until timestamptz, invoice_path text,
               note text, created_at timestamptz, account_email text)
language sql stable security definer
set search_path = public, auth
as $$
  select p.id, p.kind, p.years, p.valid_until, p.invoice_path, p.note, p.created_at, u.email::text
    from public.scale_payments p
    left join auth.users u on u.id = p.account_id
   where public._is_app_admin()
     and p.serial = upper(btrim(coalesce(p_serial, '')))
   order by p.created_at desc;
$$;
revoke all on function public.admin_scale_payments(text) from public, anon;
grant execute on function public.admin_scale_payments(text) to authenticated;


-- Records where an uploaded invoice landed. The path is fixed to
-- <SERIAL>/<payment id>.pdf, so a record can only ever point at its own file.
create or replace function public.admin_set_payment_invoice(p_payment_id uuid, p_path text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare expected text;
begin
  if not public._is_app_admin() then
    raise exception 'Not authorised';
  end if;
  select serial || '/' || id::text || '.pdf' into expected
    from public.scale_payments where id = p_payment_id;
  if expected is null then
    raise exception 'No such payment';
  end if;
  if p_path is distinct from expected then
    raise exception 'Invoice path must be %', expected;
  end if;
  update public.scale_payments set invoice_path = p_path where id = p_payment_id;
end;
$$;
revoke all on function public.admin_set_payment_invoice(uuid, text) from public, anon;
grant execute on function public.admin_set_payment_invoice(uuid, text) to authenticated;


-- ── Private invoice storage ───────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoices', 'invoices', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

-- admin_whoami() is used rather than _is_app_admin(): storage checks run as the
-- requesting user, who may call the former and deliberately cannot call the latter.
create policy "invoices: admins read"   on storage.objects for select to authenticated
  using (bucket_id = 'invoices' and public.admin_whoami());
create policy "invoices: admins upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'invoices' and public.admin_whoami());
create policy "invoices: admins replace" on storage.objects for update to authenticated
  using (bucket_id = 'invoices' and public.admin_whoami())
  with check (bucket_id = 'invoices' and public.admin_whoami());
create policy "invoices: admins delete" on storage.objects for delete to authenticated
  using (bucket_id = 'invoices' and public.admin_whoami());
