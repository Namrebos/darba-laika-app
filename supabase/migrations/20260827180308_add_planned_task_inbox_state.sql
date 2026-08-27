alter table public.planned_tasks
  alter column assignee_id drop not null;

alter table public.planned_tasks
  add column if not exists viewed_at timestamptz;

update public.planned_tasks
set viewed_at = coalesce(updated_at, created_at, now())
where viewed_at is null;

create or replace function public.prepare_received_planned_task()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'new' and new.transport_request_id is not null then
    new.assignee_id := null;
    new.viewed_at := null;
  end if;
  return new;
end;
$$;

revoke all on function public.prepare_received_planned_task()
from public, anon, authenticated;

drop trigger if exists prepare_received_planned_task on public.planned_tasks;
create trigger prepare_received_planned_task
before insert on public.planned_tasks
for each row execute function public.prepare_received_planned_task();
