-- Синхронизация гостей из CRM Quick Resto (/platform/data/crm.customer/select) —
-- переносим существующую базу клиентов заведения (сейчас ~2586 записей) в
-- наш guests, и дальше бот подтягивает новых/изменённых раз в день.
-- Намеренно НЕ трогаем телефон — поле identifiers в Quick Resto гость хочет
-- видеть у нас как "номер карты", а не как номер для входа в гостевой кабинет
-- по телефону (см. обсуждение с Никитой 11.10.2026). guests.phone остаётся
-- только тем, что гость сам вводит на регистрации в мини-аппе.

alter table guests
  add column if not exists quickresto_customer_id bigint unique, -- id клиента в Quick Resto, ключ для upsert при синхронизации
  add column if not exists card_number text; -- "Идентификаторы" из Quick Resto (номер карты/привязанный номер в CRM) — не используется для входа
