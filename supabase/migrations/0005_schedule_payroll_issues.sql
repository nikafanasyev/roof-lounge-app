-- Переход от реал-тайм определения роли на смене (bar_opened_by/hookah_opened_by
-- в shifts, см. 0003/0004) к графику: руководитель заранее назначает, кто в
-- какой день отвечает за бар/кальяны, а бот на следующий день сверяет график
-- с тем, кто реально работал по Quick Resto, и либо начисляет автоматически,
-- либо откладывает начисление и уведомляет руководителя (см.
-- apps/bot/src/quickresto.ts processScheduledDate).

create table schedule_entries (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  role text not null check (role in ('bar', 'hookah')),
  date date not null,
  start_time text not null default '18:00',
  end_time text not null default '02:00',
  created_at timestamptz not null default now(),
  unique (date, role) -- один сотрудник на роль в день — как в реальности (два "универсала" на смену)
);
create index schedule_entries_staff_id_idx on schedule_entries(staff_id);
create index schedule_entries_date_idx on schedule_entries(date);

-- Записывается ботом, когда на дату/роль в графике назначен один сотрудник,
-- а по Quick Resto в этот бизнес-день реально работал кто-то другой (или
-- никто). revenue уже посчитана на момент записи — руководителю при
-- разрешении не нужно заново дёргать Quick Resto.
create table payroll_issues (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  role text not null check (role in ('bar', 'hookah')),
  expected_staff_id uuid references staff(id) on delete set null,
  actual_staff_ids uuid[] not null default '{}',
  revenue numeric not null default 0,
  resolved boolean not null default false,
  resolved_staff_id uuid references staff(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index payroll_issues_date_idx on payroll_issues(date);
create index payroll_issues_unresolved_idx on payroll_issues(resolved) where not resolved;
