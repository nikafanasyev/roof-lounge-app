-- Начисление не должно переживать смену человека в графике: если запись графика
-- (дата + роль) удалили или заменили на другого, начисление прежнему сотруднику
-- за эту дату/роль удаляется. Бот сам начислит новому по графику.
create or replace function payroll_follow_schedule() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' or new.staff_id is distinct from old.staff_id then
    delete from shift_payroll
     where date = old.date and role = old.role and staff_id = old.staff_id;
  end if;
  return null;
end $$;

drop trigger if exists schedule_entries_payroll_follow on schedule_entries;
create trigger schedule_entries_payroll_follow
  after update of staff_id or delete on schedule_entries
  for each row execute function payroll_follow_schedule();

-- Разовая чистка старых дублей: убираем начисление, если по графику на эту
-- дату/роль стоит другой человек И у него начисление уже есть.
delete from shift_payroll p
where not exists (
        select 1 from schedule_entries e
        where e.date = p.date and e.role = p.role and e.staff_id = p.staff_id)
  and exists (
        select 1 from shift_payroll q
        join schedule_entries e on e.date = q.date and e.role = q.role and e.staff_id = q.staff_id
        where q.date = p.date and q.role = p.role);
