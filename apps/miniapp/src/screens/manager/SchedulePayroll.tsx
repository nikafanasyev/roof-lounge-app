import { useMemo, useState } from "react";
import { useStore } from "@/data/useStore";
import {
  listPayrollIssues,
  listSchedule,
  listStaffDirectory,
  payrollIssuesStore,
  removeScheduleEntry,
  resolvePayrollIssue,
  scheduleStore,
  setScheduleEntry,
  staffDirectoryStore,
} from "@/data/repo";
import type { StaffRole } from "@/types";

const ROLE_LABELS: Record<StaffRole, string> = { bar: "Бар", hookah: "Кальяны" };

function money(n: number): string {
  return Math.round(n).toLocaleString("ru-RU") + " ₽";
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { weekday: "short", day: "2-digit", month: "2-digit" });
}

/** Форма назначения графика: дата + роль + сотрудник. */
function ScheduleForm() {
  const staff = listStaffDirectory();
  const [date, setDate] = useState(todayIso());
  const [role, setRole] = useState<StaffRole>("hookah");
  const [staffId, setStaffId] = useState(staff[0]?.id ?? "");

  if (!staff.length) {
    return <div className="list-empty">Сначала должны появиться сотрудники с назначенной моделью ЗП.</div>;
  }

  return (
    <div className="card">
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        Назначить смену
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <select value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
          <option value="hookah">Кальяны</option>
          <option value="bar">Бар</option>
        </select>
        <select value={staffId} onChange={(e) => setStaffId(e.target.value)}>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          className="btn primary"
          onClick={() => {
            if (staffId) setScheduleEntry(staffId, role, date);
          }}
        >
          Назначить
        </button>
      </div>
    </div>
  );
}

function ScheduleList() {
  useStore(scheduleStore);
  useStore(staffDirectoryStore);
  const staff = listStaffDirectory();
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s.name])), [staff]);
  // Показываем от сегодня и дальше — прошлое неинтересно строить, оно уже обработано ботом.
  const upcoming = listSchedule().filter((e) => e.date.slice(0, 10) >= todayIso());

  if (!upcoming.length) return <div className="list-empty">На ближайшие дни график пуст</div>;

  return (
    <>
      {upcoming.map((e) => (
        <div key={e.id} className="card card-row">
          <div>
            <div style={{ fontWeight: 700, textTransform: "capitalize" }}>{formatDate(e.date)}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {ROLE_LABELS[e.role]} · {staffById.get(e.staffId) ?? "?"}
            </div>
          </div>
          <button className="btn secondary" style={{ padding: "6px 10px" }} onClick={() => removeScheduleEntry(e.id)}>
            Убрать
          </button>
        </div>
      ))}
    </>
  );
}

/**
 * Расхождения: бот сравнил график со следующим днём Quick Resto и нашёл
 * несовпадение (или график есть, а по Quick Resto никто не работал) — выручка
 * уже посчитана и лежит в issue.revenue, ждёт, кому её начислить.
 */
function PayrollIssues() {
  useStore(payrollIssuesStore);
  useStore(staffDirectoryStore);
  const issues = listPayrollIssues();
  const staff = listStaffDirectory();
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s.name])), [staff]);
  const [picked, setPicked] = useState<Record<string, string>>({});

  if (!issues.length) return null;

  return (
    <>
      <h2>Начисления, требующие проверки</h2>
      {issues.map((issue) => {
        const actualNames = issue.actualStaffIds.map((id) => staffById.get(id) ?? id);
        const chosen = picked[issue.id] ?? issue.actualStaffIds[0] ?? issue.expectedStaffId;
        return (
          <div key={issue.id} className="card">
            <div style={{ fontWeight: 700, textTransform: "capitalize" }}>
              {formatDate(issue.date)} · {ROLE_LABELS[issue.role]}
            </div>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              По графику: {staffById.get(issue.expectedStaffId) ?? "?"}
              <br />
              По Quick Resto реально работал: {actualNames.length ? actualNames.join(", ") : "никто"}
            </div>
            <div className="card-row" style={{ marginTop: 10 }}>
              <span className="muted">Выручка</span>
              <span style={{ fontWeight: 700 }}>{money(issue.revenue)}</span>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <select
                style={{ flex: 1 }}
                value={chosen}
                onChange={(e) => setPicked((p) => ({ ...p, [issue.id]: e.target.value }))}
              >
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button className="btn primary" onClick={() => resolvePayrollIssue(issue.id, chosen)}>
                Начислить вручную
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}

export default function SchedulePayroll() {
  return (
    <div className="screen">
      <h1>График и начисления</h1>
      <p className="muted" style={{ fontSize: 13, marginTop: -8, marginBottom: 16 }}>
        Кто в какой день отвечает за бар/кальяны. На следующий день бот сам сверяет график с Quick Resto и начисляет
        ЗП — сюда попадают только случаи, где что-то не сошлось.
      </p>

      <PayrollIssues />

      <h2>График</h2>
      <ScheduleForm />
      <div style={{ marginTop: 12 }}>
        <ScheduleList />
      </div>
    </div>
  );
}
