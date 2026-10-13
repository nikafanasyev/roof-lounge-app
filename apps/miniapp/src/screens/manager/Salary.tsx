import { useMemo, useState } from "react";
import { useStore } from "@/data/useStore";
import {
  adjustmentsStore,
  computeSalaryOverview,
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
 * Карточка одного сотрудника: ФИО в заголовке, дальше посменно дата/выручка/
 * зп, отдельно фиксированные начисления, и штрафы/премии — ровно та
 * раскладка, которую просил Никита 13.10.2026 взамен громоздкой гугл-таблицы
 * "ЗП руф". Сознательно НЕ переиспользует StaffDetail.tsx — там карточка
 * одного сотрудника для редактирования, здесь свод для быстрого обзора.
 */
function StaffSalaryCard({ overview }: { overview: ReturnType<typeof computeSalaryOverview>["staff"][number] }) {
  const [expanded, setExpanded] = useState(false);
  const shiftsToShow = expanded ? overview.shifts : overview.shifts.slice(0, 5);

  return (
    <div className="card">
      <div className="card-row" style={{ alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {overview.photoUrl ? (
            <img src={overview.photoUrl} alt="" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }} />
          ) : (
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "var(--surface-2, #eee)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
              }}
            >
              👤
            </div>
          )}
          <div style={{ fontWeight: 700, fontSize: 17 }}>{overview.name}</div>
        </div>
        <div style={{ fontWeight: 700, color: "var(--accent)" }}>{money(overview.netTotal)}</div>
      </div>

      {overview.shifts.length === 0 && overview.fixedAccruals.length === 0 && (
        <div className="muted" style={{ fontSize: 13 }}>
          Начислений пока нет
        </div>
      )}

      {overview.shifts.length > 0 && (
        <>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
            По сменам
          </div>
          <div style={{ marginBottom: 10 }}>
            {shiftsToShow.map((s) => (
              <div
                key={s.id}
                style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderTop: "1px solid var(--border)" }}
              >
                <span className="muted">
                  {formatShiftDate(s.date)}
                  {s.role ? ` · ${ROLE_LABELS[s.role]}` : ""} · выручка {money(s.revenue)}
                </span>
                <span style={{ fontWeight: 600 }}>{money(s.salary)}</span>
              </div>
            ))}
          </div>
          {overview.shifts.length > 5 && (
            <button
              className="muted"
              style={{ background: "none", border: "none", padding: 0, fontSize: 12, textDecoration: "underline", cursor: "pointer", marginBottom: 10 }}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "свернуть" : `показать все (${overview.shifts.length})`}
            </button>
          )}
        </>
      )}

      {overview.fixedAccruals.length > 0 && (
        <>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
            Фиксированные начисления
          </div>
          <div style={{ marginBottom: 10 }}>
            {overview.fixedAccruals.map((f) => (
              <div key={f.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderTop: "1px solid var(--border)" }}>
                <span className="muted">{f.label || "Начисление"} ({formatFixedAccrualCadence(f.cadence)})</span>
                <span style={{ fontWeight: 600 }}>{money(f.amount)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {(overview.fines > 0 || overview.bonuses > 0) && (
        <div className="chip-row" style={{ margin: 0 }}>
          {overview.bonuses > 0 && <span className="chip accent">+ премии {money(overview.bonuses)}</span>}
          {overview.fines > 0 && <span className="chip" style={{ color: "var(--danger)" }}>− штрафы {money(overview.fines)}</span>}
        </div>
      )}
    </div>
  );
}

export default function Salary() {
  useStore(staffDirectoryStore);
  useStore(shiftPayrollStore);
  useStore(adjustmentsStore);
  useStore(fixedAccrualsStore);

  const overview = useMemo(() => computeSalaryOverview(), [staffDirectoryStore.get(), shiftPayrollStore.get(), adjustmentsStore.get(), fixedAccrualsStore.get()]);
  const staffWithData = overview.staff.filter((s) => s.shifts.length > 0 || s.fixedAccruals.length > 0 || s.fines > 0 || s.bonuses > 0);
  const staffWithoutData = overview.staff.filter((s) => !staffWithData.includes(s));

  return (
    <div className="screen">
      <h1>Зарплата</h1>
      <p className="muted" style={{ fontSize: 13, marginTop: -8, marginBottom: 16 }}>
        Свод начислений по всем сотрудникам — отдельно от карточек в «Сотрудники». Штрафы и премии уже учтены в сумме «на руки».
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

      {staffWithData.map((s) => (
        <StaffSalaryCard key={s.staffId} overview={s} />
      ))}

      {staffWithoutData.length > 0 && (
        <div className="list-empty">
          Без начислений: {staffWithoutData.map((s) => s.name).join(", ")}
        </div>
      )}

      {overview.staff.length === 0 && <div className="list-empty">Сотрудников пока нет</div>}
    </div>
  );
}
