import { useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/data/useStore";
import { addTip, currentMonthKey, deleteTip, listMyTips, tipsStore } from "@/data/repo";

function money(n: number): string {
  return n.toLocaleString("ru-RU") + " ₽";
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
}

function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function Tips() {
  useStore(tipsStore);
  const [month, setMonth] = useState(currentMonthKey());
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");

  const entries = listMyTips().filter((t) => t.date.startsWith(month));
  const total = entries.reduce((s, t) => s + t.amount, 0);
  const days = new Set(entries.map((t) => t.date)).size;

  function submit() {
    const value = Number(amount.replace(",", "."));
    if (!value || value <= 0 || !date) return;
    addTip(value, date, note);
    setAmount("");
    setNote("");
    setMonth(date.slice(0, 7));
  }

  return (
    <div className="screen">
      <Link to="/employee/more" className="muted" style={{ textDecoration: "none", fontSize: 14 }}>
        ← Ещё
      </Link>
      <h1>Мои чаевые</h1>
      <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
        Личные заметки. В зарплату не входят.
      </div>

      <div className="card-row" style={{ marginBottom: 10 }}>
        <button type="button" className="btn secondary" onClick={() => setMonth(shiftMonth(month, -1))}>
          ←
        </button>
        <div style={{ textTransform: "capitalize", fontWeight: 700 }}>{monthLabel(month)}</div>
        <button type="button" className="btn secondary" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= currentMonthKey()}>
          →
        </button>
      </div>

      <div className="hero-stat-card">
        <div className="eyebrow">Чаевые за месяц</div>
        <div className="value">{money(total)}</div>
        <div className="muted" style={{ fontSize: 12 }}>
          дней с чаевыми: {days}
        </div>
      </div>

      <h2>Добавить</h2>
      <div className="card" style={{ display: "grid", gap: 8 }}>
        <input type="number" inputMode="decimal" placeholder="Сумма, ₽" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
        <input type="text" placeholder="Заметка (необязательно)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button type="button" className="btn" onClick={submit} disabled={!Number(amount)}>
          Сохранить
        </button>
      </div>

      <h2>Записи</h2>
      {entries.length === 0 && <div className="list-empty">В этом месяце записей нет</div>}
      {entries.map((t) => (
        <div key={t.id} className="card card-row">
          <div>
            <div style={{ fontWeight: 700 }}>{new Date(t.date).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}</div>
            {t.note && (
              <div className="muted" style={{ fontSize: 12 }}>
                {t.note}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontWeight: 700, color: "var(--accent)" }}>{money(t.amount)}</span>
            <button
              type="button"
              className="muted"
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16 }}
              onClick={() => confirm("Удалить запись?") && deleteTip(t.id)}
              aria-label="Удалить"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
