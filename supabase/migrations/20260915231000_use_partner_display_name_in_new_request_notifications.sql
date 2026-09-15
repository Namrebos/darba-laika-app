create or replace function public.queue_new_transport_request_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sender_name text;
begin
  select nullif(trim(partner.display_name), '')
  into sender_name
  from public.partners partner
  where partner.id = new.partner_id;

  sender_name := coalesce(
    sender_name,
    nullif(trim(new.sender_company_name), ''),
    nullif(trim(concat_ws(' ', new.sender_first_name, new.sender_last_name)), ''),
    'Jauns klients'
  );

  insert into public.notification_queue(recipient_id, notification_type, title, body, url)
  select
    profile.id,
    'new_request',
    'Jauns brauciens: ' || sender_name,
    'Izpildes datums: ' || to_char(new.pickup_date, 'DD.MM.YYYY'),
    '/planned-tasks?transportRequest=' || new.id::text
  from public.profiles profile
  join public.notification_preferences preference on preference.user_id = profile.id
  where preference.enabled and preference.new_requests;

  return new;
end;
$$;

revoke all on function public.queue_new_transport_request_notification()
from public, anon, authenticated;
