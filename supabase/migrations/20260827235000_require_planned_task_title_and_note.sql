delete from public.planned_tasks
where status <> 'canceled'
  and (
    btrim(coalesce(title, '')) = ''
    or btrim(coalesce(note, '')) = ''
  );

alter table public.planned_tasks
  drop constraint if exists planned_tasks_title_and_note_required;

alter table public.planned_tasks
  add constraint planned_tasks_title_and_note_required
  check (
    status = 'canceled'
    or (
      btrim(title) <> ''
      and btrim(note) <> ''
    )
  );
