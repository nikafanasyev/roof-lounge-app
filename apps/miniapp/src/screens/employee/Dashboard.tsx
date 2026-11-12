import { useState } from "react";
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
import { Link } from "react-router-dom";
import { computeMyTipsForMonth, currentMonthKey, tipsStore } from "@/data/repo";
import PayrollPeriods from "@/components/PayrollPeriods";

function money(n: number): string {
  return n.toLocaleString("ru-RU") + " ₽";
}

function pluralShifts(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} смена`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} смены`;
  return `${n} смен`;
}

/** Месяц со сменами — сворачиваемый, по умолчанию раскрыт только свежий (как в карточке сотрудника у руководителя). */
function MonthShifts({ group, defaultOpen }: { group: ReturnType<typeof listShiftPayrollByMonth>[number]; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 12 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="card-row"
        style={{ width: "100%", background: "none", border: "none", padding: "8px 0", cursor: "pointer", color: "inherit", font: "inherit", marginBottom: 6 }}
      >
        <span className="muted" style={{ fontSize: 13, textTransform: "capitalize" }}>
          {open ? "▾" : "▸"} {group.monthLabel} · {pluralShifts(group.shifts.length)}
        </span>
        <span style={{ fontWeight: 700 }}>{money(group.total)}</span>
      </button>
      {open &&
        group.shifts.map((s) => (
          <div key={s.id} className="card card-row">
            <div>
              <div style={{ fontWeight: 700 }}>{new Date(s.date).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                выручка {money(s.revenue)}
              </div>
            </div>
            <div style={{ fontWeight: 700, color: "var(--accent)" }}>{money(s.salary)}</div>
          </div>
        ))}
    </div>
  );
}

export default function Dashboard() {
  useStore(shiftPayrollStore);
  useStore(adjustmentsStore);
  useStore(payoutsStore);
  useStore(tipsStore);
  const summary = computePayrollSummary();
  const periods = listActivePayrollPeriodSummaries();
  const earnedThisMonth = computeEarnedThisCalendarMonth();
  const months = listShiftPayrollByMonth();
  const tipsThisMonth = computeMyTipsForMonth(currentMonthKey());

  return (
    <div className="screen">
      <h1>Моя зарплата</h1>

      <PayrollPeriods summaries={periods} />

      <div className="hero-stat-card">
        <div className="eyebrow">Заработано за месяц</div>
        <div className="value">{money(earnedThisMonth)}</div>
      </div>

      <div className="stat-grid cols-3">
        <div className="stat-tile">
          <div className="value">{money(earnedThisMonth)}</div>
          <div className="label">Зарплата</div>
        </div>
        <div className="stat-tile good">
          <div className="value">{money(tipsThisMonth)}</div>
          <div className="label">Чаевые</div>
        </div>
        <div className="stat-tile good">
          <div className="value">{money(earnedThisMonth + tipsThisMonth)}</div>
          <div className="label">Всего</div>
        </div>
      </div>
      <Link to="/employee/tips" className="btn" style={{ display: "block", textAlign: "center", textDecoration: "none", margin: "8px 0 12px" }}>
        🪙 Мои чаевые
      </Link>

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
      {months.map((group, i) => (
        <MonthShifts key={group.monthLabel} group={group} defaultOpen={i === 0} />
      ))}
    </div>
  );
}
