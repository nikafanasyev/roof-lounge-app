-- Предложения новых вкусов: мастер не добавляет вкус в каталог сам, а шлёт
-- заявку руководству. После одобрения вкус попадает в flavors.
create table if not exists flavor_proposals (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  name text not null,
  note text,
  proposed_by uuid references staff(id) on delete set null,
  proposed_by_name text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by_name text,
  decided_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz not null default now()
);

alter table flavor_proposals enable row level security;
create policy "flavor_proposals anon all (pilot)" on flavor_proposals for all to anon using (true) with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'flavor_proposals'
  ) then
    alter publication supabase_realtime add table flavor_proposals;
  end if;
end $$;
