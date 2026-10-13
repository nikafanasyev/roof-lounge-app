import { Link, useParams } from "react-router-dom";
import { useStore } from "@/data/useStore";
import {
  adjustmentsStore,
  computeSalaryOverviewForPeriod,
  fixedAccrualsStore,
  formatFixedAccrualCadence,
  shiftPayrollStore,
  staffDirectoryStore,
} from "@/data/repo";
import type { StaffRole } from "@/types";

const ROLE_LABELS: Record<StaffRole, string> = { bar: "Бар", hookah: "Кальяны" };

function money(n: number): string {
  return Math.round(n).toLocaleString("ru-RU") + " ₽";
}

function formatShiftDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

/**
 * Детализация одного зарплатного периода — та же раскладка по сотруднику,
 * что попадает в Excel-ведомость (см. lib/salaryExport.ts), только прямо в
 * интерфейсе, без скачивания файла. Открывается кликом по карточке периода
 * на экране "Зарплата". См. запрос Никиты 14.10.2026.
 */
export default function SalaryPeriodDetail() {
  useStore(staffDirectoryStore);
  useStore(shiftPayrollStore);
  useStore(adjustmentsStore);
  useStore(fixedAccrualsStore);
  const { periodKey = "" } = useParams();
  const overview = computeSalaryOverviewForPeriod(periodKey);
  const staffWithData = overview.staff.filter((s) => s.shifts.length > 0 || s.fixedAccruals.length > 0 || s.fines > 0 || s.bonuses > 0);

  return (
    <div className="screen">
      <Link to="/manager/salary" className="muted" style={{ textDecoration: "none", fontSize: 14 }}>
        ← Зарплата
      </Link>

      <h1 style={{ textTransform: "capitalize" }}>{overview.period.label}</h1>
      <p className="muted" style={{ fontSize: 13, marginTop: -8, marginBottom: 16 }}>
        Выплата {new Date(`${overview.period.payoutDate}T12:00:00`).toLocaleDateString("ru-RU", { day: "2-digit", month: "long" })}
      </p>

      <div className="card" style={{ background: "var(--accent-soft, var(--surface))" }}>
        <div className="card-row">
          <span className="muted">Итого на руки</span>
          <span style={{ fontWeight: 700 }}>{money(overview.netTotal)}</span>
        </div>
        <div className="card-row" style={{ marginTop: 6 }}>
          <span className="muted">НДФЛ 13% (сверху)</span>
          <span>{money(overview.ndfl)}</span>
        </div>
        <div className="card-row" style={{ marginTop: 6, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
          <span style={{ fontWeight: 700 }}>Итого + НДФЛ</span>
          <span style={{ fontWeight: 700, color: "var(--accent)" }}>{money(overview.grossTotal)}</span>
        </div>
      </div>

      {staffWithData.length === 0 && <div className="list-empty">За этот период начислений нет</div>}

      {staffWithData.map((s) => (
        <div key={s.staffId} className="card">
          <div className="card-row" style={{ alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {s.photoUrl ? (
                <img src={s.photoUrl} alt="" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} />
              ) : (
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: "var(--surface-2, #eee)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                  }}
                >
                  👤
                </div>
              )}
              <div style={{ fontWeight: 700 }}>{s.name}</div>
            </div>
            <div style={{ fontWeight: 700, color: "var(--accent)" }}>{money(s.netTotal)}</div>
          </div>

          {s.shifts.map((sh) => (
            <div key={sh.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderTop: "1px solid var(--border)" }}>
              <span className="muted">
                {formatShiftDate(sh.date)}
                {sh.role ? ` · ${ROLE_LABELS[sh.role]}` : ""} · выручка {money(sh.revenue)}
              </span>
              <span style={{ fontWeight: 600 }}>{money(sh.salary)}</span>
            </div>
          ))}

          {s.fixedAccruals.map((f) => (
            <div key={f.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderTop: "1px solid var(--border)" }}>
              <span className="muted">{f.label || "Фикс. начисление"} ({formatFixedAccrualCadence(f.cadence)})</span>
              <span style={{ fontWeight: 600 }}>{money(f.amount)}</span>
            </div>
          ))}

          {s.adjustments.map((a) => (
            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderTop: "1px solid var(--border)" }}>
              <span className="muted">
                {a.type === "fine" ? "Штраф" : "Премия"} · {a.reason}
              </span>
              <span style={{ fontWeight: 600, color: a.type === "fine" ? "var(--danger)" : "var(--good)" }}>
                {a.type === "fine" ? "−" : "+"}
                {money(a.amount)}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
