alter table public.work_logs
  add column if not exists is_test boolean not null default false;

create index if not exists work_logs_test_sessions_idx
  on public.work_logs (user_id, is_test, start_time desc);

create or replace function public.start_own_test_workday()
returns public.work_logs
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_workday public.work_logs%rowtype;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Administrator access required';
  end if;

  if exists (
    select 1
    from public.work_logs
    where user_id = auth.uid() and end_time is null
  ) then
    raise exception 'An active workday already exists';
  end if;

  insert into public.work_logs (
    project, start_time, end_time, description, user_id, is_test
  ) values (
    'Testa darbadiena', now(), null, 'Administratora testa režīms', auth.uid(), true
  )
  returning * into created_workday;

  return created_workday;
end;
$$;

revoke all on function public.start_own_test_workday()
from public, anon;
grant execute on function public.start_own_test_workday()
to authenticated;

create or replace function public.delete_own_test_workday(target_session_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_rows integer;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Administrator access required';
  end if;

  if not exists (
    select 1
    from public.work_logs
    where id = target_session_id
      and user_id = auth.uid()
      and is_test = true
  ) then
    raise exception 'Test workday not found';
  end if;

  perform set_config('app.test_workday_cleanup', 'true', true);

  update public.planned_tasks
  set status = 'planned',
      task_log_id = null,
      updated_at = now()
  where task_log_id in (
    select id from public.task_logs where session_id = target_session_id
  );

  delete from public.work_logs
  where id = target_session_id
    and user_id = auth.uid()
    and is_test = true;

  get diagnostics deleted_rows = row_count;
  return deleted_rows = 1;
end;
$$;

revoke all on function public.delete_own_test_workday(bigint)
from public, anon;
grant execute on function public.delete_own_test_workday(bigint)
to authenticated;

create or replace function public.queue_planned_task_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  preference_column boolean;
  message_title text;
  message_body text;
  message_type text;
begin
  if current_setting('app.test_workday_cleanup', true) = 'true' then
    return new;
  end if;

  if new.assignee_id is null then return new; end if;

  if new.status = 'planned' and (
    tg_op = 'INSERT'
    or old.status is distinct from 'planned'
    or old.assignee_id is distinct from new.assignee_id
  ) then
    message_type := 'assigned_task';
    message_title := 'Jauns uzdevums: ' || new.title;
    select assigned_tasks into preference_column from public.notification_preferences
    where user_id = new.assignee_id and enabled;
  elsif new.status = 'canceled' and old.status is distinct from new.status then
    message_type := 'task_canceled';
    message_title := 'Uzdevums atcelts: ' || new.title;
    select task_cancellations into preference_column from public.notification_preferences
    where user_id = new.assignee_id and enabled;
  elsif old.status = 'canceled' and new.status is distinct from old.status then
    message_type := 'task_restored';
    message_title := 'Uzdevums atjaunots: ' || new.title;
    select task_cancellations into preference_column from public.notification_preferences
    where user_id = new.assignee_id and enabled;
  elsif new.status in ('planned', 'started')
      and old.status in ('planned', 'started')
      and row(old.title, old.note, old.scheduled_date, old.scheduled_time)
        is distinct from row(new.title, new.note, new.scheduled_date, new.scheduled_time) then
    message_type := 'task_changed';
    message_title := 'Uzdevums mainīts: ' || new.title;
    select task_changes into preference_column from public.notification_preferences
    where user_id = new.assignee_id and enabled;
  else
    return new;
  end if;

  message_body := 'Izpildes datums: ' ||
    to_char(coalesce(new.scheduled_date, current_date), 'DD.MM.YYYY');

  if coalesce(preference_column, false) then
    insert into public.notification_queue(recipient_id, notification_type, title, body, url)
    values(
      new.assignee_id, message_type, message_title, message_body,
      '/summary?user=' || new.assignee_id::text ||
        '&date=' || coalesce(new.scheduled_date::text, current_date::text) ||
        '&plannedTask=' || new.id::text
    );
  end if;
  return new;
end;
$$;

revoke all on function public.queue_planned_task_notification()
from public, anon, authenticated;
