import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useStore } from "@/data/useStore";
import { addTask, getStaffProfile, getStaffProfileById, listActiveStaffDirectory, listTasks, setTaskStatus, staffDirectoryStore, tasksStore } from "@/data/repo";
import type { Task, TaskPriority, TaskStatus } from "@/types";

const PRIORITY_LABEL: Record<TaskPriority, string> = { critical: "Критический", high: "Высокий", medium: "Средний", low: "Низкий" };
const PRIORITY_COLOR: Record<TaskPriority, string> = {
  critical: "var(--danger)",
  high: "var(--warn)",
  medium: "var(--accent)",
  low: "var(--muted)",
};
const PRIORITY_ORDER: Record<TaskPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const STATUS_LABEL: Record<TaskStatus, string> = { created: "Создана", in_progress: "В работе", done: "Выполнена" };

type Filter = "all" | "mine" | "responsible" | "helper";

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} ${one}`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} ${few}`;
  return `${n} ${many}`;
}

/** «Сегодня», «Завтра», «Через 2 дня», «Просрочено на 3 дня». */
function dueLabel(dueDate: string): { text: string; overdue: boolean } {
  const days = Math.round((new Date(dueDate + "T00:00:00").getTime() - startOfDay(new Date())) / 86400000);
  if (days < 0) return { text: `Просрочено на ${plural(-days, "день", "дня", "дней")}`, overdue: true };
  if (days === 0) return { text: "Сегодня", overdue: false };
  if (days === 1) return { text: "Завтра", overdue: false };
  return { text: `Через ${plural(days, "день", "дня", "дней")}`, overdue: false };
}

function sortTasks(a: Task, b: Task): number {
  if (PRIORITY_ORDER[a.priority] !== PRIORITY_ORDER[b.priority]) return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
}

export default function Tasks({ backTo = "/employee/more" }: { backTo?: string }) {
  useStore(tasksStore);
  useStore(staffDirectoryStore);
  const asManager = useLocation().pathname.startsWith("/manager");
  const me = getStaffProfile();
  const staff = listActiveStaffDirectory();
  const allTasks = listTasks();

  // Сотрудник видит только свои задачи (ответственный, помощник или автор), руководитель — все.
  const base = asManager ? allTasks : allTasks.filter((t) => t.assigneeId === me.id || t.helperIds.includes(me.id) || t.createdById === me.id);

  const [filter, setFilter] = useState<Filter>("all");
  const filtered = base.filter((t) => {
    if (filter === "mine") return t.assigneeId === me.id || t.helperIds.includes(me.id);
    if (filter === "responsible") return t.assigneeId === me.id;
    if (filter === "helper") return t.helperIds.includes(me.id);
    return true;
  });
  const open = filtered.filter((t) => t.status !== "done").sort(sortTasks);
  const done = filtered.filter((t) => t.status === "done");

  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [assigneeId, setAssigneeId] = useState(me.id);
  const [helperIds, setHelperIds] = useState<string[]>([]);

  function submit() {
    if (!title.trim()) return;
    addTask({
      title: title.trim(),
      priority,
      dueDate: dueDate || undefined,
      assigneeId: asManager ? assigneeId || undefined : me.id,
      helperIds,
    });
    setTitle("");
    setPriority("medium");
    setDueDate("");
    setAssigneeId(me.id);
    setHelperIds([]);
    setCreating(false);
  }

  function toggleHelper(id: string) {
    setHelperIds((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  }

  function canChange(t: Task): boolean {
    return asManager || t.assigneeId === me.id || t.helperIds.includes(me.id);
  }

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "Все" },
    { key: "mine", label: "Мои" },
    { key: "responsible", label: "Я ответственный" },
    { key: "helper", label: "Я помощник" },
  ];

  function card(t: Task, finished = false) {
    const person = t.assigneeId ? getStaffProfileById(t.assigneeId)?.name : undefined;
    const helpers = t.helperIds.map((id) => getStaffProfileById(id)?.name).filter(Boolean) as string[];
    const due = t.dueDate && !finished ? dueLabel(t.dueDate) : undefined;
    return (
      <div key={t.id} className="card" style={{ opacity: finished ? 0.6 : 1 }}>
        <div style={{ fontWeight: 700, textDecoration: finished ? "line-through" : undefined }}>{t.title}</div>
        <div className="chip-row" style={{ margin: "8px 0 0" }}>
          <span className="chip" style={{ color: PRIORITY_COLOR[t.priority], borderColor: PRIORITY_COLOR[t.priority] }}>
            {PRIORITY_LABEL[t.priority]}
          </span>
          <span className="chip">{STATUS_LABEL[t.status]}</span>
          {due && (
            <span className="chip" style={due.overdue ? { color: "var(--danger)", borderColor: "var(--danger)" } : undefined}>
              {due.text}
            </span>
          )}
        </div>
        {(person || helpers.length > 0) && (
          <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
            {person ? `Ответственный: ${person}` : "Не назначен"}
            {helpers.length > 0 ? ` · Помощники: ${helpers.join(", ")}` : ""}
          </div>
        )}
        {!person && helpers.length === 0 && !finished && (
          <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
            Не назначен
          </div>
        )}
        {canChange(t) && (
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {t.status === "created" && (
              <button className="btn secondary" onClick={() => setTaskStatus(t.id, "in_progress")}>
                Взять в работу
              </button>
            )}
            {t.status !== "done" && (
              <button className="btn" onClick={() => setTaskStatus(t.id, "done")}>
                Выполнено
              </button>
            )}
            {t.status === "done" && (
              <button className="btn secondary" onClick={() => setTaskStatus(t.id, "in_progress")}>
                Вернуть в работу
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="screen">
      <Link to={backTo} className="muted" style={{ textDecoration: "none", fontSize: 14 }}>
        ← {asManager ? "Сводка" : "Ещё"}
      </Link>
      <h1>Задачи</h1>

      {!creating ? (
        <button className="btn primary" style={{ marginBottom: 12 }} onClick={() => setCreating(true)}>
          + Новая задача
        </button>
      ) : (
        <div className="card">
          <div className="eyebrow">Новая задача</div>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: заменить лампу" style={{ marginBottom: 8 }} />

          <div className="eyebrow">Приоритет</div>
          <div className="chip-row" style={{ marginBottom: 8 }}>
            {(Object.keys(PRIORITY_LABEL) as TaskPriority[]).map((p) => (
              <button
                key={p}
                type="button"
                className="chip"
                onClick={() => setPriority(p)}
                style={priority === p ? { color: PRIORITY_COLOR[p], borderColor: PRIORITY_COLOR[p], fontWeight: 700 } : { cursor: "pointer" }}
              >
                {PRIORITY_LABEL[p]}
              </button>
            ))}
          </div>

          <div className="eyebrow">Срок</div>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ marginBottom: 8 }} />

          {asManager && (
            <>
              <div className="eyebrow">Ответственный</div>
              <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} style={{ marginBottom: 8, width: "100%" }}>
                <option value="">Не назначен</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </>
          )}

          <div className="eyebrow">Помощники</div>
          <div className="chip-row" style={{ marginBottom: 12 }}>
            {staff
              .filter((s) => s.id !== (asManager ? assigneeId : me.id))
              .map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`chip ${helperIds.includes(s.id) ? "accent" : ""}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => toggleHelper(s.id)}
                >
                  {s.name}
                </button>
              ))}
          </div>

          <div className="btn-row">
            <button className="btn primary" onClick={submit} disabled={!title.trim()}>
              Создать
            </button>
            <button className="btn secondary" onClick={() => setCreating(false)}>
              Отмена
            </button>
          </div>
          {!asManager && <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Задача назначается вам; назначать другим может руководитель.</div>}
        </div>
      )}

      <div className="kb-contents">
        {filters.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={filter === f.key ? { borderColor: "var(--accent)", color: "var(--accent)", fontWeight: 700 } : undefined}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="eyebrow">Открытые · {open.length}</div>
      {open.length === 0 && <div className="list-empty">Открытых задач нет</div>}
      {open.map((t) => card(t))}

      {done.length > 0 && (
        <>
          <div className="eyebrow" style={{ marginTop: 16 }}>
            Выполнено · {done.length}
          </div>
          {done.map((t) => card(t, true))}
        </>
      )}
    </div>
  );
}
