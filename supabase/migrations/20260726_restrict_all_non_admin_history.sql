-- Tikai administrators drīkst redzēt datus pirms sava reģistrācijas mēneša.
-- Visiem pārējiem lietotājiem dati pieejami no reģistrācijas mēneša pirmās dienas.
create or replace function public.can_read_summary_date(entry_time timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select
        p.role = 'admin'
        or entry_time >= (
          date_trunc('month', p.created_at at time zone 'Europe/Riga')
          at time zone 'Europe/Riga'
        )
      from public.profiles p
      where p.id = auth.uid()
    ),
    false
  );
$$;
