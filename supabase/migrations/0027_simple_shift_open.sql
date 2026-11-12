-- Кухня и клининг: у них нет чек-листов, просто кнопка "Открыть смену" + фото.
-- 1) фото смены теперь может быть от kitchen/cleaning;
-- 2) факт прихода фиксируем в staff_arrivals (один раз в бизнес-день).
alter table shift_photo_uploads drop constraint if exists shift_photo_uploads_role_check;
alter table shift_photo_uploads
  add constraint shift_photo_uploads_role_check check (role in ('bar', 'hookah', 'kitchen', 'cleaning'));

create table if not exists staff_arrivals (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  role text not null,
  date date not null,
  opened_at timestamptz not null default now(),
  unique (staff_id, date)
);

alter table staff_arrivals enable row level security;
create policy "staff_arrivals anon all (pilot)" on staff_arrivals for all to anon using (true) with check (true);
