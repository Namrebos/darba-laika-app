create table public.user_finance_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  eight_hour_workday boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.user_finance_settings enable row level security;

grant select, insert, update on table public.user_finance_settings to authenticated;

create policy "Users read accessible finance settings"
  on public.user_finance_settings for select
  to authenticated
  using (public.can_read_summary(user_id));

create policy "Users add own finance settings"
  on public.user_finance_settings for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and public.has_section_access('finance')
  );

create policy "Users update own finance settings"
  on public.user_finance_settings for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.has_section_access('finance')
  )
  with check (
    user_id = (select auth.uid())
    and public.has_section_access('finance')
  );

insert into public.user_finance_settings (user_id, eight_hour_workday)
select id, true
from public.profiles;

create function public.initialize_user_finance_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_finance_settings (user_id, eight_hour_workday)
  values (new.id, true)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.initialize_user_finance_settings() from public;

create trigger initialize_user_finance_settings_after_profile_insert
after insert on public.profiles
for each row execute function public.initialize_user_finance_settings();
