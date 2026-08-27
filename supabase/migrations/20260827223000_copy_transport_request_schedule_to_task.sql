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

    select request.pickup_date, request.pickup_time
    into new.scheduled_date, new.scheduled_time
    from public.transport_requests request
    where request.id = new.transport_request_id;
  end if;
  return new;
end;
$$;

revoke all on function public.prepare_received_planned_task()
from public, anon, authenticated;

update public.planned_tasks task
set
  scheduled_date = request.pickup_date,
  scheduled_time = request.pickup_time,
  updated_at = now()
from public.transport_requests request
where task.transport_request_id = request.id
  and task.status = 'new'
  and task.scheduled_date is null;
