create or replace function public.sync_offline_task(
  client_id uuid,
  workday_client_id uuid,
  task_title text,
  task_note text,
  started_at timestamptz,
  ended_at timestamptz default null,
  planned_task_id bigint default null,
  is_deleted boolean default false,
  existing_task_id bigint default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  workday_id bigint;
  result_id bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select id into workday_id from public.work_logs
  where created_at = workday_client_id and user_id = auth.uid();
  if workday_id is null then raise exception 'Offline workday not found'; end if;

  if is_deleted then
    select id into result_id from public.task_logs
    where (offline_id = client_id or id = existing_task_id) and user_id = auth.uid();
    if planned_task_id is not null then
      if result_id is not null then
        update public.task_logs set deleted_at = now(), deleted_by = auth.uid() where id = result_id;
      end if;
      update public.planned_tasks
      set status = 'canceled', task_log_id = coalesce(task_log_id, result_id), updated_at = now()
      where id = planned_task_id and assignee_id = auth.uid();
    elsif result_id is not null and exists (select 1 from public.planned_tasks where task_log_id = result_id) then
      update public.task_logs set deleted_at = now(), deleted_by = auth.uid() where id = result_id;
      update public.planned_tasks set status = 'canceled', updated_at = now() where task_log_id = result_id;
    else
      delete from public.task_logs where id = result_id and user_id = auth.uid();
    end if;
    return null;
  end if;

  if existing_task_id is not null then
    update public.task_logs
    set offline_id = coalesce(offline_id, client_id), title = task_title,
        note = task_note, start_time = started_at, end_time = ended_at
    where id = existing_task_id and user_id = auth.uid()
    returning id into result_id;
  end if;

  if result_id is null then
    insert into public.task_logs (offline_id, session_id, title, note, start_time, end_time, user_id)
    values (client_id, workday_id, task_title, task_note, started_at, ended_at, auth.uid())
    on conflict (offline_id) where offline_id is not null do update
      set title = excluded.title, note = excluded.note,
          start_time = excluded.start_time, end_time = excluded.end_time
      where public.task_logs.user_id = auth.uid()
    returning id into result_id;
  end if;

  if result_id is null then raise exception 'Task belongs to another user'; end if;
  if planned_task_id is not null then
    update public.planned_tasks
    set task_log_id = result_id,
        status = case when ended_at is null then 'started' else 'completed' end,
        updated_at = now()
    where id = planned_task_id and assignee_id = auth.uid();
  end if;
  return result_id;
end;
$$;

revoke all on function public.sync_offline_task(uuid, uuid, text, text, timestamptz, timestamptz, bigint, boolean, bigint) from public, anon;
grant execute on function public.sync_offline_task(uuid, uuid, text, text, timestamptz, timestamptz, bigint, boolean, bigint) to authenticated;
