create table public.planned_tasks (
  id bigint generated always as identity primary key,
  created_by uuid not null references public.profiles(id) on delete cascade,
  assignee_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default '',
  note text not null default '',
  scheduled_date date,
  scheduled_time time,
  position integer not null default 0,
  status text not null default 'new'
    check (status in ('new', 'planned', 'started', 'completed', 'canceled')),
  task_log_id bigint references public.task_logs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status = 'new' or scheduled_date is not null)
);

create index planned_tasks_assignee_date_idx
  on public.planned_tasks (assignee_id, scheduled_date, position);
create index planned_tasks_status_idx on public.planned_tasks (status);
create index planned_tasks_created_by_idx on public.planned_tasks (created_by);

create table public.planned_task_images (
  id bigint generated always as identity primary key,
  planned_task_id bigint not null
    references public.planned_tasks(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  url text not null,
  created_at timestamptz not null default now()
);

create index planned_task_images_task_idx
  on public.planned_task_images (planned_task_id);
create index planned_task_images_uploader_idx
  on public.planned_task_images (uploaded_by);

alter table public.planned_tasks enable row level security;
alter table public.planned_task_images enable row level security;

grant select, insert, update on public.planned_tasks to authenticated;
grant usage, select on sequence public.planned_tasks_id_seq to authenticated;
grant select, insert, delete on public.planned_task_images to authenticated;
grant usage, select on sequence public.planned_task_images_id_seq to authenticated;

create policy "Read accessible planned tasks"
  on public.planned_tasks for select
  to authenticated
  using (
    assignee_id = (select auth.uid())
    or (select public.has_section_access('planned_tasks'))
    or public.can_read_summary(assignee_id)
  );

create policy "Planners create planned tasks"
  on public.planned_tasks for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and (select public.has_section_access('planned_tasks'))
  );

create policy "Planners update planned tasks"
  on public.planned_tasks for update
  to authenticated
  using ((select public.has_section_access('planned_tasks')))
  with check ((select public.has_section_access('planned_tasks')));

create policy "Read accessible planned task images"
  on public.planned_task_images for select
  to authenticated
  using (
    exists (
      select 1
      from public.planned_tasks p
      where p.id = planned_task_id
    )
  );

create policy "Planners add planned task images"
  on public.planned_task_images for insert
  to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and (select public.has_section_access('planned_tasks'))
    and exists (
      select 1
      from public.planned_tasks p
      where p.id = planned_task_id
    )
  );

create policy "Planners delete planned task images"
  on public.planned_task_images for delete
  to authenticated
  using ((select public.has_section_access('planned_tasks')));

create or replace function public.update_assigned_planned_task_status(
  target_id bigint,
  target_status text,
  linked_task_log_id bigint default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_rows integer;
begin
  if auth.uid() is null
    or target_status not in ('started', 'completed', 'canceled')
  then
    return false;
  end if;

  if linked_task_log_id is not null and not exists (
    select 1
    from public.task_logs
    where id = linked_task_log_id
      and user_id = auth.uid()
  ) then
    return false;
  end if;

  update public.planned_tasks
  set
    status = target_status,
    task_log_id = coalesce(linked_task_log_id, task_log_id),
    updated_at = now()
  where id = target_id
    and assignee_id = auth.uid()
    and (
      (status = 'planned' and target_status in ('started', 'canceled'))
      or (status = 'started' and target_status in ('completed', 'canceled'))
    );

  get diagnostics changed_rows = row_count;
  return changed_rows = 1;
end;
$$;

revoke all
on function public.update_assigned_planned_task_status(bigint, text, bigint)
from public, anon;
grant execute
on function public.update_assigned_planned_task_status(bigint, text, bigint)
to authenticated;

drop policy if exists "Users read own profile and admins read all"
on public.profiles;
create policy "Users read accessible profiles"
  on public.profiles for select
  to authenticated
  using (
    id = (select auth.uid())
    or public.current_app_role() = 'admin'
    or (select public.has_section_access('planned_tasks'))
  );
