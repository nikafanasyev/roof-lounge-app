import { useMemo, useState } from "react";
import { useStore } from "@/data/useStore";
import { listSchedule, scheduleStore } from "@/data/repo";
import type { ScheduleEntry } from "@/types";

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildMonthGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  // Понедельник = 0 ... воскресенье = 6
  const firstWeekday = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array(firstWeekday).fill(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(new Date(year, month, day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function ListView({ entries }: { entries: ScheduleEntry[] }) {
  const today = new Date().toDateString();
  if (entries.length === 0) return <div className="list-empty">Смены пока не назначены</div>;
  return (
    <>
      {entries.map((e) => {
        const date = new Date(e.date);
        const isPast = date.getTime() < Date.now() && date.toDateString() !== today;
        return (
          <div key={e.id} className="card card-row" style={{ opacity: isPast ? 0.5 : 1 }}>
            <div>
              <div style={{ fontWeight: 700 }}>
                {date.toLocaleDateString("ru-RU", { weekday: "short", day: "2-digit", month: "short" })}
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                {e.startTime}–{e.endTime}
              </div>
            </div>
            <span className="chip">{e.roleLabel}</span>
          </div>
        );
      })}
    </>
  );
}

function CalendarView({ entries }: { entries: ScheduleEntry[] }) {
  const [cursor, setCursor] = useState(() => new Date());
  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const byDate = useMemo(() => {
    const map = new Map<string, ScheduleEntry>();
    for (const e of entries) map.set(dateKey(new Date(e.date)), e);
    return map;
  }, [entries]);

  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const todayKey = dateKey(new Date());

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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {cells.map((date, i) => {
          if (!date) return <div key={i} />;
          const key = dateKey(date);
          const entry = byDate.get(key);
          const isToday = key === todayKey;
          return (
            <div
              key={i}
              className="card"
              style={{
                padding: "6px 4px",
                textAlign: "center",
                margin: 0,
                background: entry ? "var(--surface-2)" : "var(--surface)",
                borderColor: isToday ? "var(--accent)" : "var(--border)",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: isToday ? 700 : 400 }}>{date.getDate()}</div>
              {entry && (
                <div className="badge-dot done" style={{ margin: "4px auto 0" }} />
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

export default function Schedule() {
  useStore(scheduleStore);
  const entries = listSchedule();
  const [view, setView] = useState<"list" | "calendar">("calendar");

  return (
    <div className="screen">
      <h1>График смен</h1>

      <div className="tabs">
        <button className={`tab-btn ${view === "calendar" ? "active" : ""}`} onClick={() => setView("calendar")}>
          Календарь
        </button>
        <button className={`tab-btn ${view === "list" ? "active" : ""}`} onClick={() => setView("list")}>
          Список
        </button>
      </div>

      {view === "calendar" ? <CalendarView entries={entries} /> : <ListView entries={entries} />}
    </div>
  );
}
