-- Кнопка "Начислить ЗП за дату" в мини-аппе (см. обсуждение с Никитой
-- 14.10.2026: "это нужно продумать, чтобы руками не лезть в базу данных") —
-- раньше бэкфилл был доступен только командой /accrue боту в Telegram.
-- Миниапп не может сам дёргать Quick Resto (креды только у бота) и не
-- должен иметь сервисный ключ Supabase, поэтому запрос идёт тем же путём,
-- что и staff_invites/shift_photo_uploads — через таблицу, которую слушает
-- бот (watchPayrollRecalcRequests в apps/bot/src/notify.ts).
create table if not exists payroll_recalc_requests (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  result text,
  created_at timestamptz not null default now(),
  handled_at timestamptz
);
create index if not exists payroll_recalc_requests_date_idx on payroll_recalc_requests(date);

alter table payroll_recalc_requests enable row level security;
create policy "payroll_recalc_requests anon all (pilot)" on payroll_recalc_requests for all to anon using (true) with check (true);
