create table if not exists public.vehicles (
  id bigint generated always as identity primary key,
  registration_number text not null,
  registration_key text not null unique,
  display_name text not null default '',
  usage_count integer not null default 0 check (usage_count >= 0),
  last_used_at timestamptz,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicles_registration_key_length check (
    char_length(registration_key) between 2 and 15
  )
);

alter table public.vehicles enable row level security;

create policy "Planned task users can view vehicles"
on public.vehicles
for select
to authenticated
using (public.has_section_access('planned_tasks'));

grant select on public.vehicles to authenticated;

create or replace function public.add_vehicle(
  vehicle_registration_number text,
  vehicle_display_name text default ''
)
returns public.vehicles
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_registration text;
  saved_vehicle public.vehicles;
begin
  if auth.uid() is null or not public.has_section_access('planned_tasks') then
    raise exception 'Nav tiesību pievienot auto.';
  end if;

  normalized_registration := upper(
    regexp_replace(trim(vehicle_registration_number), '[^[:alnum:]]', '', 'g')
  );

  if char_length(normalized_registration) not between 2 and 15 then
    raise exception 'Ievadi korektu auto valsts reģistrācijas numuru.';
  end if;

  insert into public.vehicles (
    registration_number,
    registration_key,
    display_name,
    created_by
  )
  values (
    upper(trim(vehicle_registration_number)),
    normalized_registration,
    coalesce(trim(vehicle_display_name), ''),
    auth.uid()
  )
  on conflict (registration_key) do update
  set registration_number = excluded.registration_number,
      display_name = case
        when excluded.display_name <> '' then excluded.display_name
        else public.vehicles.display_name
      end,
      is_active = true,
      updated_at = now()
  returning * into saved_vehicle;

  return saved_vehicle;
end;
$$;

revoke all on function public.add_vehicle(text, text) from public, anon;
grant execute on function public.add_vehicle(text, text) to authenticated;

alter table public.planned_tasks
  add column if not exists vehicle_id bigint references public.vehicles(id) on delete set null;

create index if not exists planned_tasks_vehicle_id_idx
  on public.planned_tasks(vehicle_id);

create or replace function public.track_vehicle_usage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.vehicle_id is not null
     and (tg_op = 'INSERT' or new.vehicle_id is distinct from old.vehicle_id) then
    update public.vehicles
    set usage_count = usage_count + 1,
        last_used_at = now(),
        updated_at = now()
    where id = new.vehicle_id;
  end if;
  return new;
end;
$$;

revoke all on function public.track_vehicle_usage() from public, anon, authenticated;

drop trigger if exists planned_tasks_track_vehicle_usage on public.planned_tasks;
create trigger planned_tasks_track_vehicle_usage
after insert or update of vehicle_id on public.planned_tasks
for each row execute function public.track_vehicle_usage();
