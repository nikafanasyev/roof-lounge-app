-- Настройки заведения: одна строка (id = 1), параметры в jsonb.
create table if not exists venue_settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into venue_settings (id) values (1) on conflict do nothing;
alter table venue_settings disable row level security;
alter publication supabase_realtime add table venue_settings;
