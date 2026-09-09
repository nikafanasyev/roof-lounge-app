import { Link, useParams } from "react-router-dom";
import { useStore } from "@/data/useStore";
import {
  computePayrollSummaryForStaff,
  formatSalaryModel,
  getStaffProfileById,
  listShiftPayrollByMonthForStaff,
  shiftPayrollStore,
  staffDirectoryStore,
  yearsOfService,
} from "@/data/repo";
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

      <div className="stat-grid">
        <div className="stat-tile">
          <div className="value" style={{ color: "var(--accent)" }}>
            {money(summary.earned)}
          </div>
          <div className="label">Начислено</div>
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
      <div className="card" style={{ textAlign: "center", padding: "14px 16px" }}>
        <div className="eyebrow" style={{ marginBottom: 4 }}>
          К выплате
        </div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{money(summary.due)}</div>
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
            <div key={s.id} className="card card-row">
              <div>
                <div style={{ fontWeight: 700 }}>
                  {new Date(s.date).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}
                  {s.role ? ` · ${ROLE_LABELS[s.role]}` : ""}
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
