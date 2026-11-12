-- Личные чаевые сотрудника: сотрудник сам вносит сумму за день (как заметки),
-- в кабинете видит сумму за календарный месяц. В зарплату ("К выплате") НЕ входят.
create table if not exists tips (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  amount numeric not null check (amount > 0),
  date date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists tips_staff_date_idx on tips (staff_id, date);

alter table tips enable row level security;
create policy "tips anon all (pilot)" on tips for all to anon using (true) with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tips'
  ) then
    alter publication supabase_realtime add table tips;
  end if;
end $$;
