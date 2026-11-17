-- Борд кальянов: общее для всех устройств состояние столов (гости, таймер
-- кальяна, таймер замены угля). Одна строка на стол; номер "5-1" хранится как 51.
create table if not exists board_tables (
  table_number int primary key,
  seated boolean not null default false,
  hookah_started_at timestamptz,
  coal_changed_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table board_tables disable row level security;
alter publication supabase_realtime add table board_tables;
