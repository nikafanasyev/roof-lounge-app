import { CLEANING_ROLE_WEEKS, cleaningRotationWeek, getTodayCleaningTasksForRole } from "@/data/repo";

/**
 * Тех. задачи роли (Бар / Кухня / Уборщица / Кальянный мастер): что делать
 * сегодня и весь 4-недельный график. Для сотрудника — только чтение, без
 * чекбоксов и статуса: отметки о выполнении ставит руководство.
 */
export default function CleaningChecklist({ role }: { role: string }) {
  const weeks = CLEANING_ROLE_WEEKS[role] ?? [];
  const { label: weekLabel } = cleaningRotationWeek();
  const today = getTodayCleaningTasksForRole(role);

  return (
    <div>
      <div className="eyebrow">
        {weekLabel} · {new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "2-digit", month: "long" })}
      </div>

      {today.length === 0 && <div className="card muted">На сегодня по этой роли пунктов нет</div>}
      {today.map((t, idx) => (
        <div key={idx} className="card">
          <div>{t.task}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {t.note}
          </div>
        </div>
      ))}

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
