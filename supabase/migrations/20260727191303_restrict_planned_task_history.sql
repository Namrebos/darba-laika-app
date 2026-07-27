drop policy if exists "Read accessible planned tasks"
on public.planned_tasks;

create policy "Read accessible planned tasks"
  on public.planned_tasks for select
  to authenticated
  using (
    (select public.has_section_access('planned_tasks'))
    or (
      assignee_id = (select auth.uid())
      and status <> 'new'
    )
    or (
      status <> 'new'
      and public.can_read_summary(assignee_id)
      and public.can_read_summary_date(
        scheduled_date::timestamp at time zone 'Europe/Riga'
      )
    )
  );
