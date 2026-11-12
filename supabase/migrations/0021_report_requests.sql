-- Запросы на выгрузку Excel-отчёта в личку Telegram (кнопка "Отправить мне
-- в Telegram" в мини-аппе и команды /salary, /expenses у бота). Мини-апп
-- пишет сюда строку, бот (apps/bot/src/reports.ts) собирает файл и шлёт его
-- документом тому, кто запросил. Тот же принцип, что у loyalty_card_requests.
create table if not exists report_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('salary', 'expenses')),
  param text not null, -- salary: начало зарплатного периода YYYY-MM-DD; expenses: месяц YYYY-MM
  requested_by_telegram_id bigint not null,
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  result text,
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

alter table report_requests enable row level security;
create policy "report_requests anon all (pilot)" on report_requests for all to anon using (true) with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'report_requests'
  ) then
    alter publication supabase_realtime add table report_requests;
  end if;
end $$;
