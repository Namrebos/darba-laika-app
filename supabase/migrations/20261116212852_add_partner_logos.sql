alter table public.partners
  add column logo_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'partner-logos',
  'partner-logos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Admins upload partner logos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'partner-logos'
    and (select public.current_user_is_admin())
  );

create policy "Admins update partner logos"
  on storage.objects for update to authenticated
  using (bucket_id = 'partner-logos' and (select public.current_user_is_admin()))
  with check (bucket_id = 'partner-logos' and (select public.current_user_is_admin()));

create policy "Admins delete partner logos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'partner-logos' and (select public.current_user_is_admin()));
