alter table public.profiles
  add column can_access_workday boolean not null default false,
  add column can_access_finance boolean not null default false,
  add column can_access_calculators boolean not null default false,
  add column can_access_planned_tasks boolean not null default false;

update public.profiles
set
  can_access_workday = role in ('admin', 'member'),
  can_access_finance = role in ('admin', 'member'),
  can_access_calculators = role = 'admin',
  can_access_planned_tasks = role = 'admin';

alter table public.user_invitations
  add column can_access_workday boolean not null default false,
  add column can_access_finance boolean not null default false,
  add column can_access_calculators boolean not null default false,
  add column can_access_planned_tasks boolean not null default false;

create or replace function public.has_section_access(required_section text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select
        p.role = 'admin'
        or case required_section
          when 'workday' then p.can_access_workday
          when 'finance' then p.can_access_finance
          when 'calculators' then p.can_access_calculators
          when 'planned_tasks' then p.can_access_planned_tasks
          else false
        end
      from public.profiles p
      where p.id = auth.uid()
    ),
    false
  );
$$;

revoke all on function public.has_section_access(text) from public;
grant execute on function public.has_section_access(text) to authenticated;

create or replace function public.can_read_summary(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    $1 = auth.uid()
    or (select role from public.profiles where id = auth.uid()) = 'admin'
    or exists (
      select 1
      from public.summary_access
      where viewer_id = auth.uid() and owner_id = $1
    );
$$;

revoke all on function public.can_read_summary(uuid) from public;
grant execute on function public.can_read_summary(uuid) to authenticated;

create or replace function public.get_accessible_summary_users()
returns table (id uuid, email text, display_name text, avatar_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.email, p.display_name, p.avatar_url
  from public.profiles p
  where
    p.id = auth.uid()
    or (select role from public.profiles where id = auth.uid()) = 'admin'
    or exists (
      select 1
      from public.summary_access a
      where a.viewer_id = auth.uid() and a.owner_id = p.id
    )
  order by p.display_name, p.email nulls last, p.id;
$$;

revoke all on function public.get_accessible_summary_users() from public;
grant execute on function public.get_accessible_summary_users() to authenticated;

do $$
declare target_table text;
begin
  foreach target_table in array array[
    'work_logs',
    'task_logs',
    'task_images',
    'tags',
    'task_timeline_events'
  ]
  loop
    execute format('drop policy if exists "Role based insert" on public.%I', target_table);
    execute format('drop policy if exists "Role based update" on public.%I', target_table);
    execute format('drop policy if exists "Role based delete" on public.%I', target_table);

    execute format(
      'create policy "Role based insert" on public.%I for insert to authenticated with check (public.has_section_access(''workday'') and user_id = auth.uid())',
      target_table
    );
    execute format(
      'create policy "Role based update" on public.%I for update to authenticated using (public.has_section_access(''workday'') and user_id = auth.uid()) with check (user_id = auth.uid())',
      target_table
    );
    execute format(
      'create policy "Role based delete" on public.%I for delete to authenticated using (public.has_section_access(''workday'') and user_id = auth.uid())',
      target_table
    );
  end loop;
end $$;

drop policy if exists "Role based insert" on public.task_timers;
drop policy if exists "Role based update" on public.task_timers;
drop policy if exists "Role based delete" on public.task_timers;

create policy "Role based insert"
  on public.task_timers for insert
  to authenticated
  with check (
    public.has_section_access('workday')
    and exists (
      select 1
      from public.task_logs
      where task_logs.id = task_timers.task_log_id
        and task_logs.user_id = auth.uid()
    )
  );

create policy "Role based update"
  on public.task_timers for update
  to authenticated
  using (
    public.has_section_access('workday')
    and exists (
      select 1
      from public.task_logs
      where task_logs.id = task_timers.task_log_id
        and task_logs.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.task_logs
      where task_logs.id = task_timers.task_log_id
        and task_logs.user_id = auth.uid()
    )
  );

create policy "Role based delete"
  on public.task_timers for delete
  to authenticated
  using (
    public.has_section_access('workday')
    and exists (
      select 1
      from public.task_logs
      where task_logs.id = task_timers.task_log_id
        and task_logs.user_id = auth.uid()
    )
  );

drop policy if exists "Users read own expenses" on public.monthly_expenses;
drop policy if exists "Users add own expenses" on public.monthly_expenses;
drop policy if exists "Users update own expenses" on public.monthly_expenses;
drop policy if exists "Users delete own expenses" on public.monthly_expenses;

create policy "Users read own expenses"
  on public.monthly_expenses for select
  to authenticated
  using (
    user_id = auth.uid()
    and public.has_section_access('finance')
  );

create policy "Users add own expenses"
  on public.monthly_expenses for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.has_section_access('finance')
  );

create policy "Users update own expenses"
  on public.monthly_expenses for update
  to authenticated
  using (
    user_id = auth.uid()
    and public.has_section_access('finance')
  )
  with check (user_id = auth.uid());

create policy "Users delete own expenses"
  on public.monthly_expenses for delete
  to authenticated
  using (
    user_id = auth.uid()
    and public.has_section_access('finance')
  );
