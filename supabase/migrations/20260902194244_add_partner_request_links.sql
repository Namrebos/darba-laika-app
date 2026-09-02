create table public.partner_request_links (
  id uuid primary key default gen_random_uuid(),
  partner_id bigint not null unique references public.partners(id) on delete cascade,
  token_hash text not null unique,
  token_value text not null unique,
  created_by uuid not null references public.profiles(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index partner_request_links_active_idx
  on public.partner_request_links (partner_id) where active;

alter table public.partner_request_links enable row level security;
revoke all on public.partner_request_links from public, anon, authenticated;
