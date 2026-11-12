import { useState } from "react";
import { useStore } from "@/data/useStore";
import { addExpense, deleteExpense, expensesStore, listAllExpenses } from "@/data/repo";

function money(n: number): string {
  return n.toLocaleString("ru-RU") + " ₽";
}

// Типовые статьи расходов — только подсказка (datalist), не жёсткий список:
// category в базе — свободный текст, см. 0017_expenses.sql.
const CATEGORY_SUGGESTIONS = ["Закупка табака/углей", "Продукты (бар)", "Коммунальные платежи", "Аренда", "Ремонт и обслуживание", "Хозтовары", "Маркетинг", "Прочее"];

/**
 * Расходы заведения — руководитель заносит траты вручную (Quick Resto их
 * не экспортирует, это не продажи). Сумма за 30 дней отсюда идёт в блок
 * "Финансы" на "Сводка" (см. computeExpensesLast30 в data/repo.ts). См.
 * запрос Никиты 11.11.2026: "Расходы кстати нужно сделать еще отдельно,
 * чтобы они проводились тут".
 */
export default function Expenses() {
  useStore(expensesStore);
  const entries = listAllExpenses();

  const today = new Date().toISOString().slice(0, 10);
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  // "Другое" — свой вариант статьи, когда ни один чип не подходит (раньше
  // статья вводилась текстом с подсказкой клавиатуры (datalist) — список
  // всплывал отдельной панелью НАД клавиатурой и перекрывал форму, неудобно
  // нажимать, см. фидбек Никиты 12.11.2026: "лучше сделать отдельными
  // кнопками либо списком"). Итоговый список статей уточним после ОДДС.
  const [customCategory, setCustomCategory] = useState(false);
  const [supplier, setSupplier] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState("");

  function pickCategory(c: string) {
    setCategory(c);
    setCustomCategory(false);
  }

  function submit() {
    const value = Number(amount);
    if (!value || !category.trim()) return;
    addExpense(value, category.trim(), supplier.trim() || undefined, note.trim() || undefined, date || today);
    setAmount("");
    setCategory("");
    setCustomCategory(false);
    setSupplier("");
    setNote("");
    setDate(today);
    setShowForm(false);
  }

  function confirmDelete(id: string) {
    if (!deleteReason.trim()) return;
    deleteExpense(id, deleteReason.trim());
    setDeletingId(null);
    setDeleteReason("");
  }

  return (
    <div className="screen">
      <h1>Расходы</h1>
      <p className="muted" style={{ fontSize: 13, marginTop: -8, marginBottom: 16 }}>
        Учитываются в «Сводка» автоматически.
      </p>

      {!showForm && (
        <button className="btn secondary" style={{ width: "100%", marginBottom: 14 }} onClick={() => setShowForm(true)}>
          + Записать расход
        </button>
      )}

      {showForm && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="eyebrow">Сумма, ₽</div>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ marginBottom: 12 }} />
          <div className="eyebrow">Статья</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {CATEGORY_SUGGESTIONS.map((c) => {
              const active = !customCategory && category === c;
              return (
                <button
                  key={c}
                  type="button"
                  className={`chip chip-pick${active ? " accent" : ""}`}
                  style={{ cursor: "pointer", border: active ? "1px solid var(--accent)" : "1px solid var(--border)" }}
                  onClick={() => pickCategory(c)}
                >
                  {c}
                </button>
              );
            })}
            <button
              type="button"
              className={`chip chip-pick${customCategory ? " accent" : ""}`}
              style={{ cursor: "pointer", border: customCategory ? "1px solid var(--accent)" : "1px solid var(--border)" }}
              onClick={() => {
                setCustomCategory(true);
                setCategory("");
              }}
            >
              Другое
            </button>
          </div>
          {customCategory && (
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Своя статья"
              style={{ marginBottom: 12 }}
              autoFocus
            />
          )}
          <div className="eyebrow">Поставщик (необязательно)</div>
          <input
            type="text"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="Например, название компании"
            style={{ marginBottom: 12 }}
          />
          <div className="eyebrow">Комментарий (необязательно)</div>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} style={{ marginBottom: 12 }} />
          <div className="eyebrow">Дата</div>
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} style={{ marginBottom: 12 }} />
          <div className="btn-row">
            <button className="btn secondary" style={{ flex: 1 }} onClick={() => setShowForm(false)}>
              Отмена
            </button>
            <button className="btn primary" style={{ flex: 1 }} disabled={!amount || !category.trim()} onClick={submit}>
              Записать
            </button>
          </div>
        </div>
      )}

      {entries.length === 0 && <div className="list-empty">Расходов пока нет</div>}
      {entries.map((e) => {
        const isDeleted = Boolean(e.deletedAt);
        return (
          <div key={e.id} className="card" style={{ opacity: isDeleted ? 0.55 : 1 }}>
            <div className="card-row">
              <div>
                <div style={{ fontWeight: 700, textDecoration: isDeleted ? "line-through" : "none" }}>
                  {e.category}
                  {e.supplier ? ` · ${e.supplier}` : ""}
                </div>
                <div className="muted" style={{ fontSize: 13, textDecoration: isDeleted ? "line-through" : "none" }}>
                  {e.note ? `${e.note} · ` : ""}
                  {new Date(e.date).toLocaleDateString("ru-RU", { day: "2-digit", month: "short" })}
                </div>
                {isDeleted && (
                  <div className="muted" style={{ fontSize: 12, marginTop: 4, color: "var(--danger)" }}>
                    Удалено: {e.deletedByName ?? "?"} — {e.deleteReason}
                  </div>
                )}
              </div>
              <span style={{ fontWeight: 700, color: "var(--danger)", textDecoration: isDeleted ? "line-through" : "none" }}>−{money(e.amount)}</span>
            </div>

            {!isDeleted && deletingId !== e.id && (
              <button className="btn secondary" style={{ marginTop: 10, padding: "6px 10px", fontSize: 13 }} onClick={() => setDeletingId(e.id)}>
                Удалить запись
              </button>
            )}

            {!isDeleted && deletingId === e.id && (
              <div style={{ marginTop: 10 }}>
                <input
                  type="text"
                  value={deleteReason}
                  onChange={(ev) => setDeleteReason(ev.target.value)}
                  placeholder="Причина удаления (обязательно)"
                  style={{ marginBottom: 8 }}
                />
                <div className="btn-row">
                  <button
                    className="btn secondary"
                    style={{ flex: 1, padding: "6px 10px", fontSize: 13 }}
                    onClick={() => {
                      setDeletingId(null);
                      setDeleteReason("");
                    }}
                  >
                    Отмена
                  </button>
                  <button
                    className="btn primary"
                    style={{ flex: 1, padding: "6px 10px", fontSize: 13 }}
                    disabled={!deleteReason.trim()}
                    onClick={() => confirmDelete(e.id)}
                  >
                    Подтвердить удаление
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
