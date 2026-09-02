alter table public.carrier_settings
  add column logo_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'carrier-logos',
  'carrier-logos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Admins upload carrier logos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'carrier-logos'
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'admin'
    )
  );

create policy "Admins update carrier logos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'carrier-logos'
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'admin'
    )
  )
  with check (
    bucket_id = 'carrier-logos'
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'admin'
    )
  );

create policy "Admins delete carrier logos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'carrier-logos'
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'admin'
    )
  );
