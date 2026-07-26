alter table public.profiles
  add column display_name text,
  add column avatar_url text;

update public.profiles
set display_name = coalesce(nullif(split_part(email, '@', 1), ''), 'Lietotājs')
where display_name is null;

alter table public.profiles
  alter column display_name set not null,
  add constraint profiles_display_name_length
    check (char_length(trim(display_name)) between 1 and 50);

create or replace function public.update_own_profile(
  new_display_name text,
  new_avatar_url text
)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if char_length(trim(new_display_name)) not between 1 and 50 then
    raise exception 'Invalid display name';
  end if;

  update public.profiles
  set display_name = trim(new_display_name),
      avatar_url = nullif(trim(new_avatar_url), '')
  where id = auth.uid();
end;
$$;

grant execute on function public.update_own_profile(text, text) to authenticated;

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, role, data_owner_id)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)),
    case
      when new.raw_user_meta_data ->> 'invited_role' = 'viewer' then 'viewer'::public.app_role
      else 'member'::public.app_role
    end,
    case
      when new.raw_user_meta_data ->> 'invited_role' = 'viewer'
        and coalesce(new.raw_user_meta_data ->> 'invited_by', '') ~* '^[0-9a-f-]{36}$'
      then (new.raw_user_meta_data ->> 'invited_by')::uuid
      else new.id
    end
  );
  return new;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-images',
  'profile-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Public profile images"
  on storage.objects for select
  using (bucket_id = 'profile-images');

create policy "Users upload own profile image"
  on storage.objects for insert
  with check (
    bucket_id = 'profile-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users update own profile image"
  on storage.objects for update
  using (
    bucket_id = 'profile-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users delete own profile image"
  on storage.objects for delete
  using (
    bucket_id = 'profile-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop function if exists public.get_accessible_summary_users();
create function public.get_accessible_summary_users()
returns table (id uuid, email text, display_name text, avatar_url text)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.email, p.display_name, p.avatar_url
  from public.profiles p
  where
    (p.id = auth.uid() and p.role in ('admin', 'member'))
    or exists (
      select 1 from public.summary_access a
      where a.viewer_id = auth.uid() and a.owner_id = p.id
    )
  order by p.display_name, p.email nulls last, p.id;
$$;
