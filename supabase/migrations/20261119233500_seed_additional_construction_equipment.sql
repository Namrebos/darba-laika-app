with parent as (
  select id from public.cargo_types
  where lower(name) = lower('Celtniecības tehnika') and parent_id is null
  limit 1
)
insert into public.cargo_types (name, parent_id)
select item.name, parent.id
from parent
cross join (values
  ('Ekskavators 3,5 t'),
  ('Bliete 250 kg')
) as item(name)
on conflict do nothing;
