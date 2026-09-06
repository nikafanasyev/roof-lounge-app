import { useStore } from "@/data/useStore";
import { computePayrollSummary, listShiftPayroll, shiftPayrollStore, adjustmentsStore } from "@/data/repo";

function money(n: number): string {
  return n.toLocaleString("ru-RU") + " ₽";
}

export default function Dashboard() {
  useStore(shiftPayrollStore);
  useStore(adjustmentsStore);
  const summary = computePayrollSummary();
  const shifts = listShiftPayroll();

  return (
    <div className="screen">
      <h1>Моя зарплата</h1>

      <div className="stat-grid">
        <div className="stat-tile">
          <div className="value">{money(summary.earned)}</div>
          <div className="label">Заработано</div>
        </div>
        <div className="stat-tile">
          <div className="value">{money(summary.due)}</div>
          <div className="label">К выплате</div>
        </div>
        <div className="stat-tile">
          <div className="value" style={{ color: "var(--good)" }}>
            +{money(summary.bonuses)}
          </div>
          <div className="label">Премии</div>
        </div>
        <div className="stat-tile">
          <div className="value" style={{ color: "var(--danger)" }}>
            −{money(summary.fines)}
          </div>
          <div className="label">Штрафы</div>
        </div>
        <div className="stat-tile" style={{ gridColumn: "span 2" }}>
          <div className="value">{money(summary.paid)}</div>
          <div className="label">Уже выплачено</div>
        </div>
      </div>

      <h2>Разбивка по сменам</h2>
      {shifts.length === 0 && <div className="list-empty">Смен пока не было</div>}
      {shifts.map((s) => (
        <div key={s.id} className="card card-row">
          <div>
            <div style={{ fontWeight: 700 }}>
              {new Date(s.date).toLocaleDateString("ru-RU", { day: "2-digit", month: "short" })}
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              Выручка {money(s.revenue)}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 700 }}>{money(s.salary)}</div>
            <span className={`chip ${s.paid ? "" : "accent"}`}>{s.paid ? "выплачено" : "к выплате"}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
