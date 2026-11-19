-- Тех. задачи по датам: у задачи дата старта и повтор «раз в N дней» (0 — разово),
-- без привязки к 4-недельной ротации. Отметка сотрудника и апрув руководителя —
-- в cleaning_log (done_* — сотрудник, approved_* — руководитель).
create table if not exists tech_tasks (
  id uuid primary key default gen_random_uuid(),
  role text not null,          -- ключ роли: «Бар», «Кальянный мастер», «Кухня», «Уборщица»
  title text not null,
  start_date date not null,
  every_days int not null default 0 check (every_days >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table tech_tasks disable row level security;
alter publication supabase_realtime add table tech_tasks;

alter table cleaning_log add column if not exists approved_at timestamptz;
alter table cleaning_log add column if not exists approved_by uuid references staff(id) on delete set null;
alter table cleaning_log alter column done_at drop not null;
alter table cleaning_log disable row level security;
alter publication supabase_realtime add table cleaning_log;
