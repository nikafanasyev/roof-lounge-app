import { useStore } from "@/data/useStore";
import {
  averageReactionMinutes,
  daysOpen,
  problemsStore,
  serviceCallsStore,
  shiftStore,
  tasksStore,
} from "@/data/repo";

export default function Summary() {
  const calls = useStore(serviceCallsStore);
  const problems = useStore(problemsStore);
  const tasks = useStore(tasksStore);
  const shift = useStore(shiftStore);

  const openCalls = calls.filter((c) => c.status === "open");
  const openProblems = problems.filter((p) => p.status !== "done");
  const overdueProblems = openProblems.filter((p) => daysOpen(p.createdAt) >= 3);
  const openTasks = tasks.filter((t) => !t.done);
  const avgReaction = averageReactionMinutes();

  const alerts: string[] = [];
  if (shift.status === "closed" && !shift.closedAt) alerts.push("Чек-лист смены сегодня ещё не открывали");
  overdueProblems.forEach((p) => alerts.push(`Проблема не решается ${daysOpen(p.createdAt)} дн.: «${p.description}»`));
  if (openCalls.some((c) => Date.now() - new Date(c.createdAt).getTime() > 10 * 60000)) {
    alerts.push("Есть вызов гостя без реакции больше 10 минут");
  }

  return (
    <div className="screen">
      <h1>Сводка</h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div className="card">
          <div className="eyebrow">Открытые вызовы</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{openCalls.length}</div>
        </div>
        <div className="card">
          <div className="eyebrow">Ср. время реакции</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{avgReaction !== null ? `${avgReaction} мин` : "—"}</div>
        </div>
        <div className="card">
          <div className="eyebrow">Открытые проблемы</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{openProblems.length}</div>
        </div>
        <div className="card">
          <div className="eyebrow">Задачи в работе</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{openTasks.length}</div>
        </div>
      </div>

      <div className="card">
        <div className="eyebrow">Статус смены</div>
        <div>
          <span className={`badge-dot ${shift.status === "open" ? "done" : "open"}`} />
          {shift.status === "open" ? `Открыта${shift.openedBy ? ` · ${shift.openedBy}` : ""}` : "Закрыта"}
        </div>
      </div>

      <h2>Автоматические предупреждения</h2>
      {alerts.length === 0 && <div className="card muted">Всё под контролем — ничего не требует внимания</div>}
      {alerts.map((a, i) => (
        <div key={i} className="card" style={{ borderColor: "var(--warn)" }}>
          ⚠️ {a}
        </div>
      ))}
    </div>
  );
}
