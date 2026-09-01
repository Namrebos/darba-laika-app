create table public.partners (
  id bigint generated always as identity primary key,
  partner_type text not null check (partner_type in ('private', 'company')),
  first_name text,
  last_name text,
  company_name text,
  registration_number text,
  address text not null,
  phone text not null,
  email text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partners_identity_check check (
    (partner_type = 'private' and nullif(btrim(first_name), '') is not null)
    or
    (partner_type = 'company' and nullif(btrim(company_name), '') is not null
      and nullif(btrim(registration_number), '') is not null)
  ),
  constraint partners_address_not_blank check (nullif(btrim(address), '') is not null),
  constraint partners_phone_not_blank check (nullif(btrim(phone), '') is not null)
);

create index partners_name_idx on public.partners (
  lower(coalesce(company_name, first_name, '')),
  lower(coalesce(last_name, ''))
);

alter table public.partners enable row level security;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke all on function public.current_user_is_admin() from public, anon;
grant execute on function public.current_user_is_admin() to authenticated;

create policy "Admins can view partners"
on public.partners for select to authenticated
using ((select public.current_user_is_admin()));

create policy "Admins can add partners"
on public.partners for insert to authenticated
with check (
  (select public.current_user_is_admin())
  and created_by = (select auth.uid())
);

create policy "Admins can update partners"
on public.partners for update to authenticated
using ((select public.current_user_is_admin()))
with check (
  (select public.current_user_is_admin())
  and created_by = (select auth.uid())
);

create policy "Admins can delete partners"
on public.partners for delete to authenticated
using ((select public.current_user_is_admin()));

grant select, insert, update, delete on public.partners to authenticated;
grant usage, select on sequence public.partners_id_seq to authenticated;

alter table public.transport_requests
  add column partner_id bigint references public.partners(id) on delete set null,
  add column sender_address text,
  add column sender_email text;

create index transport_requests_partner_id_idx
  on public.transport_requests(partner_id);

create or replace function public.submit_transport_request(target_token_hash text, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_link public.transport_request_links%rowtype;
  created_request public.transport_requests%rowtype;
  created_task public.planned_tasks%rowtype;
  task_title text;
  task_note text;
begin
  select * into request_link
  from public.transport_request_links
  where token_hash = target_token_hash and submitted_at is null and expires_at > now()
  for update;

  if request_link.id is null then raise exception 'INVALID_REQUEST_LINK'; end if;

  task_title := case when payload->>'sender_type' = 'company'
    then trim(payload->>'sender_company_name')
    else trim(concat_ws(' ', payload->>'sender_first_name', payload->>'sender_last_name')) end;
  task_note := trim(payload->>'cargo_type');
  if nullif(trim(payload->>'additional_notes'), '') is not null then
    task_note := task_note || E'\n' || trim(payload->>'additional_notes');
  end if;

  insert into public.transport_requests (
    link_id, created_by, partner_id,
    sender_type, sender_first_name, sender_last_name, sender_company_name,
    sender_registration_number, sender_phone, sender_address, sender_email,
    recipient_type, recipient_first_name, recipient_last_name,
    recipient_company_name, recipient_registration_number, recipient_phone,
    pickup_contact_name, pickup_contact_phone, dropoff_contact_name, dropoff_contact_phone,
    pickup_address, pickup_lat, pickup_lng, pickup_date, pickup_time, pickup_notes,
    dropoff_address, dropoff_lat, dropoff_lng, dropoff_date, dropoff_time, dropoff_notes,
    cargo_type, additional_notes
  ) values (
    request_link.id, request_link.created_by,
    nullif(payload->>'partner_id', '')::bigint,
    payload->>'sender_type', nullif(trim(payload->>'sender_first_name'), ''),
    nullif(trim(payload->>'sender_last_name'), ''), nullif(trim(payload->>'sender_company_name'), ''),
    nullif(trim(payload->>'sender_registration_number'), ''), trim(payload->>'sender_phone'),
    nullif(trim(payload->>'sender_address'), ''), nullif(trim(payload->>'sender_email'), ''),
    'private', nullif(trim(payload->>'dropoff_contact_name'), ''), null, null, null,
    trim(payload->>'dropoff_contact_phone'),
    nullif(trim(payload->>'pickup_contact_name'), ''), trim(payload->>'pickup_contact_phone'),
    nullif(trim(payload->>'dropoff_contact_name'), ''), trim(payload->>'dropoff_contact_phone'),
    trim(payload->>'pickup_address'), (payload->>'pickup_lat')::double precision,
    (payload->>'pickup_lng')::double precision, (payload->>'pickup_date')::date,
    nullif(trim(payload->>'pickup_time'), '')::time, coalesce(trim(payload->>'pickup_notes'), ''),
    trim(payload->>'dropoff_address'), (payload->>'dropoff_lat')::double precision,
    (payload->>'dropoff_lng')::double precision, (payload->>'dropoff_date')::date,
    nullif(trim(payload->>'dropoff_time'), '')::time, coalesce(trim(payload->>'dropoff_notes'), ''),
    trim(payload->>'cargo_type'), coalesce(trim(payload->>'additional_notes'), '')
  ) returning * into created_request;

  insert into public.planned_tasks (created_by, assignee_id, title, note, status, transport_request_id)
  values (request_link.created_by, request_link.created_by, task_title, task_note, 'new', created_request.id)
  returning * into created_task;

  update public.transport_request_links set submitted_at = now() where id = request_link.id;
  return jsonb_build_object('request_id', created_request.id, 'planned_task_id', created_task.id);
end;
$$;

revoke all on function public.submit_transport_request(text, jsonb) from public, anon, authenticated;
grant execute on function public.submit_transport_request(text, jsonb) to service_role;
