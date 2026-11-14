-- Подтверждённый Telegram номер телефона гостя.
-- Мини-апп вызывает WebApp.requestContact, Telegram присылает боту контакт,
-- бот (проверив, что контакт принадлежит самому отправителю) пишет его сюда,
-- мини-апп забирает номер и привязывает гостя к его telegram_id.
create table if not exists telegram_contacts (
  telegram_id bigint primary key,
  phone text not null,
  updated_at timestamptz not null default now()
);
alter table telegram_contacts enable row level security;
drop policy if exists "telegram_contacts anon all (pilot)" on telegram_contacts;
create policy "telegram_contacts anon all (pilot)" on telegram_contacts for all to anon using (true) with check (true);
