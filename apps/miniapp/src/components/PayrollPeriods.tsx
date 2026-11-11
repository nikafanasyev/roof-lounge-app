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
 * Модалка записи выплаты — вынесена из самой карточки периода (см.
 * обсуждение с Никитой 11.11.2026: инлайн-форма прямо в карточке
 * выглядела перегруженно). Открывается кнопкой "Записать выплату" на
 * карточке. Сумма — всегда руками: на практике выплачивают круглыми
 * суммами (кратно 100 ₽), а не "до копейки" от расчёта, поэтому
 * подставляем остаток, округлённый до ближайших 100 ₽, как стартовое
 * значение — не отправляем её автоматически.
 */
function PayoutSheet({
  periodLabel,
  due,
  staffId,
  onClose,
}: {
  periodLabel: string;
  due: number;
  staffId: string;
  onClose: () => void;
}) {
  const roundedDue = Math.round(due / 100) * 100;
  const [amount, setAmount] = useState(String(roundedDue));
  const [note, setNote] = useState("");

  function submit() {
    const value = Number(amount);
    if (!value) return;
    addPayout(staffId, value, new Date().toISOString().slice(0, 10), note.trim() || periodLabel);
    onClose();
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet-panel" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <span>Выплата · {periodLabel}</span>
          <button className="btn ghost" style={{ padding: "4px 8px", fontSize: 13 }} onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="eyebrow">Сумма, ₽</div>
        <input
          type="number"
          step={100}
          autoFocus
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={{ marginBottom: 10 }}
        />
        <div className="eyebrow">Комментарий (необязательно)</div>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} style={{ marginBottom: 14 }} />
        <div className="btn-row">
          <button className="btn secondary" style={{ flex: 1 }} onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" style={{ flex: 1 }} disabled={!Number(amount)} onClick={submit}>
            Записать выплату
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Карточка одного периода + (только у руководителя, когда передан staffId)
 * кнопка "Записать выплату", открывающая PayoutSheet. Раньше такой
 * возможности не было нигде в приложении — payouts (см. addPayout в
 * data/repo.ts) только читался ("Выплачено"/"К выплате"), создать запись
 * было негде, и "К выплате" никогда не уменьшалось (см. запрос Никиты
 * 11.11.2026: "у нас вроде не реализована функция выплат").
 */
function PeriodCard({ s, staffId }: { s: PayrollPeriodSummary; staffId?: string }) {
  const due = Math.max(0, s.due);
  const [paying, setPaying] = useState(false);

  return (
    <div className="payroll-period-card">
      <div className="range">{s.period.label}</div>
      <div className="amount">{money(due)}</div>
      <div className="payout-date">К выплате {formatPayoutDate(s.period.payoutDate)}</div>

      {staffId && due > 0 && (
        <button
          className="btn secondary"
          style={{ marginTop: 8, width: "100%", padding: "6px 10px", fontSize: 12 }}
          onClick={() => setPaying(true)}
        >
          Записать выплату
        </button>
      )}

      {paying && staffId && (
        <PayoutSheet periodLabel={s.period.label} due={due} staffId={staffId} onClose={() => setPaying(false)} />
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
 * там же появляется кнопка записи выплаты. На "Моя зарплата" у сотрудника
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
