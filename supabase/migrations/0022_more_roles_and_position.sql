-- Новые рабочие роли (кухня, клининг) и должность сотрудника (запрос Никиты
-- 12.11.2026). Старые check-ограничения называются автоматически
-- (staff_work_role_check и т.п.) — не полагаемся на имена, находим по
-- определению и пересоздаём.
do $$
declare
  rec record;
begin
  for rec in
    select c.conrelid::regclass as tbl, c.conname
    from pg_constraint c
    where c.contype = 'c'
      and c.conrelid in ('staff'::regclass, 'shift_payroll'::regclass, 'schedule_entries'::regclass, 'payroll_issues'::regclass)
      and pg_get_constraintdef(c.oid) ilike '%hookah%'
  loop
    execute format('alter table %s drop constraint %I', rec.tbl, rec.conname);
  end loop;
end $$;

alter table staff
  add constraint staff_work_role_check check (work_role is null or work_role in ('bar', 'hookah', 'kitchen', 'cleaning'));
alter table shift_payroll
  add constraint shift_payroll_role_check check (role is null or role in ('bar', 'hookah', 'kitchen', 'cleaning'));
alter table schedule_entries
  add constraint schedule_entries_role_check check (role in ('bar', 'hookah', 'kitchen', 'cleaning'));
alter table payroll_issues
  add constraint payroll_issues_role_check check (role in ('bar', 'hookah', 'kitchen', 'cleaning'));

alter table staff add column if not exists position text;
