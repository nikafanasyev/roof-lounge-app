import { useStore } from "@/data/useStore";
import { listSchedule, scheduleStore } from "@/data/repo";

export default function Schedule() {
  useStore(scheduleStore);
  const entries = listSchedule();
  const today = new Date().toDateString();

  return (
    <div className="screen">
      <h1>График смен</h1>
      {entries.length === 0 && <div className="list-empty">Смены пока не назначены</div>}
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
    </div>
  );
}
