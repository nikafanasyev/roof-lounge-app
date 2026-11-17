-- Роль «Официант» (смена с 18:00): без чек-листов, открытие и закрытие смены с фото.
alter table staff drop constraint if exists staff_work_role_check;
alter table staff
  add constraint staff_work_role_check check (work_role is null or work_role in ('bar', 'hookah', 'kitchen', 'cleaning', 'waiter'));
alter table shift_payroll drop constraint if exists shift_payroll_role_check;
alter table shift_payroll
  add constraint shift_payroll_role_check check (role is null or role in ('bar', 'hookah', 'kitchen', 'cleaning', 'waiter'));
alter table schedule_entries drop constraint if exists schedule_entries_role_check;
alter table schedule_entries
  add constraint schedule_entries_role_check check (role in ('bar', 'hookah', 'kitchen', 'cleaning', 'waiter'));
alter table payroll_issues drop constraint if exists payroll_issues_role_check;
alter table payroll_issues
  add constraint payroll_issues_role_check check (role in ('bar', 'hookah', 'kitchen', 'cleaning', 'waiter'));
alter table shift_photo_uploads drop constraint if exists shift_photo_uploads_role_check;
alter table shift_photo_uploads
  add constraint shift_photo_uploads_role_check check (role in ('bar', 'hookah', 'kitchen', 'cleaning', 'waiter'));
-- Время закрытия смены у ролей без чек-листов.
alter table staff_arrivals add column if not exists closed_at timestamptz;
