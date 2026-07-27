update public.transport_requests
set pickup_address = 'Adrese iepriekš nav norādīta'
where pickup_address is null or trim(pickup_address) = '';

update public.transport_requests
set dropoff_address = 'Adrese iepriekš nav norādīta'
where dropoff_address is null or trim(dropoff_address) = '';

alter table public.transport_requests
  alter column pickup_address set not null,
  alter column dropoff_address set not null,
  alter column pickup_time drop not null,
  alter column dropoff_time drop not null;

alter table public.transport_requests
  drop constraint transport_requests_check,
  drop constraint transport_requests_check1;

alter table public.transport_requests
  add constraint transport_requests_sender_identity_check check (
    (
      sender_type = 'private'
      and nullif(trim(sender_first_name), '') is not null
      and nullif(trim(sender_last_name), '') is not null
    )
    or
    (
      sender_type = 'company'
      and nullif(trim(sender_company_name), '') is not null
    )
  ),
  add constraint transport_requests_recipient_identity_check check (
    (
      recipient_type = 'private'
      and nullif(trim(recipient_first_name), '') is not null
      and nullif(trim(recipient_last_name), '') is not null
    )
    or
    (
      recipient_type = 'company'
      and nullif(trim(recipient_company_name), '') is not null
    )
  ),
  add constraint transport_requests_pickup_address_check
    check (nullif(trim(pickup_address), '') is not null),
  add constraint transport_requests_dropoff_address_check
    check (nullif(trim(dropoff_address), '') is not null);

create or replace function public.submit_transport_request(
  target_token_hash text,
  payload jsonb
)
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
  select *
  into request_link
  from public.transport_request_links
  where token_hash = target_token_hash
    and submitted_at is null
    and expires_at > now()
  for update;

  if request_link.id is null then
    raise exception 'INVALID_REQUEST_LINK';
  end if;

  task_title := case
    when payload->>'sender_type' = 'company'
      then trim(payload->>'sender_company_name')
    else trim(
      concat_ws(
        ' ',
        payload->>'sender_first_name',
        payload->>'sender_last_name'
      )
    )
  end;

  task_note := trim(payload->>'cargo_type');
  if nullif(trim(payload->>'additional_notes'), '') is not null then
    task_note := task_note || E'\n' || trim(payload->>'additional_notes');
  end if;

  insert into public.transport_requests (
    link_id,
    created_by,
    sender_type,
    sender_first_name,
    sender_last_name,
    sender_company_name,
    sender_registration_number,
    sender_phone,
    recipient_type,
    recipient_first_name,
    recipient_last_name,
    recipient_company_name,
    recipient_registration_number,
    recipient_phone,
    pickup_address,
    pickup_lat,
    pickup_lng,
    pickup_date,
    pickup_time,
    pickup_notes,
    dropoff_address,
    dropoff_lat,
    dropoff_lng,
    dropoff_date,
    dropoff_time,
    dropoff_notes,
    cargo_type,
    additional_notes
  )
  values (
    request_link.id,
    request_link.created_by,
    payload->>'sender_type',
    nullif(trim(payload->>'sender_first_name'), ''),
    nullif(trim(payload->>'sender_last_name'), ''),
    nullif(trim(payload->>'sender_company_name'), ''),
    nullif(trim(payload->>'sender_registration_number'), ''),
    trim(payload->>'sender_phone'),
    payload->>'recipient_type',
    nullif(trim(payload->>'recipient_first_name'), ''),
    nullif(trim(payload->>'recipient_last_name'), ''),
    nullif(trim(payload->>'recipient_company_name'), ''),
    nullif(trim(payload->>'recipient_registration_number'), ''),
    trim(payload->>'recipient_phone'),
    trim(payload->>'pickup_address'),
    (payload->>'pickup_lat')::double precision,
    (payload->>'pickup_lng')::double precision,
    (payload->>'pickup_date')::date,
    nullif(trim(payload->>'pickup_time'), '')::time,
    coalesce(trim(payload->>'pickup_notes'), ''),
    trim(payload->>'dropoff_address'),
    (payload->>'dropoff_lat')::double precision,
    (payload->>'dropoff_lng')::double precision,
    (payload->>'dropoff_date')::date,
    nullif(trim(payload->>'dropoff_time'), '')::time,
    coalesce(trim(payload->>'dropoff_notes'), ''),
    trim(payload->>'cargo_type'),
    coalesce(trim(payload->>'additional_notes'), '')
  )
  returning * into created_request;

  insert into public.planned_tasks (
    created_by,
    assignee_id,
    title,
    note,
    status,
    transport_request_id
  )
  values (
    request_link.created_by,
    request_link.created_by,
    task_title,
    task_note,
    'new',
    created_request.id
  )
  returning * into created_task;

  update public.transport_request_links
  set submitted_at = now()
  where id = request_link.id;

  return jsonb_build_object(
    'request_id', created_request.id,
    'planned_task_id', created_task.id
  );
end;
$$;

revoke all
on function public.submit_transport_request(text, jsonb)
from public, anon, authenticated;

grant execute
on function public.submit_transport_request(text, jsonb)
to service_role;
