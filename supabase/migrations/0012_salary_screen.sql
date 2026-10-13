-- Экран "Зарплата" у руководителя (отдельно от "Сотрудники", см. обсуждение
-- с Никитой 13.10.2026) + фикс бага "график не выставлен — ЗП тихо не
-- начислена" + приглашение сотрудника в рабочие чаты + архивация сотрудника
-- вместо жёсткого удаления (чтобы не терять историю начислений).

-- Архивация вместо delete: shift_payroll/adjustments/payouts ссылаются на
-- staff.id с on delete cascade (см. 0004) — жёсткое удаление строки стёрло бы
-- всю историю начислений уволенного сотрудника. Вместо этого помечаем
-- archived=true: сотрудник пропадает из списка "Сотрудники" и выбора в
-- графике, но вся его ЗП/история остаётся как есть.
alter table staff
  add column if not exists archived boolean not null default false,
  add column if not exists archived_at timestamptz;

-- Дедупликация уведомления "график на дату X не выставлен" — без этого бот
-- слал бы его каждый день заново, пока за 7-дневное окно сверки
-- (processScheduledDate) дата так и остаётся без графика.
create table if not exists schedule_notices (
  date date primary key,
  created_at timestamptz not null default now()
);

-- Фиксированные начисления вне сменной сетки — например, доплата
-- руководителю/администратору раз в 2 недели, не привязанная к выручке
-- конкретной смены (см. запрос Никиты: "Никита 10000 (раз в 2 недели),
-- Дойна 20000 (раз в 2 недели)"). Показывается отдельным блоком на экране
-- "Зарплата".
create table if not exists fixed_accruals (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  amount numeric not null check (amount > 0),
  cadence text not null default 'biweekly' check (cadence in ('biweekly', 'monthly', 'weekly')),
  label text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists fixed_accruals_staff_id_idx on fixed_accruals(staff_id);

-- Приглашение сотрудника в рабочие чаты (кнопка "Пригласить" в разделе
-- "Сотрудники"): руководитель вводит ФИО/телефон/Telegram ID, бот (через
-- Supabase Realtime, см. apps/bot/src/notify.ts watchStaffInvites)
-- генерирует инвайт-ссылку на рабочий чат и присылает её руководителю —
-- Telegram не позволяет боту первым написать человеку, который ни разу не
-- писал /start, поэтому сама ссылка не рассылается автоматически, только
-- готовится для пересылки вручную.
create table if not exists staff_invites (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  telegram_id text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  invite_link text,
  error text,
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

-- Пилот на одном заведении — тот же уровень доступа anon-ключу, что и у
-- остальных таблиц (см. 0001_init.sql), перед продакшеном сузить до
-- authenticated/service-role.
alter table fixed_accruals enable row level security;
create policy "fixed_accruals anon all (pilot)" on fixed_accruals for all to anon using (true) with check (true);
alter table staff_invites enable row level security;
create policy "staff_invites anon all (pilot)" on staff_invites for all to anon using (true) with check (true);
alter table schedule_notices enable row level security;
create policy "schedule_notices anon all (pilot)" on schedule_notices for all to anon using (true) with check (true);

-- Фото сотрудника — в отличие от shift-photos (приватный, эфемерный бакет,
-- см. 0002) это постоянное фото профиля, публично читаемое по прямой
-- ссылке (как и сама мини-аппа доступна без авторизации).
insert into storage.buckets (id, name, public)
values ('staff-photos', 'staff-photos', true)
on conflict (id) do nothing;

create policy "staff-photos anon all (pilot)" on storage.objects
  for all
  to anon
  using (bucket_id = 'staff-photos')
  with check (bucket_id = 'staff-photos');
