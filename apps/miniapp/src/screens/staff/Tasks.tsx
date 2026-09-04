import { useState } from "react";
import { useStore } from "@/data/useStore";
import { addTask, listTasks, tasksStore, toggleTask } from "@/data/repo";

export default function Tasks() {
  useStore(tasksStore);
  const tasks = listTasks();
  const [title, setTitle] = useState("");

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  function submit() {
    if (!title.trim()) return;
    addTask(title.trim());
    setTitle("");
  }

  return (
    <div className="screen">
      <h1>Задачи</h1>

      <div className="card">
        <div className="eyebrow">Новая задача</div>
        <div className="btn-row">
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: заменить лампу" />
          <button className="btn primary" style={{ width: "auto", whiteSpace: "nowrap" }} onClick={submit}>
            Добавить
          </button>
        </div>
      </div>

      <div className="eyebrow">Открытые · {open.length}</div>
      {open.length === 0 && <div className="list-empty">Все задачи выполнены</div>}
      {open.map((t) => (
        <label key={t.id} className="card card-row" style={{ cursor: "pointer" }}>
          <div>
            <div>{t.title}</div>
            {(t.assignee || t.dueDate) && (
              <div className="muted" style={{ fontSize: 12 }}>
                {[t.assignee, t.dueDate].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
          <input type="checkbox" checked={t.done} onChange={() => toggleTask(t.id)} />
        </label>
      ))}

      {done.length > 0 && (
        <>
          <div className="eyebrow" style={{ marginTop: 16 }}>
            Выполнено · {done.length}
          </div>
          {done.map((t) => (
            <label key={t.id} className="card card-row muted" style={{ cursor: "pointer" }}>
              <span style={{ textDecoration: "line-through" }}>{t.title}</span>
              <input type="checkbox" checked={t.done} onChange={() => toggleTask(t.id)} />
            </label>
          ))}
        </>
      )}
    </div>
  );
}
