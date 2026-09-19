alter table public.profiles
  add column if not exists test_mode_enabled boolean not null default false;

create or replace function public.set_own_test_mode(enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Administrator access required';
  end if;

  update public.profiles
  set test_mode_enabled = enabled
  where id = auth.uid();

  return enabled;
end;
$$;

revoke all on function public.set_own_test_mode(boolean)
from public, anon;
grant execute on function public.set_own_test_mode(boolean)
to authenticated;
