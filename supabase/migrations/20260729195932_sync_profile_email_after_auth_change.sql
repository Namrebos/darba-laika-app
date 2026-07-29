create or replace function public.sync_profile_email_from_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles
    set email = new.email
    where id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_profile_email_after_auth_change on auth.users;

create trigger sync_profile_email_after_auth_change
  after update of email on auth.users
  for each row
  execute function public.sync_profile_email_from_auth();
