create index planned_tasks_task_log_idx
on public.planned_tasks (task_log_id)
where task_log_id is not null;
