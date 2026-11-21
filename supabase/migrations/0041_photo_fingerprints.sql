-- Отпечатки фото смены/тех. задач (dHash, 64 бита в hex): одно и то же фото
-- нельзя прислать повторно (фидбек Никиты 21.11.2026 — старое фото с новым штампом).
create table if not exists photo_fingerprints (
  id uuid primary key default gen_random_uuid(),
  hash text not null,
  staff_id uuid references staff(id) on delete set null,
  staff_name text,
  created_at timestamptz not null default now()
);
create index if not exists photo_fingerprints_created_idx on photo_fingerprints(created_at);
alter table photo_fingerprints disable row level security;
