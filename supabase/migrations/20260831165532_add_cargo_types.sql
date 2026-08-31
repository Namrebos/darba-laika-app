create table public.cargo_types (
  id bigint generated always as identity primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cargo_types_name_not_blank check (nullif(btrim(name), '') is not null)
);

create unique index cargo_types_name_unique_ci
  on public.cargo_types (lower(btrim(name)));

insert into public.cargo_types (name)
values
  ('Būvmateriāli'),
  ('Lauksaimniecības tehnika'),
  ('Celtniecības tehnika'),
  ('Automašīna');

alter table public.cargo_types enable row level security;

create policy "Cargo types are readable"
on public.cargo_types for select
to anon, authenticated
using (true);

grant select on public.cargo_types to anon, authenticated;

create or replace function public.add_cargo_type(cargo_type_name text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_id bigint;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Administrator access required';
  end if;

  insert into public.cargo_types (name)
  values (btrim(cargo_type_name))
  returning id into created_id;
  return created_id;
end;
$$;

create or replace function public.update_cargo_type(
  target_cargo_type_id bigint,
  cargo_type_name text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Administrator access required';
  end if;

  update public.cargo_types
  set name = btrim(cargo_type_name), updated_at = now()
  where id = target_cargo_type_id;
  return found;
end;
$$;

create or replace function public.delete_cargo_type(target_cargo_type_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Administrator access required';
  end if;

  delete from public.cargo_types where id = target_cargo_type_id;
  return found;
end;
$$;

revoke all on function public.add_cargo_type(text) from public, anon;
revoke all on function public.update_cargo_type(bigint, text) from public, anon;
revoke all on function public.delete_cargo_type(bigint) from public, anon;
grant execute on function public.add_cargo_type(text) to authenticated;
grant execute on function public.update_cargo_type(bigint, text) to authenticated;
grant execute on function public.delete_cargo_type(bigint) to authenticated;
