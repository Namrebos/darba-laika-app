create table public.transport_request_links (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  created_by uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);

create index transport_request_links_creator_idx
  on public.transport_request_links (created_by, created_at desc);
create index transport_request_links_expiry_idx
  on public.transport_request_links (expires_at)
  where submitted_at is null;

create table public.transport_requests (
  id bigint generated always as identity primary key,
  link_id uuid not null unique
    references public.transport_request_links(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete cascade,
  sender_type text not null check (sender_type in ('private', 'company')),
  sender_first_name text,
  sender_last_name text,
  sender_company_name text,
  sender_registration_number text,
  sender_phone text not null,
  recipient_type text not null check (recipient_type in ('private', 'company')),
  recipient_first_name text,
  recipient_last_name text,
  recipient_company_name text,
  recipient_registration_number text,
  recipient_phone text not null,
  pickup_address text,
  pickup_lat double precision not null,
  pickup_lng double precision not null,
  pickup_date date not null,
  pickup_time time not null,
  pickup_notes text not null default '',
  dropoff_address text,
  dropoff_lat double precision not null,
  dropoff_lng double precision not null,
  dropoff_date date not null,
  dropoff_time time not null,
  dropoff_notes text not null default '',
  cargo_type text not null,
  additional_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (sender_type = 'private'
      and nullif(trim(sender_first_name), '') is not null
      and nullif(trim(sender_last_name), '') is not null)
    or
    (sender_type = 'company'
      and nullif(trim(sender_company_name), '') is not null
      and nullif(trim(sender_registration_number), '') is not null)
  ),
  check (
    (recipient_type = 'private'
      and nullif(trim(recipient_first_name), '') is not null
      and nullif(trim(recipient_last_name), '') is not null)
    or
    (recipient_type = 'company'
      and nullif(trim(recipient_company_name), '') is not null
      and nullif(trim(recipient_registration_number), '') is not null)
  ),
  check (pickup_lat between -90 and 90 and pickup_lng between -180 and 180),
  check (dropoff_lat between -90 and 90 and dropoff_lng between -180 and 180)
);

create index transport_requests_creator_idx
  on public.transport_requests (created_by, created_at desc);

alter table public.planned_tasks
  add column transport_request_id bigint unique
    references public.transport_requests(id) on delete set null;

create index planned_tasks_transport_request_idx
  on public.planned_tasks (transport_request_id)
  where transport_request_id is not null;

create table public.transport_request_images (
  id bigint generated always as identity primary key,
  request_id bigint not null
    references public.transport_requests(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  created_at timestamptz not null default now()
);

create index transport_request_images_request_idx
  on public.transport_request_images (request_id);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'transport-request-images',
  'transport-request-images',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.transport_request_links enable row level security;
alter table public.transport_requests enable row level security;
alter table public.transport_request_images enable row level security;

grant select on public.transport_request_links to authenticated;
grant select on public.transport_requests to authenticated;
grant select on public.transport_request_images to authenticated;

create policy "Planners read created request links"
on public.transport_request_links for select
to authenticated
using (
  created_by = (select auth.uid())
  and (select public.has_section_access('planned_tasks'))
);

create policy "Users read accessible transport requests"
on public.transport_requests for select
to authenticated
using (
  created_by = (select auth.uid())
  or (select public.has_section_access('planned_tasks'))
  or exists (
    select 1
    from public.planned_tasks task
    where task.transport_request_id = transport_requests.id
      and task.assignee_id = (select auth.uid())
  )
);

create policy "Users read accessible transport request images"
on public.transport_request_images for select
to authenticated
using (
  exists (
    select 1
    from public.transport_requests request
    where request.id = transport_request_images.request_id
  )
);

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
    nullif(trim(payload->>'pickup_address'), ''),
    (payload->>'pickup_lat')::double precision,
    (payload->>'pickup_lng')::double precision,
    (payload->>'pickup_date')::date,
    (payload->>'pickup_time')::time,
    coalesce(trim(payload->>'pickup_notes'), ''),
    nullif(trim(payload->>'dropoff_address'), ''),
    (payload->>'dropoff_lat')::double precision,
    (payload->>'dropoff_lng')::double precision,
    (payload->>'dropoff_date')::date,
    (payload->>'dropoff_time')::time,
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
