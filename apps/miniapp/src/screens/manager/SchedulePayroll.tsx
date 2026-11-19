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
const RECALC_STATUS_LABEL: Record<string, string> = {
  pending: "Считаю…",
  done: "Готово",
  failed: "Не получилось",
};

/** Кнопка "Начислить ЗП за этот день" — пишет запрос через Supabase, бот сам
 * его подхватывает и выполняет (см. requestPayrollRecalc в data/repo.ts) —
 * без ручных правок в базе и без команды /accrue в Telegram. См. запрос
 * Никиты 14.10.2026: "чтобы руками не лезть в базу данных". */
function RecalcButton({ dateIso }: { dateIso: string }) {
  useStore(payrollRecalcRequestsStore);
  const request = latestPayrollRecalcRequestForDate(dateIso);
  const pending = request?.status === "pending";

  return (
    <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
      <button className="btn secondary" style={{ width: "100%" }} disabled={pending} onClick={() => requestPayrollRecalc(dateIso)}>
        {pending ? "Считаю…" : "Начислить ЗП за этот день"}
      </button>
      {request && (
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          {RECALC_STATUS_LABEL[request.status] ?? request.status}
          {request.result ? `: ${request.result}` : ""}
        </div>
      )}
    </div>
  );
}

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

/** График неделей: каждый день — карточка со всеми ролями и людьми, без провала в день. */
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

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const todayKey = todayIso();
  const shift = (n: number) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + n * 7);
    setWeekStart(d);
  };
  const fmt = (d: Date) => d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });

  if (!activeStaff.length) {
    return <div className="list-empty">Сначала кто-то из сотрудников должен хотя бы раз войти в мини-апп или на терминал Quick Resto.</div>;
  }

  return (
    <>
      <div className="card-row" style={{ marginBottom: 10 }}>
        <button className="btn secondary" style={{ padding: "6px 12px", width: "auto" }} onClick={() => shift(-1)}>
          ←
        </button>
        <button className="muted" style={{ background: "none", border: "none", font: "inherit", fontWeight: 700, color: "var(--ink)", cursor: "pointer" }} onClick={() => setWeekStart(startOfWeek(new Date()))}>
          {fmt(days[0])} – {fmt(days[6])}
        </button>
        <button className="btn secondary" style={{ padding: "6px 12px", width: "auto" }} onClick={() => shift(1)}>
          →
        </button>
      </div>

      {days.map((d) => {
        const key = dateKey(d);
        const dayEntries = byDate.get(key) ?? {};
        const isToday = key === todayKey;
        const isPast = key < todayKey;
        return (
          <div key={key} className="card" style={{ borderColor: isToday ? "var(--accent)" : undefined, paddingBottom: 6 }}>
            <div className="card-row" style={{ marginBottom: 4 }}>
              <span style={{ fontWeight: 700, textTransform: "capitalize" }}>
                {d.toLocaleDateString("ru-RU", { weekday: "short" })} {fmt(d)}
                {isToday && <span className="chip accent" style={{ marginLeft: 8, fontSize: 11 }}>сегодня</span>}
              </span>
            </div>
            {ROLES.map((role) => (
              <RoleRow key={role} role={role} dateIso={key} entry={dayEntries[role]} staff={activeStaff} staffById={staffById} needed={roleNeeded(role, d.getDay())} />
            ))}
            {isPast && <RecalcButton dateIso={key} />}
          </div>
        );
      })}
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
