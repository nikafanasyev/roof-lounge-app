-- Журнал служебных личных сообщений бота руководителям: нужен, чтобы бот мог
-- удалять их через сутки и по команде /del (у всех руководителей сразу).
create table if not exists bot_notifications (
  id bigserial primary key,
  chat_id bigint not null,
  message_id bigint not null,
  group_key text not null,
  sent_at timestamptz not null default now()
);
create index if not exists bot_notifications_group_key_idx on bot_notifications(group_key);
create index if not exists bot_notifications_sent_at_idx on bot_notifications(sent_at);
create index if not exists bot_notifications_msg_idx on bot_notifications(chat_id, message_id);
alter table bot_notifications disable row level security;
