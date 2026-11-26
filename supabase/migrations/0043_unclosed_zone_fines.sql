-- Предложенные штрафы разных видов: опоздание (late) и незакрытая зона (unclosed).
-- Один вид — одно предложение на сотрудника в день.
alter table late_proposals add column if not exists kind text not null default 'late';
alter table late_proposals drop constraint if exists late_proposals_staff_id_date_key;
drop index if exists late_proposals_staff_date_kind_uidx;
create unique index late_proposals_staff_date_kind_uidx on late_proposals (staff_id, date, kind);
