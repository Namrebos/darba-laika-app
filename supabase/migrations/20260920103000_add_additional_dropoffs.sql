alter table public.transport_requests
  add column if not exists additional_dropoffs jsonb not null default '[]'::jsonb;

alter table public.transport_requests
  add constraint transport_requests_additional_dropoffs_array
  check (jsonb_typeof(additional_dropoffs) = 'array');
