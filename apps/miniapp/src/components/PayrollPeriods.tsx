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
 * "К выплате" — легко спутать, за какой период она уже посчитана.
 */
export default function PayrollPeriods({ summaries }: { summaries: PayrollPeriodSummary[] }) {
  return (
    <div className="stat-grid">
      {summaries.map((s) => (
        <div className="stat-tile" key={s.period.payoutDate}>
          <div className="value">{money(Math.max(0, s.due))}</div>
          <div className="label">
            К выплате {formatPayoutDate(s.period.payoutDate)}
            <div style={{ marginTop: 2 }}>{s.period.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
