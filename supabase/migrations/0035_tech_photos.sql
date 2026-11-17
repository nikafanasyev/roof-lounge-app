-- Фото выполнения технической работы: сотрудник отправляет фото по тех. задаче,
-- бот пересылает руководителю (как фото смены) и стирает.
alter table shift_photo_uploads drop constraint if exists shift_photo_uploads_kind_check;
alter table shift_photo_uploads
  add constraint shift_photo_uploads_kind_check check (kind in ('open', 'close', 'tech'));
alter table shift_photo_uploads add column if not exists caption text;
