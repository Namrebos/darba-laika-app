create table public.summary_access (
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (viewer_id, owner_id),
  check (viewer_id <> owner_id)
);

-- Saglabā iepriekšējo viena īpašnieka piekļuvi jau esošajiem viewer kontiem.
insert into public.summary_access (viewer_id, owner_id)
select id, data_owner_id
from public.profiles
where role = 'viewer' and id <> data_owner_id
on conflict do nothing;

alter table public.summary_access enable row level security;

create policy "Viewers read own grants and admins read all"
  on public.summary_access for select
  using (viewer_id = auth.uid() or public.current_app_role() = 'admin');

create policy "Admins add summary grants"
  on public.summary_access for insert
  with check (public.current_app_role() = 'admin');

create policy "Admins remove summary grants"
  on public.summary_access for delete
  using (public.current_app_role() = 'admin');

create or replace function public.can_read_summary(owner uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select
    $1 = auth.uid()
    or (
      (select role from public.profiles where id = auth.uid()) = 'viewer'
      and exists (
        select 1 from public.summary_access
        where viewer_id = auth.uid() and owner_id = $1
      )
    );
$$;

create or replace function public.get_accessible_summary_users()
returns table (id uuid, email text)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.email
  from public.profiles p
  where
    (p.id = auth.uid() and p.role in ('admin', 'member'))
    or exists (
      select 1 from public.summary_access a
      where a.viewer_id = auth.uid() and a.owner_id = p.id
    )
  order by p.email nulls last, p.id;
$$;

do $$
declare target_table text;
begin
  foreach target_table in array array['work_logs', 'task_logs', 'task_images', 'tags', 'task_timeline_events']
  loop
    execute format('drop policy if exists "Role based read" on public.%I', target_table);
    execute format('create policy "Role based read" on public.%I for select using (public.can_read_summary(user_id))', target_table);
  end loop;
end $$;

drop policy if exists "Role based read" on public.task_timers;
create policy "Role based read" on public.task_timers for select using (
  exists (
    select 1 from public.task_logs
    where task_logs.id = task_timers.task_log_id
      and public.can_read_summary(task_logs.user_id)
  )
);
