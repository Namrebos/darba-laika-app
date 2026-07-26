create type public.app_role as enum ('admin', 'member', 'viewer');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role public.app_role not null default 'member',
  data_owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Pašlaik vecākais konts kļūst par administratoru; pārējie esošie konti ir
-- neatkarīgi datu ievadītāji.
insert into public.profiles (id, email, role, data_owner_id)
select
  id,
  email,
  case when row_number() over (order by created_at, id) = 1
    then 'admin'::public.app_role
    else 'member'::public.app_role
  end,
  id
from auth.users;

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, role, data_owner_id)
  values (
    new.id,
    new.email,
    case
      when new.raw_user_meta_data ->> 'invited_role' = 'viewer' then 'viewer'::public.app_role
      else 'member'::public.app_role
    end,
    case
      when new.raw_user_meta_data ->> 'invited_role' = 'viewer'
        and coalesce(new.raw_user_meta_data ->> 'invited_by', '') ~* '^[0-9a-f-]{36}$'
      then (new.raw_user_meta_data ->> 'invited_by')::uuid
      else new.id
    end
  );
  return new;
end;
$$;

create trigger create_profile_after_signup
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

create or replace function public.current_app_role()
returns public.app_role
language sql stable security definer set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_data_owner_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select data_owner_id from public.profiles where id = auth.uid();
$$;

alter table public.profiles enable row level security;

create policy "Users read own profile and admins read all"
  on public.profiles for select
  using (id = auth.uid() or public.current_app_role() = 'admin');

create policy "Admins update profiles"
  on public.profiles for update
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

-- Pamatdati: ievadītājs redz/raksta tikai savus datus. Viewer redz norādītā
-- īpašnieka datus, bet viņam nav nevienas rakstīšanas politikas.
do $$
declare
  target_table text;
  old_policy record;
begin
  foreach target_table in array array['work_logs', 'task_logs', 'task_images', 'tags', 'task_timeline_events']
  loop
    execute format('alter table public.%I enable row level security', target_table);
    for old_policy in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = target_table
    loop
      execute format('drop policy %I on public.%I', old_policy.policyname, target_table);
    end loop;
    execute format('create policy "Role based read" on public.%I for select using (user_id = public.current_data_owner_id())', target_table);
    execute format('create policy "Role based insert" on public.%I for insert with check (public.current_app_role() in (''admin'', ''member'') and user_id = auth.uid())', target_table);
    execute format('create policy "Role based update" on public.%I for update using (public.current_app_role() in (''admin'', ''member'') and user_id = auth.uid()) with check (user_id = auth.uid())', target_table);
    execute format('create policy "Role based delete" on public.%I for delete using (public.current_app_role() in (''admin'', ''member'') and user_id = auth.uid())', target_table);
  end loop;
end $$;

-- Taimeriem nav user_id, tāpēc īpašnieku nosaka saistītais uzdevums.
alter table public.task_timers enable row level security;
do $$
declare old_policy record;
begin
  for old_policy in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'task_timers'
  loop
    execute format('drop policy %I on public.task_timers', old_policy.policyname);
  end loop;
end $$;

create policy "Role based read" on public.task_timers for select using (
  exists (select 1 from public.task_logs where task_logs.id = task_timers.task_log_id and task_logs.user_id = public.current_data_owner_id())
);
create policy "Role based insert" on public.task_timers for insert with check (
  public.current_app_role() in ('admin', 'member') and
  exists (select 1 from public.task_logs where task_logs.id = task_timers.task_log_id and task_logs.user_id = auth.uid())
);
create policy "Role based update" on public.task_timers for update using (
  public.current_app_role() in ('admin', 'member') and
  exists (select 1 from public.task_logs where task_logs.id = task_timers.task_log_id and task_logs.user_id = auth.uid())
);
create policy "Role based delete" on public.task_timers for delete using (
  public.current_app_role() in ('admin', 'member') and
  exists (select 1 from public.task_logs where task_logs.id = task_timers.task_log_id and task_logs.user_id = auth.uid())
);
