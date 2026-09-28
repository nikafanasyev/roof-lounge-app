-- Реальный бэкенд для раздела "Сотрудники" и ЗП у руководителя. До этой
-- миграции всё (модель ЗП, начисления по сменам, премии/штрафы, выплаты)
-- жило только в моках на клиенте (apps/miniapp/src/data/seed.ts) — эта
-- миграция добавляет таблицы, а бот (apps/bot/src/quickresto.ts) сам
-- считает начисление по каждой закрытой смене из выручки Quick Resto.

-- staff.role уже занят под роль доступа в приложении ('master'|'staff'|'manager',
-- см. 0001_init.sql) — зона ответственности на смене (бар/кальяны) это другое,
-- поэтому отдельная колонка work_role, как и StaffRole в types.ts.
alter table staff
  add column if not exists work_role text check (work_role in ('bar', 'hookah')),
  add column if not exists salary_model jsonb, -- {type:"fixed"|"percent"|"fixed_plus_percent", value?, base?, percent?} — см. SalaryModel в apps/miniapp/src/types.ts
  add column if not exists photo_url text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists medical_book_number text,
  add column if not exists medical_book_expiry date,
  add column if not exists hired_at date;

-- Начисление за одну закрытую смену одному сотруднику по одной роли.
-- Пишется ботом автоматически при закрытии смены заведения (Quick Resto) —
-- см. closeVenueShift/writeShiftPayroll в apps/bot/src/quickresto.ts.
create table shift_payroll (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  shift_id uuid references shifts(id) on delete set null,
  role text check (role in ('bar', 'hookah')),
  date date not null, -- бизнес-день смены (11:00-11:00 МСК), не всегда совпадает с created_at::date
  revenue numeric not null default 0,
  salary numeric not null default 0,
  created_at timestamptz not null default now()
);
create index shift_payroll_staff_id_idx on shift_payroll(staff_id);

-- Премии/штрафы — руководитель проставляет вручную в разделе "Сотрудники".
create table adjustments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  type text not null check (type in ('fine', 'bonus')),
  amount numeric not null check (amount > 0),
  reason text not null,
  date date not null default current_date,
  created_at timestamptz not null default now()
);
create index adjustments_staff_id_idx on adjustments(staff_id);

-- Фактические выплаты (не по сменам, а за период) — тоже проставляются вручную.
create table payouts (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  date date not null default current_date,
  amount numeric not null,
  note text,
  created_at timestamptz not null default now()
);
create index payouts_staff_id_idx on payouts(staff_id);

-- Модель ЗП конкретного сотрудника (salary_model) сюда не проставляем —
-- строка staff у каждого создаётся автоматически (ботом при входе по ПИН в
-- Quick Resto, либо мини-аппом при первом открытии через Telegram), под
-- реальным telegram_id, который в этой миграции неизвестен. Дефолт для роли
-- "кальяны" (1000 + 15%, подтверждено в bot.py roofinfobot) бот подставляет
-- сам на лету при начислении, если salary_model ещё не задана явно — см.
-- DEFAULT_HOOKAH_SALARY_MODEL в apps/bot/src/quickresto.ts. Для бара модель
-- пока никому не известна — там просто пишем выручку без начисления, пока
-- руководитель не проставит salary_model вручную (через Supabase Studio —
-- отдельного экрана редактирования ЗП в мини-аппе ещё нет).
