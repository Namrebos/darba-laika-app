create table public.work_log_corrections (
  id bigint generated always as identity primary key,
  work_log_id bigint,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  changed_by uuid not null references public.profiles(id) on delete cascade,
  action text not null check (action in ('created', 'updated')),
  previous_start_time timestamptz,
  previous_end_time timestamptz,
  new_start_time timestamptz not null,
  new_end_time timestamptz not null,
  created_at timestamptz not null default now()
);

create index work_log_corrections_work_log_idx
  on public.work_log_corrections (work_log_id, created_at desc);

create index work_log_corrections_owner_idx
  on public.work_log_corrections (owner_id, created_at desc);

alter table public.work_log_corrections enable row level security;

revoke all on table public.work_log_corrections from anon, authenticated;
revoke all on sequence public.work_log_corrections_id_seq from anon, authenticated;
