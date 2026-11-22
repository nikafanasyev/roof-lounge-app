import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/data/useStore";
import Sheet from "@/components/Sheet";
import {
  TECH_ROLES,
  addTechTask,
  approveTechTask,
  businessDateIso,
  getTechTasksForRoleOnDate,
  importRotationAsTechTasks,
  loadTechMarks,
  localDateIso,
  removeTechTask,
  staffDirectoryStore,
  listStaffDirectory,
  techMarkFor,
  techMarksStore,
  techRepeatLabel,
  techTasksByDateEnabled,
  techTasksStore,
} from "@/data/repo";

const REPEATS: { days: number; label: string }[] = [
  { days: 0, label: "Один раз" },
  { days: 1, label: "Каждый день" },
  { days: 2, label: "Через день" },
  { days: 3, label: "Раз в 3 дня" },
  { days: 4, label: "Раз в 4 дня" },
  { days: 7, label: "Раз в неделю" },
  { days: 14, label: "Раз в 2 недели" },
  { days: 28, label: "Раз в 4 недели" },
];

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return localDateIso(new Date(y, m - 1, d + n, 12));
}

function mondayOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12);
  return addDays(iso, -((dt.getDay() + 6) % 7));
}

function dayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString("ru-RU", { weekday: "short", day: "2-digit", month: "2-digit" });
}

/** Модальное окно «Новая тех. задача». */
function NewTaskModal({ onClose }: { onClose: () => void }) {
  const [roleKey, setRoleKey] = useState(TECH_ROLES[0].key);
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState(businessDateIso());
  const [everyDays, setEveryDays] = useState(7);

  return (
    <Sheet onClose={onClose}>
        <h2 style={{ marginTop: 0 }}>Новая тех. задача</h2>
        <div className="eyebrow">Кто делает</div>
        <div className="chip-row" style={{ flexWrap: "wrap", marginBottom: 10 }}>
          {TECH_ROLES.map((r) => (
            <button key={r.key} className={`chip ${roleKey === r.key ? "accent" : ""}`} style={{ cursor: "pointer" }} onClick={() => setRoleKey(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="eyebrow">Что сделать</div>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: помыть вытяжку" style={{ marginBottom: 10 }} />
        <div className="eyebrow">Первый раз</div>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ marginBottom: 10 }} />
        <div className="eyebrow">Повтор</div>
        <select value={everyDays} onChange={(e) => setEveryDays(Number(e.target.value))} style={{ marginBottom: 14 }}>
          {REPEATS.map((r) => (
            <option key={r.days} value={r.days}>
              {r.label}
            </option>
          ))}
        </select>
        <div className="btn-row">
          <button
            className="btn primary"
            disabled={!title.trim() || !startDate}
            onClick={() => {
              // Первая новая задача включает формат «по датам» — чтобы старые задачи не пропали, сначала переносим их.
              if (!techTasksByDateEnabled()) importRotationAsTechTasks();
              addTechTask({ roleKey, title: title.trim(), startDate, everyDays });
              onClose();
            }}
          >
            Добавить
          </button>
          <button className="btn secondary" onClick={onClose}>
            Отмена
          </button>
        </div>
    </Sheet>
  );
}

/**
 * Тех. задачи у руководителя: неделя по дням, отметки сотрудников (с фото в
 * Telegram) и приёмка руководителем. Задачи — по датам с повтором «раз в N дней».
 */
export default function TechTasks() {
  useStore(techMarksStore);
  const tasks = useStore(techTasksStore);
  useStore(staffDirectoryStore);
  const staffById = useMemo(() => new Map(listStaffDirectory().map((s) => [s.id, s.name])), [tasks]);
  const today = businessDateIso();
  const [weekStart, setWeekStart] = useState(() => mondayOf(today));
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const weekEnd = addDays(weekStart, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const byDate = techTasksByDateEnabled();

  useEffect(() => {
    loadTechMarks(weekStart, weekEnd);
  }, [weekStart, weekEnd]);

  const roles = TECH_ROLES.filter((r) => !roleFilter || r.key === roleFilter);
  let total = 0;
  let approved = 0;
  let waiting = 0;
  for (const d of days)
    for (const r of roles)
      for (const t of getTechTasksForRoleOnDate(r.key, d)) {
        total++;
        const mk = techMarkFor(d, r.key, t.task);
        if (mk?.approvedAt) approved++;
        else if (mk?.doneAt) waiting++;
      }

  return (
    <div className="screen">
      <div className="card-row">
        <h1 style={{ margin: 0 }}>Тех. задачи</h1>
        <button className="btn primary" style={{ width: "auto", padding: "8px 14px" }} onClick={() => setModal(true)}>
          + Задача
        </button>
      </div>

      {!byDate && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ fontSize: 14 }}>Сейчас задачи идут по старой 4-недельной таблице (по дням недели).</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            Перенесите их в новый формат — по датам с повтором «раз в N дней». В ближайшие 4 недели задачи выпадут на те же дни.
          </div>
          <button
            className="btn secondary"
            style={{ marginTop: 10 }}
            onClick={() => importRotationAsTechTasks()}
          >
            Перенести задачи в новый формат
          </button>
        </div>
      )}

      <div className="card-row" style={{ margin: "12px 0 8px" }}>
        <button className="btn secondary" style={{ width: "auto", padding: "6px 12px" }} onClick={() => setWeekStart(addDays(weekStart, -7))}>
          ←
        </button>
        <button
          onClick={() => setWeekStart(mondayOf(today))}
          style={{ background: "none", border: "none", font: "inherit", fontWeight: 700, color: "var(--ink)", cursor: "pointer" }}
        >
          {dayLabel(weekStart).slice(4)} – {dayLabel(weekEnd).slice(4)}
        </button>
        <button className="btn secondary" style={{ width: "auto", padding: "6px 12px" }} onClick={() => setWeekStart(addDays(weekStart, 7))}>
          →
        </button>
      </div>

      <div className="chip-row" style={{ flexWrap: "wrap", marginBottom: 8 }}>
        <button className={`chip ${!roleFilter ? "accent" : ""}`} style={{ cursor: "pointer" }} onClick={() => setRoleFilter(null)}>
          Все
        </button>
        {TECH_ROLES.map((r) => (
          <button key={r.key} className={`chip ${roleFilter === r.key ? "accent" : ""}`} style={{ cursor: "pointer" }} onClick={() => setRoleFilter(r.key)}>
            {r.label}
          </button>
        ))}
      </div>

      <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
        За неделю: принято {approved} из {total}
        {waiting > 0 ? ` · ждут проверки: ${waiting}` : ""}
      </div>

      {days.map((d) => {
        const rows = roles.flatMap((r) => getTechTasksForRoleOnDate(r.key, d).map((t) => ({ role: r, t })));
        return (
          <div key={d} className="card" style={{ borderColor: d === today ? "var(--accent)" : undefined }}>
            <div style={{ fontWeight: 700, textTransform: "capitalize", marginBottom: rows.length ? 6 : 0 }}>
              {dayLabel(d)}
              {d === today && <span className="chip accent" style={{ marginLeft: 8, fontSize: 11 }}>сегодня</span>}
            </div>
            {rows.length === 0 && <div className="muted" style={{ fontSize: 13 }}>Задач нет</div>}
            {rows.map(({ role, t }, i) => {
              const mk = techMarkFor(d, role.key, t.task);
              const status = mk?.approvedAt ? "approved" : mk?.doneAt ? "done" : "none";
              return (
                <div key={i} className="card-row" style={{ borderTop: "1px solid var(--border)", padding: "8px 0", gap: 8, alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14 }}>{t.task}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {role.label} · {t.note}
                      {status === "done" && ` · отметил(а) ${staffById.get(mk!.doneBy!) ?? "сотрудник"}`}
                    </div>
                  </div>
                  {status === "approved" ? (
                    <button className="chip accent" style={{ cursor: "pointer", flex: "none" }} onClick={() => approveTechTask(d, role.key, t.task, false)}>
                      ✓ принято
                    </button>
                  ) : (
                    <button
                      className={`chip ${status === "done" ? "accent" : ""}`}
                      style={{ cursor: "pointer", flex: "none", opacity: status === "done" ? 1 : 0.7 }}
                      onClick={() => approveTechTask(d, role.key, t.task, true)}
                    >
                      {status === "done" ? "Принять" : "не отмечено"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {byDate && (
        <>
          <button className="btn secondary" style={{ marginTop: 6 }} onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Скрыть список задач" : `Все задачи (${tasks.length})`}
          </button>
          {showAll &&
            TECH_ROLES.map((r) => {
              const list = tasks.filter((t) => t.roleKey === r.key);
              if (!list.length) return null;
              return (
                <div key={r.key} className="card">
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{r.label}</div>
                  {list.map((t) => (
                    <div key={t.id} className="card-row" style={{ borderTop: "1px solid var(--border)", padding: "6px 0", gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14 }}>{t.title}</div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {techRepeatLabel(t.everyDays)} · с {dayLabel(t.startDate)}
                        </div>
                      </div>
                      {confirmDelete === t.id ? (
                        <button className="chip" style={{ cursor: "pointer", color: "var(--danger, #e5484d)" }} onClick={() => removeTechTask(t.id)}>
                          Удалить?
                        </button>
                      ) : (
                        <button
                          className="muted"
                          aria-label="Удалить задачу"
                          style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}
                          onClick={() => setConfirmDelete(t.id)}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
        </>
      )}

      {modal && <NewTaskModal onClose={() => setModal(false)} />}
    </div>
  );
}
