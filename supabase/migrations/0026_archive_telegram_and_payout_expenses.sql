-- 1) Архивный (удалённый) сотрудник держал telegram_id (колонка unique not null),
--    поэтому привязать этот ID к новой карточке было нельзя. При архивации
--    переворачиваем знак: id остаётся уникальным и узнаваемым, но не мешает.
update staff set telegram_id = -telegram_id where archived = true and telegram_id > 0;

create or replace function staff_free_telegram_on_archive() returns trigger language plpgsql as '
begin
  if new.archived = true and new.telegram_id > 0 then
    new.telegram_id := -new.telegram_id;
  end if;
  return new;
end;
';
drop trigger if exists staff_free_telegram_on_archive on staff;
create trigger staff_free_telegram_on_archive before update of archived on staff
  for each row execute function staff_free_telegram_on_archive();

-- 2) Выплаты ЗП (payouts) автоматически попадают в расходы (статья "ЗП").
alter table expenses add column if not exists payout_id uuid;
create unique index if not exists expenses_payout_id_uidx on expenses (payout_id) where payout_id is not null;

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
  select name, role into s_name, s_role from staff where id = new.staff_id;
  dept := case s_role when ''bar'' then ''Бар'' when ''hookah'' then ''Кальян'' when ''kitchen'' then ''Кухня'' else ''Общее'' end;
  if tg_op = ''UPDATE'' then
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
drop trigger if exists payout_to_expense on payouts;
create trigger payout_to_expense after insert or update or delete on payouts
  for each row execute function payout_to_expense();

-- Уже записанные выплаты — переносим в расходы один раз.
insert into expenses (date, amount, category, department, note, created_by_name, payout_id)
select p.date, p.amount, 'ЗП',
  case s.role when 'bar' then 'Бар' when 'hookah' then 'Кальян' when 'kitchen' then 'Кухня' else 'Общее' end,
  'Выплата ЗП: ' || coalesce(s.name, '?') || coalesce(' — ' || p.note, ''),
  'Авто (выплата ЗП)', p.id
from payouts p left join staff s on s.id = p.staff_id
where p.amount > 0 and not exists (select 1 from expenses e where e.payout_id = p.id);
