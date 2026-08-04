create or replace function public.delete_planned_task(target_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_rows integer;
begin
  if auth.uid() is null
    or not public.has_section_access('planned_tasks')
  then
    return false;
  end if;

  delete from public.planned_tasks
  where id = target_id
    and status in ('new', 'planned')
    and task_log_id is null;

  get diagnostics deleted_rows = row_count;
  return deleted_rows = 1;
end;
$$;

revoke all on function public.delete_planned_task(bigint)
from public, anon;
grant execute on function public.delete_planned_task(bigint)
to authenticated;
