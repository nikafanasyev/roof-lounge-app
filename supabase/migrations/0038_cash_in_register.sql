-- Остаток наличных в кассе по Quick Resto (Z-отчёты): одна строка, бот обновляет каждые 5 минут.
create table if not exists cash_in_register (
  id int primary key default 1 check (id = 1),
  amount numeric not null default 0,
  details jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table cash_in_register disable row level security;
alter publication supabase_realtime add table cash_in_register;
