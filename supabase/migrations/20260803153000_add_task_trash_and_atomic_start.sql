alter table public.task_logs
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid;

create index if not exists task_logs_deleted_at_idx
  on public.task_logs (deleted_at)
  where deleted_at is not null;

create unique index if not exists planned_tasks_unique_task_log_idx
  on public.planned_tasks (task_log_id)
  where task_log_id is not null;

create or replace function public.start_assigned_planned_task(
  target_id bigint,
  target_session_id bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_task public.planned_tasks%rowtype;
  created_task_id bigint;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.work_logs
    where id = target_session_id
      and user_id = auth.uid()
      and end_time is null
  ) then
    raise exception 'Active workday not found';
  end if;

  select *
  into selected_task
  from public.planned_tasks
  where id = target_id
    and assignee_id = auth.uid()
  for update;

  if not found then
    raise exception 'Planned task not found';
  end if;

  if selected_task.status <> 'planned' or selected_task.task_log_id is not null then
    raise exception 'Planned task has already been started';
  end if;

  insert into public.task_logs (
    session_id,
    title,
    note,
    start_time,
    end_time,
    user_id
  ) values (
    target_session_id,
    selected_task.title,
    selected_task.note,
    now(),
    null,
    auth.uid()
  )
  returning id into created_task_id;

  insert into public.task_images (user_id, task_log_id, url)
  select auth.uid(), created_task_id, image.url
  from public.planned_task_images image
  where image.planned_task_id = target_id;

  update public.planned_tasks
  set status = 'started',
      task_log_id = created_task_id,
      updated_at = now()
  where id = target_id;

  return created_task_id;
end;
$$;

revoke all on function public.start_assigned_planned_task(bigint, bigint)
from public, anon;
grant execute on function public.start_assigned_planned_task(bigint, bigint)
to authenticated;

create or replace function public.soft_delete_own_task(target_task_log_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_rows integer;
begin
  if auth.uid() is null then
    return false;
  end if;

  update public.task_logs
  set deleted_at = now(),
      deleted_by = auth.uid()
  where id = target_task_log_id
    and user_id = auth.uid()
    and deleted_at is null;

  get diagnostics changed_rows = row_count;

  if changed_rows = 1 then
    update public.planned_tasks
    set status = 'canceled',
        updated_at = now()
    where task_log_id = target_task_log_id
      and assignee_id = auth.uid();
  end if;

  return changed_rows = 1;
end;
$$;

revoke all on function public.soft_delete_own_task(bigint)
from public, anon;
grant execute on function public.soft_delete_own_task(bigint)
to authenticated;

create or replace function public.restore_own_deleted_task(target_task_log_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_rows integer;
begin
  if auth.uid() is null then
    return false;
  end if;

  update public.task_logs
  set deleted_at = null,
      deleted_by = null
  where id = target_task_log_id
    and user_id = auth.uid()
    and deleted_at >= now() - interval '7 days';

  get diagnostics changed_rows = row_count;

  if changed_rows = 1 then
    update public.planned_tasks
    set status = case
          when public.task_logs.end_time is null then 'started'
          else 'completed'
        end,
        updated_at = now()
    from public.task_logs
    where public.planned_tasks.task_log_id = target_task_log_id
      and public.task_logs.id = target_task_log_id
      and public.planned_tasks.assignee_id = auth.uid();
  end if;

  return changed_rows = 1;
end;
$$;

revoke all on function public.restore_own_deleted_task(bigint)
from public, anon;
grant execute on function public.restore_own_deleted_task(bigint)
to authenticated;

create or replace function public.purge_expired_own_deleted_tasks()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_rows integer;
begin
  if auth.uid() is null then
    return 0;
  end if;

  delete from public.task_logs
  where user_id = auth.uid()
    and deleted_at < now() - interval '7 days';

  get diagnostics deleted_rows = row_count;
  return deleted_rows;
end;
$$;

revoke all on function public.purge_expired_own_deleted_tasks()
from public, anon;
grant execute on function public.purge_expired_own_deleted_tasks()
to authenticated;
