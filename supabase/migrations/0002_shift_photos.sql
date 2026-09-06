-- Фото сотрудника при открытии смены и фото контрольных зон при закрытии —
-- MVP хранит их как data URL прямо в текстовой колонке (см. комментарий в
-- data/repo.ts). Перед продакшеном стоит перенести в Supabase Storage.

alter table shifts add column if not exists open_photo_url text;
alter table shifts add column if not exists close_photo_url text;
