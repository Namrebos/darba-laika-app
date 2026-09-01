create table public.carrier_settings (
  id text primary key default 'default' check (id = 'default'),
  company_name text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.carrier_settings (id, company_name)
values ('default', '')
on conflict (id) do nothing;

alter table public.carrier_settings enable row level security;

grant select, insert, update on public.carrier_settings to authenticated;

create policy "Authenticated users read carrier settings"
  on public.carrier_settings for select
  to authenticated
  using (true);

create policy "Admins insert carrier settings"
  on public.carrier_settings for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'admin'
    )
  );

create policy "Admins update carrier settings"
  on public.carrier_settings for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'admin'
    )
  );
