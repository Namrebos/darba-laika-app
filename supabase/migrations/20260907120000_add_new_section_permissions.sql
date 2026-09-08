alter table public.profiles
  add column if not exists can_access_fleet boolean not null default false,
  add column if not exists can_access_cargo_types boolean not null default false,
  add column if not exists can_access_partners boolean not null default false;

alter table public.user_invitations
  add column if not exists can_access_fleet boolean not null default false,
  add column if not exists can_access_cargo_types boolean not null default false,
  add column if not exists can_access_partners boolean not null default false;

update public.profiles
set can_access_fleet = true,
    can_access_cargo_types = true,
    can_access_partners = true
where role = 'admin';

create or replace function public.has_section_access(required_section text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select
        p.role = 'admin'
        or case required_section
          when 'workday' then p.can_access_workday
          when 'finance' then p.can_access_finance
          when 'calculators' then p.can_access_calculators
          when 'planned_tasks' then p.can_access_planned_tasks
          when 'fleet' then p.can_access_fleet
          when 'cargo_types' then p.can_access_cargo_types
          when 'partners' then p.can_access_partners
          else false
        end
      from public.profiles p
      where p.id = (select auth.uid())
    ),
    false
  );
$$;

revoke all on function public.has_section_access(text) from public;
grant execute on function public.has_section_access(text) to authenticated;

drop policy if exists "Planned task users can view vehicles" on public.vehicles;
create policy "Fleet users can view vehicles"
on public.vehicles for select to authenticated
using ((select public.has_section_access('fleet')) or (select public.has_section_access('planned_tasks')));

create or replace function public.add_vehicle(vehicle_registration_number text, vehicle_display_name text default '')
returns public.vehicles
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_registration text;
  saved_vehicle public.vehicles;
begin
  if auth.uid() is null or not public.has_section_access('fleet') then
    raise exception 'Nav tiesību pievienot auto.';
  end if;
  normalized_registration := upper(regexp_replace(trim(vehicle_registration_number), '[^[:alnum:]]', '', 'g'));
  if char_length(normalized_registration) not between 2 and 15 then
    raise exception 'Ievadi korektu auto valsts reģistrācijas numuru.';
  end if;
  insert into public.vehicles (registration_number, registration_key, display_name, created_by)
  values (upper(trim(vehicle_registration_number)), normalized_registration, coalesce(trim(vehicle_display_name), ''), auth.uid())
  on conflict (registration_key) do update
  set registration_number = excluded.registration_number,
      display_name = case when excluded.display_name <> '' then excluded.display_name else public.vehicles.display_name end,
      is_active = true,
      updated_at = now()
  returning * into saved_vehicle;
  return saved_vehicle;
end;
$$;

create or replace function public.update_vehicle(target_vehicle_id bigint, vehicle_registration_number text, vehicle_display_name text)
returns public.vehicles
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_registration text;
  saved_vehicle public.vehicles;
begin
  if auth.uid() is null or not public.has_section_access('fleet') then raise exception 'Nav tiesību rediģēt auto.'; end if;
  normalized_registration := upper(regexp_replace(trim(vehicle_registration_number), '[^[:alnum:]]', '', 'g'));
  if char_length(normalized_registration) not between 2 and 15 then raise exception 'Ievadi korektu auto valsts reģistrācijas numuru.'; end if;
  if trim(coalesce(vehicle_display_name, '')) = '' then raise exception 'Ievadi auto nosaukumu.'; end if;
  update public.vehicles
  set registration_number = upper(trim(vehicle_registration_number)), registration_key = normalized_registration,
      display_name = trim(vehicle_display_name), updated_at = now()
  where id = target_vehicle_id and is_active = true returning * into saved_vehicle;
  if saved_vehicle.id is null then raise exception 'Auto nav atrasts.'; end if;
  return saved_vehicle;
exception when unique_violation then raise exception 'Auto ar šādu VNZ jau ir pievienots.';
end;
$$;

create or replace function public.archive_vehicle(target_vehicle_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.has_section_access('fleet') then raise exception 'Nav tiesību dzēst auto.'; end if;
  update public.vehicles set is_active = false, updated_at = now() where id = target_vehicle_id and is_active = true;
  if not found then raise exception 'Auto nav atrasts.'; end if;
end;
$$;

create or replace function public.add_cargo_type(cargo_type_name text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare created_id bigint;
begin
  if auth.uid() is null or not public.has_section_access('cargo_types') then raise exception 'Nav pieejas kravas veidiem.'; end if;
  insert into public.cargo_types (name) values (btrim(cargo_type_name)) returning id into created_id;
  return created_id;
end;
$$;

create or replace function public.update_cargo_type(target_cargo_type_id bigint, cargo_type_name text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.has_section_access('cargo_types') then raise exception 'Nav pieejas kravas veidiem.'; end if;
  update public.cargo_types set name = btrim(cargo_type_name), updated_at = now() where id = target_cargo_type_id;
  return found;
end;
$$;

create or replace function public.delete_cargo_type(target_cargo_type_id bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.has_section_access('cargo_types') then raise exception 'Nav pieejas kravas veidiem.'; end if;
  delete from public.cargo_types where id = target_cargo_type_id;
  return found;
end;
$$;

drop policy if exists "Admins can view partners" on public.partners;
drop policy if exists "Admins can add partners" on public.partners;
drop policy if exists "Admins can update partners" on public.partners;
drop policy if exists "Admins can delete partners" on public.partners;
create policy "Partner users can view partners" on public.partners for select to authenticated using ((select public.has_section_access('partners')));
create policy "Partner users can add partners" on public.partners for insert to authenticated with check ((select public.has_section_access('partners')) and created_by = (select auth.uid()));
create policy "Partner users can update partners" on public.partners for update to authenticated using ((select public.has_section_access('partners'))) with check ((select public.has_section_access('partners')));
create policy "Partner users can delete partners" on public.partners for delete to authenticated using ((select public.has_section_access('partners')));

drop policy if exists "Admins can view partner contacts" on public.partner_contacts;
drop policy if exists "Admins can add partner contacts" on public.partner_contacts;
drop policy if exists "Admins can update partner contacts" on public.partner_contacts;
drop policy if exists "Admins can delete partner contacts" on public.partner_contacts;
create policy "Partner users can view partner contacts" on public.partner_contacts for select to authenticated using ((select public.has_section_access('partners')));
create policy "Partner users can add partner contacts" on public.partner_contacts for insert to authenticated with check ((select public.has_section_access('partners')));
create policy "Partner users can update partner contacts" on public.partner_contacts for update to authenticated using ((select public.has_section_access('partners'))) with check ((select public.has_section_access('partners')));
create policy "Partner users can delete partner contacts" on public.partner_contacts for delete to authenticated using ((select public.has_section_access('partners')));
