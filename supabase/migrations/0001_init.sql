-- Roof Lounge — начальная схема БД (Supabase/Postgres)
-- Соответствует roof-lounge-app-architecture.md, разделы 2-3-5.
-- Не включает то, что уже покрывает Quick Resto: меню, заказы, оплату, кассовую лояльность.

create extension if not exists "pgcrypto";

-- ---------- Гости и вкусовой профиль ----------

create table guests (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint unique, -- id гостя в Telegram, без телефона и других контактных данных
  display_name text not null,
  badges text[] default '{}',
  created_at timestamptz not null default now()
);

create table staff (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint unique not null,
  name text not null,
  role text not null check (role in ('master', 'staff', 'manager')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Справочник вкусов табака. Ведётся отдельно от Quick Resto (там нет такой структуры).
create table flavors (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  name text not null,
  code text, -- номер позиции у поставщика/на складе, например "077"
  categories text[] not null default '{}', -- теги для расчёта вкусового профиля
  active boolean not null default true,
  unique (brand, name)
);

create table mixes (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references guests(id) on delete cascade,
  master_id uuid not null references staff(id),
  title text not null,
  cover_url text,
  strength smallint check (strength between 1 and 5),
  bowl_type text,
  density text,
  master_note text, -- приватная техническая заметка, гостю не показывается
  description text, -- художественное описание, видно гостю
  tags text[] default '{}',
  created_at timestamptz not null default now()
);

create table mix_items (
  id uuid primary key default gen_random_uuid(),
  mix_id uuid not null references mixes(id) on delete cascade,
  flavor_id uuid not null references flavors(id),
  share_percent smallint not null check (share_percent between 0 and 100)
);

create table mix_ratings (
  id uuid primary key default gen_random_uuid(),
  mix_id uuid not null references mixes(id) on delete cascade,
  guest_id uuid not null references guests(id),
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  unique (mix_id, guest_id)
);

-- ---------- Столы и гостевые QR-сценарии ----------

create table restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  number int not null unique,
  qr_token text not null unique default encode(gen_random_bytes(12), 'hex')
);

create table service_calls (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references restaurant_tables(id),
  type text not null check (type in ('waiter', 'bill', 'help')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references staff(id)
);

create table waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  guest_name text not null,
  party_size int not null,
  contact text, -- телефон или telegram-контакт, вводится гостем добровольно для этой заявки
  created_at timestamptz not null default now(),
  notified_at timestamptz
);

create table lost_items (
  id uuid primary key default gen_random_uuid(),
  guest_contact text,
  description text not null,
  visit_date date,
  status text not null default 'open' check (status in ('open', 'found', 'closed')),
  created_at timestamptz not null default now()
);

-- ---------- Персонал: смены, чек-листы, задачи, поломки ----------

create table shifts (
  id uuid primary key default gen_random_uuid(),
  opened_by uuid references staff(id),
  opened_at timestamptz,
  open_checklist jsonb not null default '[]', -- [{id,label,done}]
  closed_by uuid references staff(id),
  closed_at timestamptz,
  close_checklist jsonb not null default '[]',
  handover_note text,
  created_at timestamptz not null default now()
);

create table problems (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('hall','equipment','plumbing','electric','register','furniture','other')),
  description text not null,
  photo_url text,
  reported_by uuid references staff(id),
  assignee uuid references staff(id),
  status text not null default 'open' check (status in ('open','in_progress','done')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  assignee uuid references staff(id),
  due_date date,
  done boolean not null default false,
  created_by uuid references staff(id),
  created_at timestamptz not null default now()
);

-- ---------- Индексы под реальную нагрузку (см. раздел 4 архитектурного документа) ----------

create index on mixes (guest_id);
create index on mix_items (mix_id);
create index on mix_ratings (mix_id);
create index on service_calls (status, created_at desc);
create index on problems (status, created_at desc);
create index on tasks (done, due_date);

-- ---------- RLS-заглушки ----------
-- Реальные политики нужно уточнить под конкретную модель аутентификации
-- (Telegram initData -> Supabase Auth), это оставлено как открытая задача.
-- На старте (пилот на одном заведении) можно временно держать RLS выключенным
-- и ограничивать доступ на уровне anon/service ключей, но перед продакшеном
-- это нужно закрыть по-настоящему.

alter table guests enable row level security;
alter table mixes enable row level security;
alter table mix_items enable row level security;
alter table mix_ratings enable row level security;
alter table service_calls enable row level security;
alter table problems enable row level security;
alter table tasks enable row level security;
alter table shifts enable row level security;
