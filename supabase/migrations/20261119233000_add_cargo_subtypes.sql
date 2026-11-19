alter table public.cargo_types
  add column if not exists parent_id bigint references public.cargo_types(id) on delete cascade;

create index if not exists cargo_types_parent_id_idx
  on public.cargo_types(parent_id);

create unique index if not exists cargo_types_parent_name_unique
  on public.cargo_types(coalesce(parent_id, 0), lower(name));

create or replace function public.add_cargo_subtype(
  target_parent_id bigint,
  cargo_type_name text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_id bigint;
begin
  if auth.uid() is null or not public.has_section_access('cargo_types') then
    raise exception 'Nav pieejas kravas veidiem.';
  end if;
  if not exists (
    select 1 from public.cargo_types
    where id = target_parent_id and parent_id is null
  ) then
    raise exception 'Kravas pamatveids nav atrasts.';
  end if;
  insert into public.cargo_types (name, parent_id)
  values (btrim(cargo_type_name), target_parent_id)
  returning id into created_id;
  return created_id;
end;
$$;

revoke execute on function public.add_cargo_subtype(bigint, text) from public, anon;
grant execute on function public.add_cargo_subtype(bigint, text) to authenticated, service_role;

with parent as (
  select id from public.cargo_types
  where lower(name) = lower('Celtniecības tehnika') and parent_id is null
  limit 1
)
insert into public.cargo_types (name, parent_id)
select item.name, parent.id
from parent
cross join (values
  ('Ekskavators 1,7 t'),
  ('Ekskavators 2,7 t'),
  ('Ekskavators 3,0 t'),
  ('Ekskavators 3,5 t'),
  ('Kompaktiekrāvējs 2,7 t'),
  ('Kompaktiekrāvējs 3,2 t'),
  ('Bliete 250 kg')
) as item(name)
on conflict do nothing;
