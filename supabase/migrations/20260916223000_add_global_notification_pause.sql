alter table public.notification_dispatch_config
  add column if not exists notifications_paused boolean not null default false;

alter table public.notification_queue
  add column if not exists originated_by_admin boolean not null default false;

create or replace function public.mark_notification_admin_origin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.originated_by_admin := exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
  return new;
end;
$$;

revoke all on function public.mark_notification_admin_origin()
  from public, anon, authenticated;

drop trigger if exists mark_notification_admin_origin
  on public.notification_queue;
create trigger mark_notification_admin_origin
before insert on public.notification_queue
for each row execute function public.mark_notification_admin_origin();
