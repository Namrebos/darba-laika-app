-- Kopsavilkuma lietotājs drīkst redzēt datus tikai no sava
-- reģistrācijas mēneša pirmās dienas (pēc Europe/Riga laika).
create or replace function public.can_read_summary_date(entry_time timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select
        p.role <> 'viewer'
        or entry_time >= (
          date_trunc('month', p.created_at at time zone 'Europe/Riga')
          at time zone 'Europe/Riga'
        )
      from public.profiles p
      where p.id = auth.uid()
    ),
    false
  );
$$;

create or replace function public.can_read_summary_task(task_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select
        public.can_read_summary(t.user_id)
        and public.can_read_summary_date(t.start_time)
      from public.task_logs t
      where t.id = task_id
    ),
    false
  );
$$;

drop policy if exists "Role based read" on public.work_logs;
create policy "Role based read"
  on public.work_logs for select
  using (
    public.can_read_summary(user_id)
    and public.can_read_summary_date(start_time)
  );

drop policy if exists "Role based read" on public.task_logs;
create policy "Role based read"
  on public.task_logs for select
  using (
    public.can_read_summary(user_id)
    and public.can_read_summary_date(start_time)
  );

drop policy if exists "Role based read" on public.task_images;
create policy "Role based read"
  on public.task_images for select
  using (public.can_read_summary_task(task_log_id));

drop policy if exists "Role based read" on public.task_timeline_events;
create policy "Role based read"
  on public.task_timeline_events for select
  using (public.can_read_summary_task(task_log_id));

drop policy if exists "Role based read" on public.task_timers;
create policy "Role based read"
  on public.task_timers for select
  using (public.can_read_summary_task(task_log_id));
