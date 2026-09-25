create table public.partner_portal_test_requests (
  id bigint generated always as identity primary key,
  partner_id bigint not null references public.partners(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint partner_portal_test_requests_payload_object
    check (jsonb_typeof(payload) = 'object')
);

create index partner_portal_test_requests_partner_created_idx
  on public.partner_portal_test_requests(partner_id, created_at desc);
create index partner_portal_test_requests_creator_idx
  on public.partner_portal_test_requests(created_by);

alter table public.partner_portal_test_requests enable row level security;

-- Izolēti testa dati. Klients tiem tieši nepiekļūst; visu pārbauda admin API.
revoke all on public.partner_portal_test_requests from anon, authenticated;
revoke all on sequence public.partner_portal_test_requests_id_seq from anon, authenticated;
