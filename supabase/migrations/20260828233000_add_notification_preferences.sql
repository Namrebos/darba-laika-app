create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  new_requests boolean not null default true,
  assigned_tasks boolean not null default true,
  task_changes boolean not null default true,
  task_cancellations boolean not null default true,
  work_start_reminders boolean not null default false,
  work_end_reminders boolean not null default false,
  quiet_hours_enabled boolean not null default false,
  quiet_hours_start time not null default '22:00',
  quiet_hours_end time not null default '07:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

grant select, insert, update, delete
  on table public.notification_preferences
  to authenticated;

create policy "Users can read own notification preferences"
  on public.notification_preferences
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own notification preferences"
  on public.notification_preferences
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update own notification preferences"
  on public.notification_preferences
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete own notification preferences"
  on public.notification_preferences
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
