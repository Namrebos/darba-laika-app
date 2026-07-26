create or replace function public.can_read_summary(owner uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select
    $1 = auth.uid()
    or (select role from public.profiles where id = auth.uid()) = 'admin'
    or (
      (select role from public.profiles where id = auth.uid()) = 'viewer'
      and exists (
        select 1 from public.summary_access
        where viewer_id = auth.uid() and owner_id = $1
      )
    );
$$;

create or replace function public.get_accessible_summary_users()
returns table (id uuid, email text, display_name text, avatar_url text)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.email, p.display_name, p.avatar_url
  from public.profiles p
  where
    (
      (select role from public.profiles where id = auth.uid()) = 'admin'
      and p.role in ('admin', 'member')
    )
    or (p.id = auth.uid() and p.role = 'member')
    or exists (
      select 1 from public.summary_access a
      where a.viewer_id = auth.uid() and a.owner_id = p.id
    )
  order by p.display_name, p.email nulls last, p.id;
$$;
