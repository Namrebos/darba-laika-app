create index if not exists partner_portal_accounts_created_by_idx
  on public.partner_portal_accounts(created_by);
create index if not exists partner_portal_invitations_created_by_idx
  on public.partner_portal_invitations(created_by);
create index if not exists partner_portal_invitations_used_by_idx
  on public.partner_portal_invitations(used_by);

grant execute on function public.delete_partner_new_request(bigint, bigint)
  to service_role;
