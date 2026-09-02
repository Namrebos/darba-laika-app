create table public.delivery_notes (
  id uuid primary key default gen_random_uuid(),
  transport_request_id bigint not null unique
    references public.transport_requests(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  document_snapshot jsonb not null,
  sender_signature_data text,
  sender_signer_name text,
  sender_signed_at timestamptz,
  recipient_signature_data text,
  recipient_signer_name text,
  recipient_signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_signature_data is null or length(sender_signature_data) <= 600000),
  check (recipient_signature_data is null or length(recipient_signature_data) <= 600000)
);

create table public.delivery_note_signing_links (
  id uuid primary key default gen_random_uuid(),
  delivery_note_id uuid not null references public.delivery_notes(id) on delete cascade,
  signer_role text not null check (signer_role in ('sender', 'recipient')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index delivery_note_signing_links_active_idx
  on public.delivery_note_signing_links (token_hash, expires_at)
  where used_at is null and revoked_at is null;

alter table public.delivery_notes enable row level security;
alter table public.delivery_note_signing_links enable row level security;

revoke all on public.delivery_notes from anon, authenticated;
revoke all on public.delivery_note_signing_links from anon, authenticated;

