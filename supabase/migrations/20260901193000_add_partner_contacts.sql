create table public.partner_contacts (
  id bigint generated always as identity primary key,
  partner_id bigint not null references public.partners(id) on delete cascade,
  name text not null check (nullif(btrim(name), '') is not null),
  phone text not null check (nullif(btrim(phone), '') is not null),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index partner_contacts_partner_id_idx
  on public.partner_contacts (partner_id, sort_order, id);

alter table public.partner_contacts enable row level security;

create policy "Admins can view partner contacts"
on public.partner_contacts for select to authenticated
using ((select public.current_user_is_admin()));

create policy "Admins can add partner contacts"
on public.partner_contacts for insert to authenticated
with check ((select public.current_user_is_admin()));

create policy "Admins can update partner contacts"
on public.partner_contacts for update to authenticated
using ((select public.current_user_is_admin()))
with check ((select public.current_user_is_admin()));

create policy "Admins can delete partner contacts"
on public.partner_contacts for delete to authenticated
using ((select public.current_user_is_admin()));

grant select, insert, update, delete on public.partner_contacts to authenticated;
grant usage, select on sequence public.partner_contacts_id_seq to authenticated;

insert into public.partner_contacts (partner_id, name, phone, sort_order)
select id, contact_name, phone, 0
from public.partners
where nullif(btrim(contact_name), '') is not null
  and nullif(btrim(phone), '') is not null;
