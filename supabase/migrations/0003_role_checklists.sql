-- Раздельные чек-листы по ролям на смене: раньше на смену был один чек-лист
-- открытия и один закрытия. Теперь на смене одновременно два "универсала" —
-- один отвечает за бар, второй за кальянную зону — и у каждого свой чек-лист
-- (см. claude/roof-lounge-app-architecture.md и Shift.tsx).
--
-- opened_by/opened_at/closed_by/closed_at на самой строке shifts остаются:
-- это венью-статус смены из Quick Resto (см. 0001_init.sql и
-- claude/quickresto-shift-integration.md). Новые *_opened_by/at и
-- *_closed_by/at — это когда именно сотрудник конкретной роли отметил свой
-- чек-лист (фото + все пункты), не то же самое, что вход по ПИН на терминале.

alter table shifts
  add column bar_open_checklist jsonb not null default '[]',
  add column bar_close_checklist jsonb not null default '[]',
  add column bar_opened_by uuid references staff(id),
  add column bar_opened_at timestamptz,
  add column bar_closed_by uuid references staff(id),
  add column bar_closed_at timestamptz,
  add column hookah_open_checklist jsonb not null default '[]',
  add column hookah_close_checklist jsonb not null default '[]',
  add column hookah_opened_by uuid references staff(id),
  add column hookah_opened_at timestamptz,
  add column hookah_closed_by uuid references staff(id),
  add column hookah_closed_at timestamptz;

-- Переносим то, что уже накопилось в старых общих колонках, в бар (условно —
-- до этой миграции роль не различалась), чтобы не терять прогресс уже
-- заполненной текущей смены.
update shifts
set bar_open_checklist = open_checklist,
    bar_close_checklist = close_checklist
where open_checklist <> '[]'::jsonb or close_checklist <> '[]'::jsonb;

alter table shifts drop column open_checklist;
alter table shifts drop column close_checklist;

-- Фото открытия/закрытия смены теперь тоже помечаются ролью — бот показывает
-- в подписи, чей это чек-лист (бар/кальяны).
alter table shift_photo_uploads
  add column role text not null default 'bar' check (role in ('bar', 'hookah'));
alter table shift_photo_uploads alter column role drop default;
