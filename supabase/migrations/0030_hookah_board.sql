-- Задачи: приоритет, статус, помощники (ответственный остаётся в assignee).
alter table tasks add column if not exists priority text not null default 'medium'
  check (priority in ('critical','high','medium','low'));
alter table tasks add column if not exists status text not null default 'created'
  check (status in ('created','in_progress','done'));
alter table tasks add column if not exists helpers uuid[] not null default '{}';
update tasks set status = 'done' where done and status = 'created';
