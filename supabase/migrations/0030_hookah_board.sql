-- Борд кальянов: у одного стола может быть несколько кальянов (второй, третий),
-- у каждого свои таймеры. Завершённые кальяны остаются в таблице (история).
alter table board_tables add column if not exists seated_at timestamptz;
create table if not exists board_hookahs (
  id uuid primary key default gen_random_uuid(),
  table_number int not null,
  started_at timestamptz not null default now(),
  coal_changed_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists board_hookahs_table_idx on board_hookahs(table_number, started_at);
alter table board_hookahs disable row level security;
alter publication supabase_realtime add table board_hookahs;
