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
