-- Авансы: выплата с kind = 'advance' видна в зарплате (уменьшает «к выплате»),
-- но в расходы НЕ попадает.
alter table payouts add column if not exists kind text not null default 'salary';
alter table payouts drop constraint if exists payouts_kind_check;
alter table payouts add constraint payouts_kind_check check (kind in ('salary', 'advance'));

create or replace function payout_to_expense() returns trigger language plpgsql as '
declare
  s_name text;
  s_role text;
  dept text;
begin
  if tg_op = ''DELETE'' then
    delete from expenses where payout_id = old.id;
    return old;
  end if;
  if new.kind = ''advance'' then
    delete from expenses where payout_id = new.id;
    return new;
  end if;
  select name, role into s_name, s_role from staff where id = new.staff_id;
  dept := case s_role when ''bar'' then ''Бар'' when ''hookah'' then ''Кальян'' when ''kitchen'' then ''Кухня'' else ''Общее'' end;
  if tg_op = ''UPDATE'' and exists (select 1 from expenses where payout_id = new.id) then
    update expenses set amount = new.amount, date = new.date,
      note = ''Выплата ЗП: '' || coalesce(s_name, ''?'') || coalesce('' — '' || new.note, '''')
    where payout_id = new.id;
    return new;
  end if;
  if new.amount > 0 then
    insert into expenses (date, amount, category, department, note, created_by_name, payout_id)
    values (new.date, new.amount, ''ЗП'', dept,
      ''Выплата ЗП: '' || coalesce(s_name, ''?'') || coalesce('' — '' || new.note, ''''),
      ''Авто (выплата ЗП)'', new.id);
  end if;
  return new;
end;
';
