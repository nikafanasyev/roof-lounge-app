// MVP-заглушка: форма добавления записи открыта всем — по-хорошему начислять
// штрафы/премии должен только руководитель. Вернуться к этому, когда появится
// реальное разделение прав по ролям.
import { useState } from "react";
import { useStore } from "@/data/useStore";
import { addAdjustment, adjustmentsStore, listAdjustments } from "@/data/repo";
import type { AdjustmentType } from "@/types";

function money(n: number): string {
  return n.toLocaleString("ru-RU") + " ₽";
}

export default function Adjustments() {
  useStore(adjustmentsStore);
  const entries = listAdjustments();

  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<AdjustmentType>("bonus");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  function submit() {
    const value = Number(amount);
    if (!value || !reason.trim()) return;
    addAdjustment(type, value, reason.trim());
    setAmount("");
    setReason("");
    setShowForm(false);
  }

  return (
    <div className="screen">
      <h1>Штрафы и премии</h1>

      {entries.length === 0 && <div className="list-empty">Записей пока нет</div>}
      {entries.map((a) => (
        <div key={a.id} className="card card-row">
          <div>
            <div style={{ fontWeight: 700 }}>{a.reason}</div>
            <div className="muted" style={{ fontSize: 13 }}>
              {new Date(a.date).toLocaleDateString("ru-RU", { day: "2-digit", month: "short" })}
            </div>
          </div>
          <span style={{ fontWeight: 700, color: a.type === "bonus" ? "var(--good)" : "var(--danger)" }}>
            {a.type === "bonus" ? "+" : "−"}
            {money(a.amount)}
          </span>
        </div>
      ))}

      {!showForm && (
        <button className="btn secondary" style={{ width: "100%", marginTop: 8 }} onClick={() => setShowForm(true)}>
          + Добавить запись
        </button>
      )}

      {showForm && (
        <div className="card" style={{ marginTop: 8 }}>
          <div className="tabs">
            <button className={`tab-btn ${type === "bonus" ? "active" : ""}`} onClick={() => setType("bonus")}>
              Премия
            </button>
            <button className={`tab-btn ${type === "fine" ? "active" : ""}`} onClick={() => setType("fine")}>
              Штраф
            </button>
          </div>
          <div className="eyebrow">Сумма, ₽</div>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ marginBottom: 12 }} />
          <div className="eyebrow">Причина</div>
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} style={{ marginBottom: 12 }} />
          <div className="btn-row">
            <button className="btn secondary" style={{ flex: 1 }} onClick={() => setShowForm(false)}>
              Отмена
            </button>
            <button className="btn primary" style={{ flex: 1 }} onClick={submit}>
              Добавить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
