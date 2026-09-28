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
import type { ScheduleEntry, StaffProfile, StaffRole } from "@/types";

const ROLE_LABELS: Record<StaffRole, string> = { bar: "Бар", hookah: "Кальяны" };
// Порядок показа роли в дне — кальяны первой, это основная зона заведения.
const ROLES: StaffRole[] = ["hookah", "bar"];

function money(n: number): string {
  return Math.round(n).toLocaleString("ru-RU") + " ₽";
}

function todayIso(): string {
  return dateKey(new Date());
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { weekday: "short", day: "2-digit", month: "2-digit" });
}

function formatDateLong(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("ru-RU", { weekday: "long", day: "2-digit", month: "long" });
}

function buildMonthGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  // Понедельник = 0 ... воскресенье = 6
  const firstWeekday = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array(firstWeekday).fill(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

type DayEntries = Partial<Record<StaffRole, ScheduleEntry>>;

/**
 * Назначение на один день: по роли — либо уже назначенный сотрудник (с
 * возможностью заменить/убрать), либо выбор из справочника. Компонент
 * заново монтируется при смене выбранного дня (key={dateIso} у родителя),
 * поэтому локальный выбор в select'ах всегда стартует от актуальных данных
 * этого дня, без лишнего useEffect.
 */
function DayPanel({ dateIso, staff, staffById, dayEntries }: { dateIso: string; staff: StaffProfile[]; staffById: Map<string, string>; dayEntries: DayEntries }) {
  const [picks, setPicks] = useState<Record<StaffRole, string>>({
    bar: dayEntries.bar?.staffId ?? staff[0]?.id ?? "",
    hookah: dayEntries.hookah?.staffId ?? staff[0]?.id ?? "",
  });

  if (!staff.length) {
    return <div className="list-empty">Сначала кто-то из сотрудников должен хотя бы раз войти в мини-апп или на терминал Quick Resto.</div>;
  }

  return (
    <div className="card">
      <div className="eyebrow" style={{ marginBottom: 10, textTransform: "capitalize" }}>
        {formatDateLong(dateIso)}
      </div>
      {ROLES.map((role) => {
        const entry = dayEntries[role];
        return (
          <div key={role} style={{ marginBottom: role === ROLES[ROLES.length - 1] ? 0 : 16 }}>
            <div className="card-row" style={{ marginBottom: 6 }}>
              <span style={{ fontWeight: 700 }}>{ROLE_LABELS[role]}</span>
              {entry ? (
                <span className="chip accent">{staffById.get(entry.staffId) ?? "сотрудник не найден"}</span>
              ) : (
                <span className="chip">не назначено</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <select style={{ flex: 1 }} value={picks[role]} onChange={(e) => setPicks((p) => ({ ...p, [role]: e.target.value }))}>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button
                className="btn primary"
                style={{ width: "auto", padding: "11px 16px" }}
                onClick={() => setScheduleEntry(picks[role], role, dateIso)}
              >
                {entry ? "Заменить" : "Назначить"}
              </button>
            </div>
            {entry && (
              <button className="btn secondary" style={{ marginTop: 8, padding: "6px 10px" }} onClick={() => removeScheduleEntry(entry.id)}>
                Убрать
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Календарь месяца — точки под числом показывают, что на этот день кто-то назначен (по ролям), клик открывает день ниже. */
function ScheduleCalendar() {
  const entries = useStore(scheduleStore);
  useStore(staffDirectoryStore);
  const staff = listStaffDirectory();
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s.name])), [staff]);

  const byDate = useMemo(() => {
    const map = new Map<string, DayEntries>();
    for (const e of entries) {
      const key = e.date.slice(0, 10);
      map.set(key, { ...map.get(key), [e.role]: e });
    }
    return map;
  }, [entries]);

  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(todayIso);
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const todayKey = todayIso();

  return (
    <>
      <div className="card-row" style={{ marginBottom: 10 }}>
        <button className="btn secondary" style={{ padding: "6px 12px" }} onClick={() => setCursor(new Date(year, month - 1, 1))}>
          ←
        </button>
        <div style={{ fontWeight: 700, textTransform: "capitalize" }}>
          {cursor.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}
        </div>
        <button className="btn secondary" style={{ padding: "6px 12px" }} onClick={() => setCursor(new Date(year, month + 1, 1))}>
          →
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 6 }}>
        {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => (
          <div key={d} className="muted" style={{ textAlign: "center", fontSize: 11 }}>
            {d}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 12 }}>
        {cells.map((date, i) => {
          if (!date) return <div key={i} />;
          const key = dateKey(date);
          const dayEntries = byDate.get(key);
          const isToday = key === todayKey;
          const isSelected = key === selected;
          return (
            <button
              key={i}
              onClick={() => setSelected(key)}
              className="card"
              style={{
                padding: "6px 4px",
                textAlign: "center",
                margin: 0,
                cursor: "pointer",
                fontFamily: "inherit",
                background: isSelected ? "var(--accent)" : "var(--surface)",
                borderColor: isSelected ? "var(--accent)" : isToday ? "var(--accent)" : "var(--border)",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: isToday ? 700 : 400, color: isSelected ? "var(--accent-ink)" : "var(--ink)" }}>
                {date.getDate()}
              </div>
              <div style={{ display: "flex", gap: 2, justifyContent: "center", marginTop: 4, height: 6 }}>
                {dayEntries?.hookah && (
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: isSelected ? "var(--accent-ink)" : "var(--accent)" }} />
                )}
                {dayEntries?.bar && (
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: isSelected ? "var(--accent-ink)" : "var(--good)" }} />
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="chip-row" style={{ marginBottom: 12 }}>
        <span className="chip">
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", display: "inline-block", marginRight: 4 }} />
          Кальяны
        </span>
        <span className="chip">
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--good)", display: "inline-block", marginRight: 4 }} />
          Бар
        </span>
      </div>

      <DayPanel key={selected} dateIso={selected} staff={staff} staffById={staffById} dayEntries={byDate.get(selected) ?? {}} />
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
      <ScheduleCalendar />
    </div>
  );
}
