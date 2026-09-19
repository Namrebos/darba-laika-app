alter table public.transport_requests
  add column if not exists submission_source text;

update public.transport_requests
set submission_source = case
  when partner_id is not null then 'partner'
  when exists (
    select 1
    from public.profiles
    where profiles.id = transport_requests.created_by
      and profiles.role = 'admin'
  ) then 'admin'
  else 'user'
end
where submission_source is null;

alter table public.transport_requests
  alter column submission_source set default 'user',
  alter column submission_source set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transport_requests_submission_source_check'
      and conrelid = 'public.transport_requests'::regclass
  ) then
    alter table public.transport_requests
      add constraint transport_requests_submission_source_check
      check (submission_source in ('admin', 'user', 'partner'));
  end if;
end
$$;

create index if not exists transport_requests_submission_source_created_idx
  on public.transport_requests (submission_source, created_at desc);
