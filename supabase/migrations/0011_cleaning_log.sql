-- Лог выполнения генеральной уборки: сотрудник отмечает пункт из графика
-- (data/seed.ts CLEANING_*_WEEKS, статья базы знаний "Генеральная уборка")
-- чекбоксом — здесь сохраняется, кто и когда. Один пункт на календарный
-- день (role+task+log_date) — ротация 4-недельная, поэтому "отметка"
-- привязана к сегодняшней дате, а не к условной "неделе 2".
-- См. обсуждение с Никитой 11.10.2026: "добавить чек-боксы и после
-- выполнения сохранять и логировать дату".
create table if not exists cleaning_log (
  id uuid primary key default gen_random_uuid(),
  role text not null,
  task text not null,
  log_date date not null,
  done_by uuid references staff(id) on delete set null,
  done_at timestamptz not null default now(),
  unique (role, task, log_date)
);
create index if not exists cleaning_log_date_idx on cleaning_log(log_date);
