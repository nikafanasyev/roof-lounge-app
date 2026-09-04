import { useState } from "react";
import { useStore } from "@/data/useStore";
import { daysOpen, listProblems, problemsStore, reportProblem, resolveProblem } from "@/data/repo";
import type { ProblemCategory } from "@/types";

const CATEGORY_LABELS: Record<ProblemCategory, string> = {
  hall: "Зал",
  equipment: "Оборудование",
  plumbing: "Сантехника",
  electric: "Электрика",
  register: "Касса",
  furniture: "Мебель",
  other: "Другое",
};

const CURRENT_STAFF_NAME = "Никита Афанасьев";

export default function Problems() {
  useStore(problemsStore);
  const problems = listProblems();
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState<ProblemCategory>("equipment");
  const [description, setDescription] = useState("");

  function submit() {
    if (!description.trim()) return;
    reportProblem({ category, description: description.trim(), reportedBy: CURRENT_STAFF_NAME });
    setDescription("");
    setShowForm(false);
  }

  return (
    <div className="screen">
      <div className="card-row">
        <h1 style={{ marginBottom: 0 }}>Проблемы</h1>
        <button className="btn ghost" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Отмена" : "+ Сообщить"}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <div className="eyebrow">Категория</div>
          <select value={category} onChange={(e) => setCategory(e.target.value as ProblemCategory)} style={{ marginBottom: 12 }}>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <div className="eyebrow">Описание</div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Например: стол №4 — не работает розетка"
            style={{ marginBottom: 12 }}
          />
          <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
            В прод-версии здесь ещё поле для фото — сейчас не подключено файловое хранилище.
          </div>
          <button className="btn primary" onClick={submit}>
            Отправить
          </button>
        </div>
      )}

      {problems.length === 0 && !showForm && <div className="list-empty">Открытых проблем нет</div>}

      {problems.map((p) => (
        <div key={p.id} className="card">
          <div className="card-row">
            <span className="chip">{CATEGORY_LABELS[p.category]}</span>
            <span className={`chip ${p.status === "done" ? "" : "accent"}`}>
              {p.status === "done" ? "решено" : `открыто ${daysOpen(p.createdAt)} дн.`}
            </span>
          </div>
          <div style={{ margin: "10px 0" }}>{p.description}</div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            Сообщил: {p.reportedBy}
          </div>
          {p.status !== "done" && (
            <button className="btn secondary" onClick={() => resolveProblem(p.id)}>
              Отметить решённой
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
