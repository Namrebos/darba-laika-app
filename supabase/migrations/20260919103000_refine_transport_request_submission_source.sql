alter table public.transport_requests
  drop constraint if exists transport_requests_submission_source_check;

alter table public.transport_requests
  add constraint transport_requests_submission_source_check
  check (submission_source in ('admin', 'user', 'partner', 'unknown'));

update public.transport_requests request
set submission_source = 'unknown'
from public.transport_request_links link
where request.link_id = link.id
  and request.partner_id is null
  and link.expires_at - link.created_at > interval '10 minutes';
