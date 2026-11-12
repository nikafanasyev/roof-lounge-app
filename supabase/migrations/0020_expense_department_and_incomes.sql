-- Раздел расхода (Бар/Кухня/Кальян/Общее) — доп. поле вдобавок к статье
-- (см. запрос Никиты 12.11.2026: "надо будет все отсортировать по Бар,
-- Кухня, Кальян"), чтобы потом смотреть сводку и по статье, и по разделу
-- отдельно. Свободный текст, как category и supplier — список подсказок
-- только в форме (Expenses.tsx), не enum.
alter table expenses
  add column if not exists department text;

-- Доходы — ручной учёт, отдельно от автоматической синхронизации выручки
-- из Quick Resto (shift_payroll/monthly_cash_split) — та считает продажи
-- по чекам, а здесь произвольные поступления, которые Quick Resto не видит
-- (см. запрос Никиты 12.11.2026: "доходы нужно туда же где расходы").
-- Структура — как у expenses (0017_expenses.sql), но без supplier/department
-- (это расходные поля) и без деления по сменам/дням — такая же "журнал
-- записей" с мягким удалением.
create table incomes (
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
create index incomes_date_idx on incomes(date);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'incomes'
  ) then
    alter publication supabase_realtime add table incomes;
  end if;
end $$;
