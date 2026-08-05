create or replace function public.empty_planned_task_trash(
  target_assignee_id uuid,
  target_date date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_task_log_ids bigint[];
  deleted_rows integer;
begin
  if auth.uid() is null
    or not public.has_section_access('planned_tasks')
  then
    return 0;
  end if;

  select coalesce(array_agg(task_log_id) filter (where task_log_id is not null), '{}')
  into linked_task_log_ids
  from public.planned_tasks
  where assignee_id = target_assignee_id
    and scheduled_date = target_date
    and status = 'canceled';

  delete from public.planned_tasks
  where assignee_id = target_assignee_id
    and scheduled_date = target_date
    and status = 'canceled';

  get diagnostics deleted_rows = row_count;

  delete from public.task_logs
  where id = any(linked_task_log_ids);

  return deleted_rows;
end;
$$;

revoke all on function public.empty_planned_task_trash(uuid, date)
from public, anon;
grant execute on function public.empty_planned_task_trash(uuid, date)
to authenticated;
