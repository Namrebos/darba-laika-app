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
    select 1
    from public.cargo_types target
    left join public.cargo_types parent on parent.id = target.parent_id
    where target.id = target_parent_id
      and (target.parent_id is null or parent.parent_id is null)
  ) then
    raise exception 'Kravas veida līmenis nav atrasts.';
  end if;
  insert into public.cargo_types (name, parent_id)
  values (btrim(cargo_type_name), target_parent_id)
  returning id into created_id;
  return created_id;
end;
$$;

revoke execute on function public.add_cargo_subtype(bigint, text) from public, anon;
grant execute on function public.add_cargo_subtype(bigint, text) to authenticated, service_role;

drop index if exists public.cargo_types_name_unique_ci;

with construction as (
  select id from public.cargo_types
  where lower(name) = lower('Celtniecības tehnika') and parent_id is null
  limit 1
)
insert into public.cargo_types (name, parent_id)
select category.name, construction.id
from construction
cross join (values
  ('Kompaktiekrāvējs'),
  ('Ekskavators'),
  ('Frontālais iekrāvējs'),
  ('Bliete')
) as category(name)
on conflict do nothing;

update public.cargo_types item
set name = regexp_replace(item.name, '^Ekskavators\s+', '', 'i'),
    parent_id = category.id
from public.cargo_types category
join public.cargo_types construction on construction.id = category.parent_id
where lower(construction.name) = lower('Celtniecības tehnika')
  and lower(category.name) = lower('Ekskavators')
  and item.parent_id = construction.id
  and item.name ~* '^Ekskavators\s+';

update public.cargo_types item
set name = regexp_replace(item.name, '^Kompaktiekrāvējs\s+', '', 'i'),
    parent_id = category.id
from public.cargo_types category
join public.cargo_types construction on construction.id = category.parent_id
where lower(construction.name) = lower('Celtniecības tehnika')
  and lower(category.name) = lower('Kompaktiekrāvējs')
  and item.parent_id = construction.id
  and item.name ~* '^Kompaktiekrāvējs\s+';

update public.cargo_types item
set name = regexp_replace(item.name, '^Bliete\s+', '', 'i'),
    parent_id = category.id
from public.cargo_types category
join public.cargo_types construction on construction.id = category.parent_id
where lower(construction.name) = lower('Celtniecības tehnika')
  and lower(category.name) = lower('Bliete')
  and item.parent_id = construction.id
  and item.name ~* '^Bliete\s+';
