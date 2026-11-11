import { useStore } from "@/data/useStore";
import {
  adjustmentsStore,
  computeEarnedThisCalendarMonth,
  computePayrollSummary,
  listActivePayrollPeriodSummaries,
  listShiftPayrollByMonth,
  payoutsStore,
  shiftPayrollStore,
} from "@/data/repo";
import PayrollPeriods from "@/components/PayrollPeriods";

function money(n: number): string {
  return n.toLocaleString("ru-RU") + " ₽";
}

export default function Dashboard() {
  useStore(shiftPayrollStore);
  useStore(adjustmentsStore);
  useStore(payoutsStore);
  const summary = computePayrollSummary();
  const periods = listActivePayrollPeriodSummaries();
  const earnedThisMonth = computeEarnedThisCalendarMonth();
  const months = listShiftPayrollByMonth();

  return (
    <div className="screen">
      <h1>Моя зарплата</h1>

      <PayrollPeriods summaries={periods} />

      <div className="hero-stat-card">
        <div className="eyebrow">Заработано за месяц</div>
        <div className="value">{money(earnedThisMonth)}</div>
      </div>

      {/*
        "Зарплата (всего)" убрали — это сумма за всё время с момента найма,
        она только росла и путала рядом с "Заработано за месяц" выше (см.
        обсуждение с Никитой 09.11.2026: "Зарплата всего будто просто
        лишнее"). Выплачено/Штрафы/Премии оставили — это за весь период
        (с последней выплаты), а не за календарный месяц. cols-3 — чтобы
        три плашки легли в один ровный ряд, а не переносились (см. тот же
        скриншот).
      */}
      <div className="stat-grid cols-3">
        <div className="stat-tile good">
          <div className="value">{money(summary.paid)}</div>
          <div className="label">Выплачено</div>
        </div>
        <div className="stat-tile danger">
          <div className="value">{money(summary.fines)}</div>
          <div className="label">Штрафы</div>
        </div>
        <div className="stat-tile good">
          <div className="value">{money(summary.bonuses)}</div>
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
