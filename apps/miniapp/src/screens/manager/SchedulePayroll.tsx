import { useMemo, useState } from "react";
import { useStore } from "@/data/useStore";
import {
  latestPayrollRecalcRequestForDate,
  listActiveStaffDirectory,
  listPayrollIssues,
  listSchedule,
  listStaffDirectory,
  payrollIssuesStore,
  payrollRecalcRequestsStore,
  removeScheduleEntry,
  requestPayrollRecalc,
  resolvePayrollIssue,
  scheduleStore,
  setScheduleEntry,
  staffDirectoryStore,
  businessDateIso,
} from "@/data/repo";
import { ROLE_LABELS, WORK_ROLES, ROLE_COLORS, POSITION_SUGGESTIONS } from "@/lib/roles";
import type { ScheduleEntry, StaffProfile, WorkRole } from "@/types";

// Порядок показа роли в дне — кальяны первой, это основная зона заведения.
const ROLES: WorkRole[] = WORK_ROLES;

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

type DayEntries = Partial<Record<WorkRole, ScheduleEntry>>;

/**
 * Назначение на один день: по роли — либо уже назначенный сотрудник (с
 * возможностью заменить/убрать), либо выбор из справочника. Компонент
 * заново монтируется при смене выбранного дня (key={dateIso} у родителя),
 * поэтому локальный выбор в select'ах всегда стартует от актуальных данных
 * этого дня, без лишнего useEffect.
 */

function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // понедельник
  return x;
}

function shortName(full: string): string {
  const [first, last] = full.split(" ");
  return last ? `${first} ${last[0]}.` : first;
}

/** Официант нужен только чт–сб — в остальные дни пустая строка не подсвечивается как пробел. */
function roleNeeded(role: WorkRole, dow: number): boolean {
  return role !== "waiter" || dow === 4 || dow === 5 || dow === 6;
}

/** Строка роли в карточке дня: имя и время; нажатие открывает выбор сотрудника, выбор сохраняется сразу. */
function RoleRow({ role, dateIso, entry, staff, staffById, needed }: { role: WorkRole; dateIso: string; entry?: ScheduleEntry; staff: StaffProfile[]; staffById: Map<string, string>; needed: boolean }) {
  const [open, setOpen] = useState(false);
  const name = entry ? staffById.get(entry.staffId) ?? "сотрудник не найден" : undefined;
  const ofRole = staff.filter((s) => s.role === role);
  const others = staff.filter((s) => s.role !== role);

  function pick(id: string) {
    setScheduleEntry(id, role, dateIso);
    setOpen(false);
  }

  return (
    <div style={{ borderTop: "1px solid var(--border)" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", width: "100%", alignItems: "center", gap: 8, padding: "9px 0", background: "none", border: "none", color: "inherit", font: "inherit", cursor: "pointer", textAlign: "left", opacity: !entry && !needed ? 0.45 : 1 }}
      >
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: ROLE_COLORS[role], flex: "none" }} />
        <span className="muted" style={{ width: 82, flex: "none", fontSize: 14 }}>
          {ROLE_LABELS[role]}
        </span>
        <span style={{ flex: 1, fontWeight: entry ? 600 : 400, color: !entry && needed ? "var(--danger, #e5484d)" : undefined }}>
          {name ? shortName(name) : needed ? "никого" : "—"}
        </span>
        {entry && (
          <span className="muted" style={{ fontSize: 12 }}>
            {entry.startTime}–{entry.endTime}
          </span>
        )}
      </button>
      {open && (
        <div style={{ paddingBottom: 10 }}>
          <div className="chip-row" style={{ flexWrap: "wrap" }}>
            {[...ofRole, ...others].map((st, i) => (
              <button
                key={st.id}
                className={`chip ${entry?.staffId === st.id ? "accent" : ""}`}
                style={{ cursor: "pointer", opacity: i >= ofRole.length ? 0.7 : 1 }}
                onClick={() => pick(st.id)}
              >
                {st.name}
              </button>
            ))}
          </div>
          {entry && (
            <button className="btn secondary" style={{ marginTop: 8, padding: "6px 10px", width: "auto" }} onClick={() => { removeScheduleEntry(entry.id); setOpen(false); }}>
              Убрать
            </button>
          )}
        </div>
      )}
    </div>
  );
}

type ScheduleView = "day" | "week" | "month";
const VIEW_KEY = "schedule-view";
function readView(): ScheduleView {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === "day" || v === "month" ? v : "week";
  } catch {
    return "week";
  }
}

/** Сегодняшний бизнес-день (до начала нового дня ночная смена — ещё вчера) как дата на полдень. */
function businessToday(): Date {
  const [y, m, d] = businessDateIso().split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

/** Карточка одного дня: все роли с людьми, нажатие на роль — замена. */
function DayCard({ date, dayEntries, staff, staffById, todayKey }: { date: Date; dayEntries: DayEntries; staff: StaffProfile[]; staffById: Map<string, string>; todayKey: string }) {
  const key = dateKey(date);
  const isToday = key === todayKey;
  const fmt = date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  return (
    <div className="card" style={{ borderColor: isToday ? "var(--accent)" : undefined, paddingBottom: 6 }}>
      <div className="card-row" style={{ marginBottom: 4 }}>
        <span style={{ fontWeight: 700, textTransform: "capitalize" }}>
          {date.toLocaleDateString("ru-RU", { weekday: "short" })} {fmt}
          {isToday && <span className="chip accent" style={{ marginLeft: 8, fontSize: 11 }}>сегодня</span>}
        </span>
        {key < todayKey && <RecalcLink dateIso={key} />}
      </div>
      {ROLES.map((role) => (
        <RoleRow key={role} role={role} dateIso={key} entry={dayEntries[role]} staff={staff} staffById={staffById} needed={roleNeeded(role, date.getDay())} />
      ))}
    </div>
  );
}

/** Компактное «Начислить ЗП» в шапке прошедшего дня. */
function RecalcLink({ dateIso }: { dateIso: string }) {
  useStore(payrollRecalcRequestsStore);
  const request = latestPayrollRecalcRequestForDate(dateIso);
  const pending = request?.status === "pending";
  const label = pending ? "считаю…" : request?.status === "done" ? "ЗП ✓" : request?.status === "failed" ? "ЗП: ошибка" : "начислить ЗП";
  return (
    <button
      className="muted"
      title={request?.result ?? undefined}
      disabled={pending}
      onClick={() => requestPayrollRecalc(dateIso)}
      style={{ background: "none", border: "none", padding: 0, font: "inherit", fontSize: 12, textDecoration: "underline", cursor: "pointer" }}
    >
      {label}
    </button>
  );
}

/** График: переключатель День / Неделя / Месяц. */
function ScheduleWeek() {
  const entries = useStore(scheduleStore);
  useStore(staffDirectoryStore);
  const staff = listStaffDirectory();
  const activeStaff = listActiveStaffDirectory();
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s.name])), [staff]);

  const byDate = useMemo(() => {
    const map = new Map<string, DayEntries>();
    for (const e of entries) {
      const key = e.date.slice(0, 10);
      map.set(key, { ...map.get(key), [e.role]: e });
    }
    return map;
  }, [entries]);

  const [view, setViewState] = useState<ScheduleView>(readView);
  const [anchor, setAnchor] = useState(businessToday);
  const todayKey = businessDateIso();

  // В клетке месяца — имя; если имена совпадают, добавляем первую букву фамилии.
  const monthName = useMemo(() => {
    const firstCount = new Map<string, number>();
    for (const st of staff) {
      const f = st.name.split(" ")[0];
      firstCount.set(f, (firstCount.get(f) ?? 0) + 1);
    }
    return (id: string) => {
      const full = staffById.get(id) ?? "?";
      const [f, l] = full.split(" ");
      return (firstCount.get(f) ?? 0) > 1 && l ? `${f} ${l[0]}.` : f;
    };
  }, [staff, staffById]);

  function setView(v: ScheduleView, keepAnchor = false) {
    setViewState(v);
    // Переключение вкладки — к текущему бизнес-дню; из клетки месяца — к выбранному дню.
    if (!keepAnchor) setAnchor(businessToday());
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* без хранилища просто не запоминаем */
    }
  }
  function move(n: number) {
    const d = new Date(anchor);
    if (view === "day") d.setDate(d.getDate() + n);
    else if (view === "week") d.setDate(d.getDate() + n * 7);
    else d.setMonth(d.getMonth() + n, 1);
    setAnchor(d);
  }
  function goToday() {
    setAnchor(businessToday());
  }

  if (!activeStaff.length) {
    return <div className="list-empty">Сначала кто-то из сотрудников должен хотя бы раз войти в мини-апп или на терминал Quick Resto.</div>;
  }

  const fmt = (d: Date) => d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  const weekStart = startOfWeek(anchor);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const title =
    view === "day"
      ? anchor.toLocaleDateString("ru-RU", { weekday: "short", day: "2-digit", month: "long" })
      : view === "week"
        ? `${fmt(weekDays[0])} – ${fmt(weekDays[6])}`
        : anchor.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });

  // Месяц: сетка с понедельника, в клетке — инициалы людей цветом роли.
  const monthCells: (Date | null)[] = [];
  if (view === "month") {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
    for (let i = 0; i < (first.getDay() + 6) % 7; i++) monthCells.push(null);
    const days = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= days; d++) monthCells.push(new Date(anchor.getFullYear(), anchor.getMonth(), d, 12));
    while (monthCells.length % 7) monthCells.push(null);
  }

  return (
    <>
      <div className="seg-toggle" role="tablist" style={{ marginBottom: 10 }}>
        {(["day", "week", "month"] as ScheduleView[]).map((v) => (
          <button key={v} className={view === v ? "active" : ""} onClick={() => setView(v)}>
            {v === "day" ? "День" : v === "week" ? "Неделя" : "Месяц"}
          </button>
        ))}
      </div>

      <div className="card-row" style={{ marginBottom: 10 }}>
        <button className="btn secondary" style={{ padding: "6px 12px", width: "auto" }} onClick={() => move(-1)}>
          ←
        </button>
        <button onClick={goToday} style={{ background: "none", border: "none", font: "inherit", fontWeight: 700, color: "var(--ink)", cursor: "pointer", textTransform: "capitalize" }}>
          {title}
        </button>
        <button className="btn secondary" style={{ padding: "6px 12px", width: "auto" }} onClick={() => move(1)}>
          →
        </button>
      </div>

      {view === "day" && <DayCard date={anchor} dayEntries={byDate.get(dateKey(anchor)) ?? {}} staff={activeStaff} staffById={staffById} todayKey={todayKey} />}

      {view === "week" &&
        weekDays.map((d) => <DayCard key={dateKey(d)} date={d} dayEntries={byDate.get(dateKey(d)) ?? {}} staff={activeStaff} staffById={staffById} todayKey={todayKey} />)}

      {view === "month" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, marginBottom: 4 }}>
            {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => (
              <div key={d} className="muted" style={{ textAlign: "center", fontSize: 11 }}>
                {d}
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, marginBottom: 10 }}>
            {monthCells.map((d, i) => {
              if (!d) return <div key={i} />;
              const key = dateKey(d);
              const day = byDate.get(key) ?? {};
              const missing = ROLES.some((r) => !day[r] && roleNeeded(r, d.getDay()));
              return (
                <button
                  key={i}
                  onClick={() => {
                    setAnchor(d);
                    setView("day", true);
                  }}
                  style={{
                    background: "var(--surface)",
                    border: `1px solid ${key === todayKey ? "var(--accent)" : "var(--border)"}`,
                    borderRadius: 8,
                    padding: "4px 2px",
                    minHeight: 92,
                    color: "inherit",
                    font: "inherit",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 1,
                    minWidth: 0,
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: key === todayKey ? 700 : 400, color: missing && key >= todayKey ? "var(--danger, #e5484d)" : undefined }}>{d.getDate()}</span>
                  {ROLES.map((r) =>
                    day[r] ? (
                      <span
                        key={r}
                        style={{ fontSize: 9.5, lineHeight: "13px", fontWeight: 600, color: ROLE_COLORS[r], maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      >
                        {monthName(day[r]!.staffId)}
                      </span>
                    ) : null,
                  )}
                </button>
              );
            })}
          </div>
          <div className="chip-row" style={{ marginBottom: 12, flexWrap: "wrap" }}>
            {ROLES.map((r) => (
              <span key={r} className="chip">
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: ROLE_COLORS[r], display: "inline-block", marginRight: 4 }} />
                {ROLE_LABELS[r]}
              </span>
            ))}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            Имена цветом роли. Красное число — в будущем дне не хватает людей. Нажмите на день, чтобы изменить.
          </div>
        </>
      )}
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
  const activeStaff = listActiveStaffDirectory();
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
                {activeStaff.map((s) => (
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
      <ScheduleWeek />
    </div>
  );
}
