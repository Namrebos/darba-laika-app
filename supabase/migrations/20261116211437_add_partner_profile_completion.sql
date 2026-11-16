alter table public.partners
  add column profile_completed boolean not null default true;

alter table public.partners
  drop constraint partners_identity_check,
  drop constraint partners_address_not_blank,
  drop constraint partners_phone_not_blank;

alter table public.partners
  add constraint partners_identity_check check (
    not profile_completed
    or (partner_type = 'private' and nullif(btrim(first_name), '') is not null)
    or (partner_type = 'company'
      and nullif(btrim(company_name), '') is not null
      and nullif(btrim(registration_number), '') is not null)
  ),
  add constraint partners_address_not_blank check (
    not profile_completed or nullif(btrim(address), '') is not null
  ),
  add constraint partners_phone_not_blank check (
    not profile_completed or nullif(btrim(phone), '') is not null
  );

comment on column public.partners.profile_completed is
  'False while a partner portal user still has to complete the mandatory partner card.';
