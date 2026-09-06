-- Фото сотрудника при открытии смены и фото контрольных зон при закрытии.
-- Осознанно НЕ храним их постоянно: миниапп загружает снимок в Storage и
-- кладёт строку в shift_photo_uploads, бот подхватывает её через Realtime,
-- пересылает фото руководителю в Telegram — и сразу удаляет и файл, и саму
-- строку. В базе не остаётся ничего, кроме самого факта пересылки в чате.

insert into storage.buckets (id, name, public)
values ('shift-photos', 'shift-photos', false)
on conflict (id) do nothing;

-- Пилот на одном заведении: разрешаем анонимному ключу класть/читать/удалять
-- файлы в этом бакете (как и с RLS на обычных таблицах в 0001_init.sql —
-- перед реальным продакшеном это нужно сузить до authenticated/service-role).
create policy "shift-photos anon all (pilot)" on storage.objects
  for all
  to anon
  using (bucket_id = 'shift-photos')
  with check (bucket_id = 'shift-photos');

create table shift_photo_uploads (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null,
  kind text not null check (kind in ('open', 'close')),
  storage_path text not null,
  staff_name text,
  created_at timestamptz not null default now()
);

-- Живёт секунды (пока бот не заберёт и не удалит запись) — RLS не включаем,
-- как и бакет выше это часть пилотного упрощения.
