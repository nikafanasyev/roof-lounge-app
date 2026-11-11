-- Расходы заведения — руководитель вручную заносит траты (закупки, аренда,
-- ремонт и т.п.), см. запрос Никиты 11.11.2026: "Расходы кстати нужно
-- сделать еще отдельно, чтобы они проводились тут" (в контексте "Сводка" —
-- там же показываем сумму за 30 дней рядом с выручкой). Экспорт/отчётности
-- Quick Resto по расходам нет (это не продажи), поэтому ввод только вручную
-- в приложении — Никита уже выбрал этот вариант явно, а не импорт.
--
-- category — свободный текст (не enum): список статей расходов у заведения
-- может меняться, и ограничивать его заранее рано; в форме будет подсказка
-- (datalist) с типовыми статьями, но не жёсткий список.
--
-- Мягкое удаление — тот же принцип, что у adjustments (0014_soft_delete_adjustments.sql):
-- не DELETE, а пометка, запись остаётся для аудита, но не считается в сумме.
create table expenses (
  id uuid primary key default gen_random_uuid(),
  amount numeric not null check (amount > 0),
  category text not null,
  note text,
  date date not null default current_date,
  created_by_staff_id uuid references staff(id) on delete set null,
  created_by_name text,
  deleted_at timestamptz,
  deleted_by_name text,
  delete_reason text,
  created_at timestamptz not null default now()
);
create index expenses_date_idx on expenses(date);

-- Публикация для live-обновлений — сразу в миграции (см. тот же принцип,
-- что в 0016_loyalty_card_requests.sql).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'expenses'
  ) then
    alter publication supabase_realtime add table expenses;
  end if;
end $$;
