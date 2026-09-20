alter table public.notification_preferences
  add column if not exists app_badge_enabled boolean not null default true;
