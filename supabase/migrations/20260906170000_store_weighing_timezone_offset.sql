alter table public.weighings
  add column if not exists timezone_offset_minutes smallint;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'weighings_timezone_offset_minutes_check'
      and conrelid = 'public.weighings'::regclass
  ) then
    alter table public.weighings
      add constraint weighings_timezone_offset_minutes_check
      check (
        timezone_offset_minutes is null
        or timezone_offset_minutes between -840 and 840
      );
  end if;
end
$$;

comment on column public.weighings.timezone_offset_minutes is
  'UTC offset in minutes at the place and instant the weighing was saved; used to preserve its local calendar date.';
