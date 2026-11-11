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
 * кнопка "Отметить выплаченным" — пишет запись в payouts (см. addPayout в
 * data/repo.ts). Раньше такой кнопки не было нигде в приложении — payouts
 * только читался ("Выплачено"/"К выплате"), создать запись было негде, и
 * "К выплате" никогда не уменьшалось (см. запрос Никиты 11.11.2026).
 * Сумма по умолчанию — весь остаток "К выплате" за период, но её можно
 * поправить вручную (выплатили не всё/с опозданием).
 */
function PeriodCard({ s, staffId }: { s: PayrollPeriodSummary; staffId?: string }) {
  const due = Math.max(0, Math.round(s.due));
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState(String(due));
  const [note, setNote] = useState("");

  function submit() {
    const value = Number(amount);
    if (!value || !staffId) return;
    addPayout(staffId, value, new Date().toISOString().slice(0, 10), note.trim() || s.period.label);
    setPaying(false);
    setNote("");
  }

  return (
    <div className="payroll-period-card">
      <div className="range">{s.period.label}</div>
      <div className="amount">{money(due)}</div>
      <div className="payout-date">К выплате {formatPayoutDate(s.period.payoutDate)}</div>

      {staffId && due > 0 && !paying && (
        <button
          className="btn secondary"
          style={{ marginTop: 8, width: "100%", padding: "6px 10px", fontSize: 12 }}
          onClick={() => setPaying(true)}
        >
          Отметить выплаченным
        </button>
      )}

      {staffId && paying && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ fontSize: 13 }} />
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Комментарий (необязательно)"
            style={{ fontSize: 13 }}
          />
          <div className="btn-row">
            <button className="btn secondary" style={{ flex: 1, padding: "6px 10px", fontSize: 12 }} onClick={() => setPaying(false)}>
              Отмена
            </button>
            <button className="btn primary" style={{ flex: 1, padding: "6px 10px", fontSize: 12 }} disabled={!Number(amount)} onClick={submit}>
              Записать
            </button>
          </div>
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
 * там же появляется кнопка "Отметить выплаченным". На "Моя зарплата" у
 * сотрудника (Dashboard.tsx) staffId не передаётся — это просмотр, без
 * возможности самому себе проставить выплату.
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
