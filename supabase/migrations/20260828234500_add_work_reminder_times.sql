alter table public.notification_preferences
  add column if not exists work_start_reminder_time time not null default '08:45',
  add column if not exists work_end_reminder_time time not null default '18:00';
