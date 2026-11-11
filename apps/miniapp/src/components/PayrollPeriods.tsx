import type { PayrollPeriodSummary } from "@/data/repo";

function money(n: number): string {
  return n.toLocaleString("ru-RU") + " ₽";
}

function formatPayoutDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

/**
 * Две карточки "К выплате" — по одной на каждый актуальный зарплатный период
 * (см. getActivePayrollPeriods в data/repo.ts). Раньше была одна общая сумма
 * "К выплате" — легко спутать, за какой период она уже посчитана. Свой
 * .payroll-period-card вместо общего .stat-tile — чёткая иерархия: диапазон
 * дат сверху мелко, сумма крупно, дата выплаты отдельной строкой снизу
 * (см. обсуждение с Никитой 09.11.2026).
 */
export default function PayrollPeriods({ summaries }: { summaries: PayrollPeriodSummary[] }) {
  return (
    <div className="payroll-period-grid">
      {summaries.map((s) => (
        <div className="payroll-period-card" key={s.period.payoutDate}>
          <div className="range">{s.period.label}</div>
          <div className="amount">{money(Math.max(0, s.due))}</div>
          <div className="payout-date">К выплате {formatPayoutDate(s.period.payoutDate)}</div>
        </div>
      ))}
    </div>
  );
}
