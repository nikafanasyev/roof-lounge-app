-- Предложенные штрафы за опоздание: приложение считает по времени фото открытия
-- смены, руководитель подтверждает («Применить» создаёт штраф) или отклоняет.
create table if not exists late_proposals (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  date date not null,
  role text not null,
  arrived_at timestamptz not null,
  amount int not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'applied', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (staff_id, date)
);
alter table late_proposals disable row level security;
alter publication supabase_realtime add table late_proposals;
