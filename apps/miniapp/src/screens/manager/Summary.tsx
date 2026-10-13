import { Link } from "react-router-dom";
import { useStore } from "@/data/useStore";
import { averageReactionMinutes, problemsStore, serviceCallsStore, shiftStore, tasksStore } from "@/data/repo";

// Блок "Автоматические предупреждения" раньше дублировал то, что уже видно
// в плитках выше (открытые вызовы/проблемы) — на "Сводке" это лишняя,
// отвлекающая информация при каждой загрузке экрана (см. обсуждение с
// Никитой 14.10.2026). Сами же предупреждения (чек-лист не открыт,
// просроченные проблемы, вызов без реакции) по смыслу ближе к разделам
// "Проблемы"/"Вызовы" — здесь не убираем логику целиком, просто не рисуем
// список на "Сводке".
export default function Summary() {
  const calls = useStore(serviceCallsStore);
  const problems = useStore(problemsStore);
  const tasks = useStore(tasksStore);
  const shift = useStore(shiftStore);

  const openCalls = calls.filter((c) => c.status === "open");
  const openProblems = problems.filter((p) => p.status !== "done");
  const openTasks = tasks.filter((t) => !t.done);
  const avgReaction = averageReactionMinutes();

  return (
    <div className="screen">
      <h1>Сводка</h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Link to="/manager/calls" className="card" style={{ display: "block" }}>
          <div className="eyebrow">Открытые вызовы</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{openCalls.length}</div>
        </Link>
        <div className="card">
          <div className="eyebrow">Ср. время реакции</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{avgReaction !== null ? `${avgReaction} мин` : "—"}</div>
        </div>
        <Link to="/manager/problems" className="card" style={{ display: "block" }}>
          <div className="eyebrow">Открытые проблемы</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{openProblems.length}</div>
        </Link>
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
    </div>
  );
}
