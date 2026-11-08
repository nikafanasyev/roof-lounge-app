-- Создание карты лояльности гостю (и в приложении, и в Quick Resto) —
-- см. обсуждение с Никитой: ФИО/телефон/дата рождения вводятся в
-- приложении (сам гость или сотрудник), а запись клиента в Quick Resto и
-- привязку QR-идентификатора делает бот (у миниаппа нет и не должно быть
-- credentials Quick Resto, см. тот же паттерн, что payroll_recalc_requests
-- в 0013_payroll_recalc.sql).
--
-- gender — Quick Resto требует пол при создании клиента (crm.customer),
-- хотя в самой форме карты лояльности мы его отдельно не просили у
-- Никиты — пришлось добавить (см. обсуждение с Никитой: "Добавить выбор
-- пола в форму").
alter table guests
  add column if not exists gender text check (gender in ('male', 'female')),
  add column if not exists quickresto_qr_key text;

create table if not exists loyalty_card_requests (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references guests(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  result text,
  created_at timestamptz not null default now(),
  handled_at timestamptz
);
create index if not exists loyalty_card_requests_guest_id_idx on loyalty_card_requests(guest_id);

-- Публикация для live-обновлений — на будущее сразу в миграции (см.
-- обсуждение с Никитой: раньше это всегда забывали делать руками, из-за
-- чего уже дважды ловили реальные баги).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'loyalty_card_requests'
  ) then
    alter publication supabase_realtime add table loyalty_card_requests;
  end if;
end $$;
