import { useState } from "react";
import { addPayout } from "@/data/repo";
import type { PayrollPeriodSummary } from "@/data/repo";

function money(n: number): string {
  return n.toLocaleString("ru-RU") + " ₽";
}

function formatPayoutDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

/**
 * Карточка одного периода + (только у руководителя, когда передан staffId)
 * форма выплаты — пишет запись в payouts (см. addPayout в data/repo.ts).
 * Раньше такой возможности не было нигде в приложении — payouts только
 * читался ("Выплачено"/"К выплате"), создать запись было негде, и "К
 * выплате" никогда не уменьшалось (см. запрос Никиты 11.11.2026).
 *
 * Сумма — всегда руками, без кнопки "в один клик на весь остаток": на
 * практике выплачивают круглыми суммами (кратно 100 ₽), а не "до копейки"
 * от расчёта, поэтому подставляем остаток, округлённый до ближайших
 * 100 ₽, как стартовое значение в поле — не отправляем её автоматически
 * (см. обсуждение с Никитой 11.11.2026: "проще суммы, округлённые до 100,
 * поэтому просто кнопка не подойдёт").
 */
function PeriodCard({ s, staffId }: { s: PayrollPeriodSummary; staffId?: string }) {
  const due = Math.max(0, s.due);
  const roundedDue = Math.round(due / 100) * 100;
  const [amount, setAmount] = useState(String(roundedDue));
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);

  function submit() {
    const value = Number(amount);
    if (!value || !staffId) return;
    addPayout(staffId, value, new Date().toISOString().slice(0, 10), note.trim() || s.period.label);
    setNote("");
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="payroll-period-card">
      <div className="range">{s.period.label}</div>
      <div className="amount">{money(due)}</div>
      <div className="payout-date">К выплате {formatPayoutDate(s.period.payoutDate)}</div>

      {staffId && due > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          <input type="number" step={100} value={amount} onChange={(e) => setAmount(e.target.value)} style={{ fontSize: 13 }} />
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Комментарий (необязательно)"
            style={{ fontSize: 13 }}
          />
          <button className="btn primary" style={{ padding: "6px 10px", fontSize: 12 }} disabled={!Number(amount)} onClick={submit}>
            {saved ? "Записано" : "Записать выплату"}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Две карточки "К выплате" — по одной на каждый актуальный зарплатный период
 * (см. getActivePayrollPeriods в data/repo.ts). Раньше была одна общая сумма
 * "К выплате" — легко спутать, за какой период она уже посчитана. Свой
 * .payroll-period-card вместо общего .stat-tile — чёткая иерархия: диапазон
 * дат сверху мелко, сумма крупно, дата выплаты отдельной строкой снизу
 * (см. обсуждение с Никитой 09.11.2026).
 *
 * staffId передаётся только из кабинета руководителя (StaffDetail.tsx) —
 * там же появляется форма записи выплаты. На "Моя зарплата" у сотрудника
 * (Dashboard.tsx) staffId не передаётся — это просмотр, без возможности
 * самому себе проставить выплату.
 */
export default function PayrollPeriods({ summaries, staffId }: { summaries: PayrollPeriodSummary[]; staffId?: string }) {
  return (
    <div className="payroll-period-grid">
      {summaries.map((s) => (
        <PeriodCard key={s.period.payoutDate} s={s} staffId={staffId} />
      ))}
    </div>
  );
}
