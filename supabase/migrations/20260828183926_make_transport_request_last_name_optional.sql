alter table public.transport_requests
  drop constraint if exists transport_requests_sender_identity_check,
  drop constraint if exists transport_requests_recipient_identity_check;

alter table public.transport_requests
  add constraint transport_requests_sender_identity_check check (
    (
      sender_type = 'private'
      and nullif(trim(sender_first_name), '') is not null
    )
    or
    (
      sender_type = 'company'
      and nullif(trim(sender_company_name), '') is not null
    )
  ),
  add constraint transport_requests_recipient_identity_check check (
    (
      recipient_type = 'private'
      and nullif(trim(recipient_first_name), '') is not null
    )
    or
    (
      recipient_type = 'company'
      and nullif(trim(recipient_company_name), '') is not null
    )
  );
