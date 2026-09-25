create table public.partner_portal_accounts (
  partner_id bigint primary key references public.partners(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index partner_portal_accounts_user_idx
  on public.partner_portal_accounts(user_id);
create index partner_portal_accounts_created_by_idx
  on public.partner_portal_accounts(created_by);

create table public.partner_portal_invitations (
  id bigint generated always as identity primary key,
  partner_id bigint not null unique references public.partners(id) on delete cascade,
  token_hash text not null unique,
  token_value text not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index partner_portal_invitations_active_idx
  on public.partner_portal_invitations(token_hash, expires_at)
  where active and used_at is null;
create index partner_portal_invitations_created_by_idx
  on public.partner_portal_invitations(created_by);
create index partner_portal_invitations_used_by_idx
  on public.partner_portal_invitations(used_by);

alter table public.partner_portal_accounts enable row level security;
alter table public.partner_portal_invitations enable row level security;

-- Partneru portāla tabulām apzināti nav klienta RLS politiku.
-- Tām piekļūst tikai servera API ar service role pēc sesijas pārbaudes.
revoke all on public.partner_portal_accounts from anon, authenticated;
revoke all on public.partner_portal_invitations from anon, authenticated;
revoke all on sequence public.partner_portal_invitations_id_seq from anon, authenticated;

create or replace function public.delete_partner_new_request(
  target_request_id bigint,
  target_partner_id bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_task public.planned_tasks%rowtype;
begin
  select task.* into target_task
  from public.planned_tasks task
  join public.transport_requests request on request.id = task.transport_request_id
  where request.id = target_request_id
    and request.partner_id = target_partner_id
    and task.status = 'new'
  for update;

  if target_task.id is null then return false; end if;
  delete from public.planned_tasks where id = target_task.id;
  delete from public.transport_requests
    where id = target_request_id and partner_id = target_partner_id;
  return true;
end;
$$;

revoke all on function public.delete_partner_new_request(bigint, bigint)
  from public, anon, authenticated;
grant execute on function public.delete_partner_new_request(bigint, bigint)
  to service_role;
