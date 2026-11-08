-- Разбиваем ФИО гостя на Фамилию/Имя/Отчество — нужно, чтобы в будущем
-- создавать клиента в Quick Resto с теми же полями (см. обсуждение с
-- Никитой: "возможность создания идентификатора для гостя" через карту
-- лояльности с ФИО/телефоном/датой рождения). display_name остаётся
-- "Фамилия Имя" для отображения в списках — отчество используется
-- отдельно, когда понадобится передать его в Quick Resto.
alter table guests
  add column if not exists last_name text,
  add column if not exists first_name text,
  add column if not exists middle_name text;

-- Этот проект никогда не добавлял таблицы в publication через миграции —
-- это всегда забывали делать руками в Supabase Dashboard, что уже дважды
-- стало причиной реальных багов (зависшая кнопка пересчёта зп, гости не
-- обновлялись на лету без перезагрузки страницы). Явно фиксируем здесь на
-- будущее для guests, идемпотентно (не упадёт, если уже добавлена руками).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'guests'
  ) then
    alter publication supabase_realtime add table guests;
  end if;
end $$;
