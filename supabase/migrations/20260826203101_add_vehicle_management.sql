create or replace function public.update_vehicle(
  target_vehicle_id bigint,
  vehicle_registration_number text,
  vehicle_display_name text
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
    raise exception 'Nav tiesību rediģēt auto.';
  end if;

  normalized_registration := upper(
    regexp_replace(trim(vehicle_registration_number), '[^[:alnum:]]', '', 'g')
  );
  if char_length(normalized_registration) not between 2 and 15 then
    raise exception 'Ievadi korektu auto valsts reģistrācijas numuru.';
  end if;
  if trim(coalesce(vehicle_display_name, '')) = '' then
    raise exception 'Ievadi auto nosaukumu.';
  end if;

  update public.vehicles
  set registration_number = upper(trim(vehicle_registration_number)),
      registration_key = normalized_registration,
      display_name = trim(vehicle_display_name),
      updated_at = now()
  where id = target_vehicle_id and is_active = true
  returning * into saved_vehicle;

  if saved_vehicle.id is null then
    raise exception 'Auto nav atrasts.';
  end if;
  return saved_vehicle;
exception
  when unique_violation then
    raise exception 'Auto ar šādu VNZ jau ir pievienots.';
end;
$$;

revoke all on function public.update_vehicle(bigint, text, text) from public, anon;
grant execute on function public.update_vehicle(bigint, text, text) to authenticated;

create or replace function public.archive_vehicle(target_vehicle_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.has_section_access('planned_tasks') then
    raise exception 'Nav tiesību dzēst auto.';
  end if;

  update public.vehicles
  set is_active = false, updated_at = now()
  where id = target_vehicle_id and is_active = true;

  if not found then
    raise exception 'Auto nav atrasts.';
  end if;
end;
$$;

revoke all on function public.archive_vehicle(bigint) from public, anon;
grant execute on function public.archive_vehicle(bigint) to authenticated;
