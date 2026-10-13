import { useMemo, useState } from "react";
import { useStore } from "@/data/useStore";
import {
  adjustmentsStore,
  computeSalaryOverview,
  fixedAccrualsStore,
  formatFixedAccrualCadence,
  getPayrollPeriodForDate,
  shiftPayrollStore,
  staffDirectoryStore,
} from "@/data/repo";
import type { ShiftPayrollEntry, StaffRole } from "@/types";

const ROLE_LABELS: Record<StaffRole, string> = { bar: "Бар", hookah: "Кальяны" };

function money(n: number): string {
  return Math.round(n).toLocaleString("ru-RU") + " ₽";
}

function formatShiftDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

type SortOrder = "desc" | "asc";

interface PeriodGroup {
  key: string; // period.start — уникален и сортируется как строка
  label: string; // "11–24 октября"
  payoutDate: string;
  total: number;
  shifts: ShiftPayrollEntry[];
}

/**
 * Смены разбиваются по тем же зарплатным периодам (11–24 / 25–10 число, см.
 * getPayrollPeriodForDate в data/repo.ts), что уже используются в карточке
 * сотрудника ("К выплате ДД.ММ") — так привычнее, чем один длинный список
 * вперемешку. См. запрос Никиты 14.10.2026: "выделим по периодам".
 */
function groupShiftsByPeriod(shifts: ShiftPayrollEntry[], order: SortOrder): PeriodGroup[] {
  const groups = new Map<string, PeriodGroup>();
  for (const s of shifts) {
    const period = getPayrollPeriodForDate(s.date);
    const existing = groups.get(period.start);
    if (existing) {
      existing.shifts.push(s);
      existing.total += s.salary;
    } else {
      groups.set(period.start, { key: period.start, label: period.label, payoutDate: period.payoutDate, total: s.salary, shifts: [s] });
    }
  }
  const sortedGroups = Array.from(groups.values()).sort((a, b) => (order === "desc" ? b.key.localeCompare(a.key) : a.key.localeCompare(b.key)));
  for (const g of sortedGroups) {
    g.shifts.sort((a, b) => (order === "desc" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));
  }
  return sortedGroups;
}

/**
 * Карточка одного сотрудника: ФИО в заголовке, дальше посменно дата/выручка/
 * зп (сгруппировано по зарплатным периодам), отдельно фиксированные
 * начисления, и штрафы/премии — ровно та раскладка, которую просил Никита
 * 13.10.2026 взамен громоздкой гугл-таблицы "ЗП руф". Сознательно НЕ
 * переиспользует StaffDetail.tsx — там карточка одного сотрудника для
 * редактирования, здесь свод для быстрого обзора.
 */
function StaffSalaryCard({ overview, order }: { overview: ReturnType<typeof computeSalaryOverview>["staff"][number]; order: SortOrder }) {
  const periods = useMemo(() => groupShiftsByPeriod(overview.shifts, order), [overview.shifts, order]);

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

      {periods.map((group) => (
        <div key={group.key} style={{ marginBottom: 10 }}>
          <div className="card-row" style={{ fontSize: 12 }}>
            <span className="muted">{group.label}</span>
            <span className="muted">{money(group.total)}</span>
          </div>
          {group.shifts.map((s) => (
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
      ))}

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
  const [order, setOrder] = useState<SortOrder>("desc");

  const overview = useMemo(() => computeSalaryOverview(), [staffDirectoryStore.get(), shiftPayrollStore.get(), adjustmentsStore.get(), fixedAccrualsStore.get()]);
  const staffWithData = overview.staff.filter((s) => s.shifts.length > 0 || s.fixedAccruals.length > 0 || s.fines > 0 || s.bonuses > 0);
  const staffWithoutData = overview.staff.filter((s) => !staffWithData.includes(s));

  return (
    <div className="screen">
      <div className="card-row" style={{ alignItems: "flex-start" }}>
        <h1 style={{ margin: 0 }}>Зарплата</h1>
        <button
          className="btn secondary"
          style={{ width: "auto", padding: "6px 12px", fontSize: 13 }}
          onClick={() => setOrder((o) => (o === "desc" ? "asc" : "desc"))}
        >
          {order === "desc" ? "сначала новые ↓" : "сначала старые ↑"}
        </button>
      </div>
      <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
        Свод начислений по всем сотрудникам — отдельно от карточек в «Сотрудники». Смены сгруппированы по
        зарплатным периодам (11–24 / 25–10 число), штрафы и премии уже учтены в сумме «на руки».
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
        <StaffSalaryCard key={s.staffId} overview={s} order={order} />
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
