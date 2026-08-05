create or replace function public.soft_delete_own_task(target_task_log_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_planned_task_id bigint;
  changed_rows integer;
begin
  if auth.uid() is null then
    return false;
  end if;

  select id
  into linked_planned_task_id
  from public.planned_tasks
  where task_log_id = target_task_log_id
    and assignee_id = auth.uid();

  if linked_planned_task_id is null then
    delete from public.task_logs
    where id = target_task_log_id
      and user_id = auth.uid();

    get diagnostics changed_rows = row_count;
    return changed_rows = 1;
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
    where id = linked_planned_task_id;
  end if;

  return changed_rows = 1;
end;
$$;

revoke all on function public.soft_delete_own_task(bigint)
from public, anon;
grant execute on function public.soft_delete_own_task(bigint)
to authenticated;

create or replace function public.restore_planned_task(target_planned_task_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_task_log_id bigint;
  linked_task_end timestamptz;
  changed_rows integer;
begin
  if auth.uid() is null
    or not public.has_section_access('planned_tasks')
  then
    return false;
  end if;

  select task_log_id
  into linked_task_log_id
  from public.planned_tasks
  where id = target_planned_task_id
    and status = 'canceled'
  for update;

  if linked_task_log_id is null then
    return false;
  end if;

  update public.task_logs
  set deleted_at = null,
      deleted_by = null
  where id = linked_task_log_id
    and deleted_at >= now() - interval '7 days'
  returning end_time into linked_task_end;

  get diagnostics changed_rows = row_count;
  if changed_rows <> 1 then
    return false;
  end if;

  update public.planned_tasks
  set status = case
        when linked_task_end is null then 'started'
        else 'completed'
      end,
      updated_at = now()
  where id = target_planned_task_id;

  return true;
end;
$$;

revoke all on function public.restore_planned_task(bigint)
from public, anon;
grant execute on function public.restore_planned_task(bigint)
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

  delete from public.planned_tasks planned
  using public.task_logs task
  where planned.task_log_id = task.id
    and task.user_id = auth.uid()
    and task.deleted_at < now() - interval '7 days';

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
