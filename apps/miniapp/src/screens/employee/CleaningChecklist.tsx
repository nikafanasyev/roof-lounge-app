import {
  CLEANING_ROLE_WEEKS,
  cleaningRotationWeek,
  cleaningLogStore,
  getTodayCleaningTasksForRole,
  isCleaningTaskDone,
  setCleaningTaskDone,
} from "@/data/repo";
import { useStore } from "@/data/useStore";

function formatDoneAt(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Интерактивный чек-лист генеральной уборки для одной роли (Бар / Кухня /
 * Уборщица / Кальянный мастер) — заменяет статичный текст статьи "Генеральная
 * уборка" (k12). Пункты на сегодня — с чекбоксом, отметка сохраняется в
 * cleaning_log (кто и когда, см. data/repo.ts). Ниже — весь 4-недельный
 * график для справки (на какие дни что выпадает).
 */
export default function CleaningChecklist({ role }: { role: string }) {
  useStore(cleaningLogStore);
  const weeks = CLEANING_ROLE_WEEKS[role] ?? [];
  const { label: weekLabel } = cleaningRotationWeek();
  const today = getTodayCleaningTasksForRole(role);

  return (
    <div>
      <div className="eyebrow">
        {weekLabel} ·{" "}
        {new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "2-digit", month: "long" })}
      </div>

      {today.length === 0 && <div className="card muted">На сегодня по этой роли пунктов нет</div>}
      {today.map((t, idx) => {
        const doneAt = isCleaningTaskDone(role, t.task);
        return (
          <label key={idx} className="card card-row" style={{ cursor: "pointer" }}>
            <div>
              <div style={{ textDecoration: doneAt ? "line-through" : undefined }}>{t.task}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {doneAt ? `выполнено в ${formatDoneAt(doneAt)}` : t.note}
              </div>
            </div>
            <input
              type="checkbox"
              checked={Boolean(doneAt)}
              onChange={(e) => setCleaningTaskDone(role, t.task, e.target.checked)}
            />
          </label>
        );
      })}

      <div className="eyebrow" style={{ marginTop: 20 }}>
        Весь график — {role}
      </div>
      {weeks.map((w) => (
        <div key={w.week} className="card" style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>{w.week}</div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {w.tasks.map(([day, task], i) => (
              <li key={i} style={{ display: "flex", gap: 8, padding: "3px 0", fontSize: 14, lineHeight: 1.4 }}>
                <span className="muted" style={{ flexShrink: 0 }}>
                  {day}:
                </span>
                <span>{task}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
