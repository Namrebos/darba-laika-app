alter table public.planned_tasks
drop constraint planned_tasks_check;

alter table public.planned_tasks
add constraint planned_tasks_scheduled_date_check
check (status in ('new', 'canceled') or scheduled_date is not null);
