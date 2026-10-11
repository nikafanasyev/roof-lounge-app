import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useStore } from "@/data/useStore";
import {
  computeAverageSalaryPerShift,
  computeEarnedThisCalendarMonthForStaff,
  computePayrollSummaryForStaff,
  formatSalaryModel,
  getStaffProfileById,
  listActivePayrollPeriodSummariesForStaff,
  listShiftPayrollByMonthForStaff,
  listStaffDirectory,
  reassignShiftPayroll,
  shiftPayrollStore,
  staffDirectoryStore,
  yearsOfService,
} from "@/data/repo";
import PayrollPeriods from "@/components/PayrollPeriods";
import type { StaffRole } from "@/types";

const ROLE_LABELS: Record<StaffRole, string> = { bar: "Бар", hookah: "Кальяны" };

function money(n: number): string {
  return n.toLocaleString("ru-RU") + " ₽";
}

function formatTenure(hiredAt: string): string {
  const { years, months } = yearsOfService(hiredAt);
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} г.`);
  parts.push(`${months} мес.`);
  return parts.join(" ");
}

function formatExpiry(iso?: string): string {
  if (!iso) return "не указано";
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Карточка одной начисленной смены + переназначение на другого сотрудника —
 * на случай, если в графике была замена, а бот успел начислить не тому (см.
 * reassignShiftPayroll в data/repo.ts). Выручка переносится как есть,
 * сумма пересчитывается по salary_model выбранного сотрудника.
 */
function ShiftRow({ id, staffId, date, role, revenue, salary }: { id: string; staffId: string; date: string; role?: StaffRole; revenue: number; salary: number }) {
  const [open, setOpen] = useState(false);
  const staff = listStaffDirectory();
  const others = staff.filter((s) => s.id !== staffId);
  const [pick, setPick] = useState(() => others[0]?.id ?? "");

  return (
    <div className="card">
      <div className="card-row">
        <div>
          <div style={{ fontWeight: 700 }}>
            {new Date(date).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}
            {role ? ` · ${ROLE_LABELS[role]}` : ""}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            выручка {money(revenue)}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700, color: "var(--accent)" }}>{money(salary)}</div>
          <button
            className="muted"
            style={{ background: "none", border: "none", padding: 0, fontSize: 12, textDecoration: "underline", cursor: "pointer" }}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "отмена" : "переназначить"}
          </button>
        </div>
      </div>
      {open && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <select style={{ flex: 1 }} value={pick} onChange={(e) => setPick(e.target.value)}>
            {others.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            className="btn primary"
            style={{ width: "auto", padding: "11px 16px" }}
            disabled={!pick}
            onClick={() => {
              reassignShiftPayroll(id, pick);
              setOpen(false);
            }}
          >
            Перенести
          </button>
        </div>
      )}
    </div>
  );
}

export default function StaffDetail() {
  useStore(staffDirectoryStore);
  useStore(shiftPayrollStore);
  const { staffId = "" } = useParams();
  const profile = getStaffProfileById(staffId);

  if (!profile) {
    return (
      <div className="screen">
        <Link to="/manager/staff" className="muted" style={{ textDecoration: "none", fontSize: 14 }}>
          ← Сотрудники
        </Link>
        <div className="list-empty">Сотрудник не найден</div>
      </div>
    );
  }

  const summary = computePayrollSummaryForStaff(staffId);
  const periods = listActivePayrollPeriodSummariesForStaff(staffId);
  const earnedThisMonth = computeEarnedThisCalendarMonthForStaff(staffId);
  const avgPerShift = computeAverageSalaryPerShift(staffId);
  const months = listShiftPayrollByMonthForStaff(staffId);
  const expirySoon =
    profile.medicalBookExpiry && new Date(profile.medicalBookExpiry).getTime() - Date.now() < 86400000 * 30;

  return (
    <div className="screen">
      <Link to="/manager/staff" className="muted" style={{ textDecoration: "none", fontSize: 14 }}>
        ← Сотрудники
      </Link>

      <div className="eyebrow" style={{ marginTop: 12 }}>
        {profile.role ? ROLE_LABELS[profile.role] : "Роль не задана"}
      </div>
      <h1>{profile.name}</h1>

      <div className="card">
        <div className="card-row">
          <span className="muted">Стаж</span>
          <span>{formatTenure(profile.hiredAt)}</span>
        </div>
        <div className="card-row" style={{ marginTop: 8 }}>
          <span className="muted">Телефон</span>
          <span>{profile.phone || "не указан"}</span>
        </div>
        <div className="card-row" style={{ marginTop: 8 }}>
          <span className="muted">Почта</span>
          <span>{profile.email || "не указана"}</span>
        </div>
        <div className="card-row" style={{ marginTop: 8 }}>
          <span className="muted">Медкнижка</span>
          <span style={{ color: expirySoon ? "var(--warn)" : "var(--ink)" }}>
            {profile.medicalBookNumber ? `№ ${profile.medicalBookNumber} · до ${formatExpiry(profile.medicalBookExpiry)}` : "не указана"}
          </span>
        </div>
        <div className="card-row" style={{ marginTop: 8 }}>
          <span className="muted">Модель ЗП</span>
          <span>{formatSalaryModel(profile)}</span>
        </div>
      </div>

      <PayrollPeriods summaries={periods} />

      <div className="stat-grid">
        <div className="stat-tile">
          <div className="value">{money(earnedThisMonth)}</div>
          <div className="label">Заработано за месяц</div>
        </div>
        <div className="stat-tile">
          <div className="value">{money(avgPerShift)}</div>
          <div className="label">Средняя ЗП за смену</div>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-tile">
          <div className="value" style={{ color: "var(--accent)" }}>
            {money(summary.earned)}
          </div>
          <div className="label">Начислено (всего)</div>
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

      <h2>Начисления по сменам</h2>
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
            <ShiftRow key={s.id} id={s.id} staffId={s.staffId} date={s.date} role={s.role} revenue={s.revenue} salary={s.salary} />
          ))}
        </div>
      ))}
    </div>
  );
}
