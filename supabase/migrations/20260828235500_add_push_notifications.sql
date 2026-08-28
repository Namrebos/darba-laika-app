create table public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

create table public.notification_queue (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text not null,
  url text not null default '/',
  dedupe_key text unique,
  deliver_after timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index notification_queue_pending_idx
  on public.notification_queue(deliver_after, created_at)
  where sent_at is null;
alter table public.notification_queue enable row level security;
revoke all on public.notification_queue from anon, authenticated;

create table public.notification_dispatch_config (
  id boolean primary key default true check (id),
  dispatch_token text not null,
  token_hash text not null
);
alter table public.notification_dispatch_config enable row level security;
revoke all on public.notification_dispatch_config from anon, authenticated;

insert into public.notification_dispatch_config(id, dispatch_token, token_hash)
select true, token, encode(digest(token, 'sha256'), 'hex')
from (select encode(gen_random_bytes(32), 'hex') as token) generated
on conflict (id) do nothing;

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

  if tg_op = 'INSERT' then
    message_type := 'assigned_task';
    message_title := 'Jauns uzdevums';
    message_body := new.title;
    select assigned_tasks into preference_column
    from public.notification_preferences
    where user_id = new.assignee_id and enabled;
  elsif old.assignee_id is distinct from new.assignee_id then
    message_type := 'assigned_task';
    message_title := 'Jauns uzdevums';
    message_body := new.title;
    select assigned_tasks into preference_column
    from public.notification_preferences
    where user_id = new.assignee_id and enabled;
  elsif new.status = 'canceled' and old.status is distinct from new.status then
    message_type := 'task_canceled';
    message_title := 'Uzdevums atcelts';
    message_body := new.title;
    select task_cancellations into preference_column
    from public.notification_preferences
    where user_id = new.assignee_id and enabled;
  elsif old.status = 'canceled' and new.status is distinct from old.status then
    message_type := 'task_restored';
    message_title := 'Uzdevums atjaunots';
    message_body := new.title;
    select task_cancellations into preference_column
    from public.notification_preferences
    where user_id = new.assignee_id and enabled;
  elsif row(old.title, old.note, old.scheduled_date, old.scheduled_time, old.assignee_id)
      is distinct from
      row(new.title, new.note, new.scheduled_date, new.scheduled_time, new.assignee_id) then
    message_type := 'task_changed';
    message_title := 'Uzdevums mainīts';
    message_body := new.title;
    select task_changes into preference_column
    from public.notification_preferences
    where user_id = new.assignee_id and enabled;
  else
    return new;
  end if;

  if coalesce(preference_column, false) then
    insert into public.notification_queue(recipient_id, notification_type, title, body, url)
    values(new.assignee_id, message_type, message_title, message_body, '/workday');
  end if;
  return new;
end;
$$;
revoke all on function public.queue_planned_task_notification() from public, anon, authenticated;

create trigger queue_planned_task_notification
after insert or update on public.planned_tasks
for each row execute function public.queue_planned_task_notification();

create or replace function public.queue_new_transport_request_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notification_queue(recipient_id, notification_type, title, body, url)
  select p.id, 'new_request', 'Jauns brauciena pieteikums',
    coalesce(nullif(trim(new.sender_company_name), ''), nullif(trim(new.sender_first_name), ''), 'Jauns klients'),
    '/planned-tasks'
  from public.profiles p
  join public.notification_preferences np on np.user_id = p.id
  where p.role = 'admin' and np.enabled and np.new_requests;
  return new;
end;
$$;
revoke all on function public.queue_new_transport_request_notification() from public, anon, authenticated;

create trigger queue_new_transport_request_notification
after insert on public.transport_requests
for each row execute function public.queue_new_transport_request_notification();

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'darba-laika-push-notifications',
  '* * * * *',
  $cron$
  with local_time as (
    select now() at time zone 'Europe/Riga' as current_local
  )
  insert into public.notification_queue(
    recipient_id, notification_type, title, body, url, dedupe_key
  )
  select np.user_id, reminder.kind, reminder.title, reminder.body, '/workday',
    np.user_id::text || ':' || reminder.kind || ':' || local_time.current_local::date::text
  from public.notification_preferences np
  cross join local_time
  cross join lateral (
    values
      ('work_start', 'Darba dienas sākums', 'Laiks sākt darba dienu.', np.work_start_reminders, np.work_start_reminder_time),
      ('work_end', 'Darba dienas beigas', 'Laiks pabeigt darba dienu.', np.work_end_reminders, np.work_end_reminder_time)
  ) as reminder(kind, title, body, is_enabled, reminder_time)
  where np.enabled
    and reminder.is_enabled
    and extract(isodow from local_time.current_local) between 1 and 5
    and date_trunc('minute', local_time.current_local)::time = reminder.reminder_time
  on conflict (dedupe_key) do nothing;

  select net.http_post(
    url := 'https://darba-laika-app.vercel.app/api/notifications/dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || dispatch_token
    ),
    body := '{}'::jsonb
  )
  from public.notification_dispatch_config
  where id = true;
  $cron$
);
