import { useStore } from "@/data/useStore";
import {
  adjustmentsStore,
  computePayrollSummary,
  listShiftPayrollByMonth,
  payoutsStore,
  shiftPayrollStore,
} from "@/data/repo";

function money(n: number): string {
  return n.toLocaleString("ru-RU") + " ₽";
}

export default function Dashboard() {
  useStore(shiftPayrollStore);
  useStore(adjustmentsStore);
  useStore(payoutsStore);
  const summary = computePayrollSummary();
  const months = listShiftPayrollByMonth();

  return (
    <div className="screen">
      <h1>Моя зарплата</h1>

      <div className="card" style={{ textAlign: "center", padding: "18px 16px" }}>
        <div className="eyebrow" style={{ marginBottom: 4 }}>
          К выплате
        </div>
        <div style={{ fontSize: 30, fontWeight: 700 }}>{money(summary.due)}</div>
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          зарплата + премии − штрафы − выплачено
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-tile">
          <div className="value" style={{ color: "var(--accent)" }}>
            {money(summary.earned)}
          </div>
          <div className="label">Зарплата</div>
        </div>
        <div className="stat-tile">
          <div className="value" style={{ color: "var(--good)" }}>
            {money(summary.paid)}
          </div>
          <div className="label">Выплачено</div>
        </div>
        <div className="stat-tile">
          <div className="value" style={{ color: "var(--danger)" }}>
            {money(summary.fines)}
          </div>
          <div className="label">Штрафы</div>
        </div>
        <div className="stat-tile">
          <div className="value" style={{ color: "var(--good)" }}>
            {money(summary.bonuses)}
          </div>
          <div className="label">Премии</div>
        </div>
      </div>

      <h2>Разбивка по сменам</h2>
      {months.length === 0 && <div className="list-empty">Смен пока не было</div>}
      {months.map((group) => (
        <div key={group.monthLabel} style={{ marginBottom: 16 }}>
          <div className="card-row" style={{ marginBottom: 6 }}>
            <span className="muted" style={{ fontSize: 13, textTransform: "capitalize" }}>
              {group.monthLabel}
            </span>
            <span style={{ fontWeight: 700 }}>{money(group.total)}</span>
          </div>
          {group.shifts.map((s) => (
            <div key={s.id} className="card card-row">
              <div>
                <div style={{ fontWeight: 700 }}>
                  {new Date(s.date).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  выручка {money(s.revenue)}
                </div>
              </div>
              <div style={{ fontWeight: 700, color: "var(--accent)" }}>{money(s.salary)}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
