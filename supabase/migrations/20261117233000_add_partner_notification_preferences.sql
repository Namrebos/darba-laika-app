alter table public.notification_preferences
  add column if not exists partner_all_status_changes boolean not null default true,
  add column if not exists partner_status_sent boolean not null default true,
  add column if not exists partner_status_planned boolean not null default true,
  add column if not exists partner_status_started boolean not null default true,
  add column if not exists partner_status_completed boolean not null default true,
  add column if not exists partner_status_canceled boolean not null default true;

create or replace function public.delete_partner_new_request(
  target_request_id bigint,
  target_partner_id bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_task public.planned_tasks%rowtype;
begin
  select task.* into target_task
  from public.planned_tasks task
  join public.transport_requests request on request.id = task.transport_request_id
  where request.id = target_request_id
    and request.partner_id = target_partner_id
    and task.status in ('new', 'planned')
  for update;

  if target_task.id is null then return false; end if;
  delete from public.planned_tasks where id = target_task.id;
  delete from public.transport_requests
    where id = target_request_id and partner_id = target_partner_id;
  return true;
end;
$$;

revoke all on function public.delete_partner_new_request(bigint, bigint)
  from public, anon, authenticated;
grant execute on function public.delete_partner_new_request(bigint, bigint)
  to service_role;

create or replace function public.queue_partner_task_status_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  status_label text;
begin
  if old.status is not distinct from new.status
    or new.transport_request_id is null
  then
    return new;
  end if;

  status_label := case new.status
    when 'new' then 'Nosūtīts'
    when 'planned' then 'Plānots'
    when 'started' then 'Sākts'
    when 'completed' then 'Pabeigts'
    when 'canceled' then 'Atcelts'
    else new.status
  end;

  insert into public.notification_queue(
    recipient_id,
    notification_type,
    title,
    body,
    url
  )
  select
    account.user_id,
    'partner_status_' || new.status,
    'Brauciena statuss: ' || status_label,
    new.title,
    '/partner-portal'
  from public.transport_requests request
  join public.partner_portal_accounts account
    on account.partner_id = request.partner_id
  join public.notification_preferences preference
    on preference.user_id = account.user_id
  where request.id = new.transport_request_id
    and preference.enabled
    and (
      preference.partner_all_status_changes
      or case new.status
        when 'new' then preference.partner_status_sent
        when 'planned' then preference.partner_status_planned
        when 'started' then preference.partner_status_started
        when 'completed' then preference.partner_status_completed
        when 'canceled' then preference.partner_status_canceled
        else false
      end
    );

  return new;
end;
$$;

revoke all on function public.queue_partner_task_status_notification()
  from public, anon, authenticated;

drop trigger if exists queue_partner_task_status_notification on public.planned_tasks;
create trigger queue_partner_task_status_notification
after update of status on public.planned_tasks
for each row execute function public.queue_partner_task_status_notification();
