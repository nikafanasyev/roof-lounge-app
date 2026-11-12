import { useEffect, useState } from "react";
import { useStore } from "@/data/useStore";
import { TECH_ROLES, getTechTasksForRoleOnDate, loadTechLog, localDateIso, setTechTaskDone, techLogStore, techTaskMark } from "@/data/repo";

function shiftDay(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return localDateIso(new Date(y, m - 1, d + delta, 12));
}

export default function TechTasks() {
  useStore(techLogStore);
  const [date, setDate] = useState(localDateIso());
  useEffect(() => {
    loadTechLog(date);
  }, [date]);

  const [y, m, d] = date.split("-").map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString("ru-RU", { weekday: "long", day: "2-digit", month: "long" });

  return (
    <div className="screen">
      <h1>Тех. задачи</h1>
      <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
        Задачи на день по графику. Отметки ставит руководство — сотрудники статус не видят.
      </div>

      <div className="card-row" style={{ marginBottom: 10 }}>
        <button type="button" className="btn secondary" onClick={() => setDate(shiftDay(date, -1))}>
          ←
        </button>
        <div style={{ textTransform: "capitalize", fontWeight: 700 }}>{label}</div>
        <button type="button" className="btn secondary" onClick={() => setDate(shiftDay(date, 1))}>
          →
        </button>
      </div>

      {TECH_ROLES.map((r) => {
        const tasks = getTechTasksForRoleOnDate(r.key, date);
        const done = tasks.filter((t) => techTaskMark(date, r.key, t.task)).length;
        return (
          <div key={r.key} style={{ marginBottom: 14 }}>
            <div className="card-row" style={{ marginBottom: 6 }}>
              <h2 style={{ margin: 0 }}>{r.label}</h2>
              {tasks.length > 0 && (
                <span className="muted">
                  {done} из {tasks.length}
                </span>
              )}
            </div>
            {tasks.length === 0 && <div className="card muted">Задач на этот день нет</div>}
            {tasks.map((t, i) => {
              const mark = techTaskMark(date, r.key, t.task);
              return (
                <label key={i} className="card card-row" style={{ cursor: "pointer" }}>
                  <div>
                    <div style={{ textDecoration: mark ? "line-through" : undefined }}>{t.task}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {mark ? `выполнено · ${new Date(mark).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}` : t.note}
                    </div>
                  </div>
                  <input type="checkbox" checked={Boolean(mark)} onChange={(e) => setTechTaskDone(date, r.key, t.task, e.target.checked)} />
                </label>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
