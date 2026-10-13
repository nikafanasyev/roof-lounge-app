-- Удаление штрафа/премии "вручную" (кнопка "Удалить" в "Штрафы" / "Ещё" →
-- "Штрафы и премии") — не жёсткий DELETE (стёрлась бы сама история, зачем
-- запись вообще появлялась и кто её отменил), а пометка deleted_at/by/reason,
-- см. тот же принцип, что уже применён к увольнению сотрудника (staff.archived
-- в 0012_salary_screen.sql). Удалённые записи не считаются в ЗП/экспорте, но
-- остаются видны (зачёркнутыми) в "Штрафы" для аудита.
alter table adjustments
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references staff(id) on delete set null,
  add column if not exists deleted_by_name text,
  add column if not exists delete_reason text;
