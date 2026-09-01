alter table public.carrier_settings
  add column display_name text not null default '',
  add column partner_type text not null default 'company' check (partner_type in ('private', 'company')),
  add column first_name text,
  add column last_name text,
  add column registration_number text,
  add column address text not null default '',
  add column latitude double precision,
  add column longitude double precision,
  add column email text,
  add column contacts jsonb not null default '[]'::jsonb;

update public.carrier_settings
set display_name = company_name
where display_name = '' and company_name <> '';

alter table public.carrier_settings
  add constraint carrier_settings_location_pair_check check (
    (latitude is null and longitude is null)
    or (latitude between -90 and 90 and longitude between -180 and 180)
  ),
  add constraint carrier_settings_contacts_array_check check (jsonb_typeof(contacts) = 'array');
