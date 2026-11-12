-- Разбивка выручки на нал/безнал по месяцам — для блока "Финансы" на
-- "Сводке" (см. запрос Никиты 12.11.2026 "как-то следить за налом и
-- безналом"). Источник — отчёт Quick Resto "Финансовый отчёт"
-- (finances.reports.financial), строки "Сумма продаж наличные"/
-- "безналичные" — общие по заведению, без привязки к ФР2/Виртуальный ФР
-- (Никита подтвердил, что этого достаточно, деление по регистраторам
-- не нужно). Один ряд на месяц, а не на день — сам отчёт считает сумму
-- сразу за произвольный диапазон дат, разбивать на дни незачем.
create table monthly_cash_split (
  month_key text primary key, -- "YYYY-MM"
  cash numeric not null default 0,
  cashless numeric not null default 0,
  synced_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'monthly_cash_split'
  ) then
    alter publication supabase_realtime add table monthly_cash_split;
  end if;
end $$;
