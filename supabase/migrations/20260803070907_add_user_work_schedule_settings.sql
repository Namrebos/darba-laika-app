create table public.user_work_schedule_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  regular_start time not null default '09:00',
  regular_end time not null default '18:00',
  updated_at timestamptz not null default now(),
  constraint regular_workday_order check (regular_end > regular_start)
);

alter table public.user_work_schedule_settings enable row level security;

grant select, insert, update on table public.user_work_schedule_settings
to authenticated;

create policy "Users read accessible work schedules"
  on public.user_work_schedule_settings for select
  to authenticated
  using (public.can_read_summary(user_id));

create policy "Users add own work schedule"
  on public.user_work_schedule_settings for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users update own work schedule"
  on public.user_work_schedule_settings for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

insert into public.user_work_schedule_settings (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

create function public.initialize_user_work_schedule_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_work_schedule_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.initialize_user_work_schedule_settings()
from public, anon, authenticated;

create trigger initialize_user_work_schedule_after_profile_insert
after insert on public.profiles
for each row execute function public.initialize_user_work_schedule_settings();
