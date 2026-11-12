import { useState } from "react";
import { useStore } from "@/data/useStore";
import { SendReportButton } from "@/components/SendReportButton";
import {
  addExpense,
  addIncome,
  computeMonthFinancials,
  currentMonthKey,
  deleteExpense,
  deleteIncome,
  expensesStore,
  incomesStore,
  listAllExpenses,
  listAllIncomes,
  listKnownSuppliers,
} from "@/data/repo";

function money(n: number): string {
  return n.toLocaleString("ru-RU") + " ₽";
}

// Статьи расходов — по реальному ОДДС за октябрь, который прислал Никита
// 12.11.2026 (такси, ЗП, коммунальные, аренда/диваны/печь, ремонт/вентиляция/
// склад, закупки у поставщиков еды и кофе, банк, бухгалтерия/роспатент,
// пожарка/дезинсекция, налоги, вывод прибыли, инкассация). Список не
// жёсткий — category в базе свободный текст (см. 0017_expenses.sql), "Другое"
// в форме даёт ввести свою статью.
const CATEGORY_SUGGESTIONS = [
  "Такси",
  "ЗП",
  "Коммунальные платежи",
  "Аренда",
  "Ремонт и обслуживание",
  "Закупка продуктов/сырья",
  "Мебель и оборудование",
  "Услуги банка",
  "Бухгалтерия и юридическое",
  "Безопасность",
  "Налоги",
  "Вывод прибыли",
  "Инкассация",
  "Прочее",
];

// Раздел расхода — Бар/Кухня/Кальян/Общее. Доп. поле вдобавок к статье (не
// замена) — см. 0020_expense_department_and_incomes.sql и запрос Никиты
// 12.11.2026: "надо будет все отсортировать по Бар, Кухня, Кальян".
// Свободный текст, необязательное поле — старые записи (и расходы, не
// привязанные к конкретному отделу вроде "Налоги"/"Аренда") просто без
// department, в сводках попадают в "Без раздела".
const DEPARTMENT_SUGGESTIONS = ["Бар", "Кухня", "Кальян", "Общее"];

// Поставщики/контрагенты — тоже из ОДДС, самые частые/заметные. Свободный
// текст (0018_expenses_supplier.sql) — список только подсказка, под полем
// есть фильтр по вводу (см. SupplierPicker ниже).
const SUPPLIER_SUGGESTIONS = [
  "БТС",
  "Свитлайф",
  "Глобал Групп",
  "Сбермаркет",
  "Марр Руссия",
  "Онтап",
  "Мосчайторг",
  "Сибкофе",
  "Хорошилов (сиропы)",
  "Бикетова (кола)",
  "ПТ Дистрибуция",
  "Пульс ПБ (пожарка)",
  "Козлова (бухгалтерия)",
  "Брижик (вентиляция)",
  "Магницкая (склад)",
  "Федусов (дезинсекция)",
  "Доксинбокс",
  "Меридиан Лайн",
  "Озон",
  "Крылов (пергамент)",
  "Хлеб с маслом",
  "НИИЦСУ Экор",
  "Ойлресайклинг",
  "Матяшов",
  "Каршеринг",
];

// Категории доходов — Никита вёл похожую разбивку в своей P&L-таблице
// (доходы: нал/безнал/яндекс), здесь то же самое плюс "Прочее". Не путать с
// автоматической выручкой из Quick Resto (shift_payroll/monthly_cash_split)
// — это ручные, отдельные поступления (см. запрос Никиты 12.11.2026:
// "доходы нужно туда же где расходы").
const INCOME_CATEGORY_SUGGESTIONS = ["Нал", "Безнал", "Яндекс", "Прочее"];

/**
 * Расходы и доходы заведения — руководитель заносит вручную (Quick Resto
 * экспортирует только продажи, не расходы и не прочие поступления). Сумма
 * за месяц (с разбивкой по статьям/разделам) отсюда идёт в блок "Финансы"
 * на "Сводка" (см. computeMonthFinancials в data/repo.ts). См. запросы
 * Никиты: 11.11.2026 "Расходы кстати нужно сделать еще отдельно, чтобы они
 * проводились тут" и 12.11.2026 "доходы нужно туда же где расходы" +
 * "надо будет все отсортировать по Бар, Кухня, Кальян".
 */
export default function Expenses() {
  useStore(expensesStore);
  useStore(incomesStore);

  const [mode, setMode] = useState<"expense" | "income">("expense");

  const expenseEntries = listAllExpenses();
  const incomeEntries = listAllIncomes();
  // Стартовый список из ОДДС + все поставщики, которые уже встречались в
  // расходах (включая введённые вручную новые — см. listKnownSuppliers).
  const supplierOptions = Array.from(new Set([...SUPPLIER_SUGGESTIONS, ...listKnownSuppliers()]));

  // Сводные плашки — по текущему месяцу (тот же расчёт, что на "Сводке",
  // см. запрос Никиты 12.11.2026: "отдельно плашки сводные по категориям,
  // которые были"). Переключателя по месяцам здесь нет намеренно — для
  // этого есть "Сводка", здесь просто ориентир при вводе.
  const month = computeMonthFinancials(currentMonthKey());

  const today = new Date().toISOString().slice(0, 10);
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  // "Другое" — свой вариант статьи, когда ни один чип не подходит (раньше
  // статья вводилась текстом с подсказкой клавиатуры (datalist) — список
  // всплывал отдельной панелью НАД клавиатурой и перекрывал форму, неудобно
  // нажимать, см. фидбек Никиты 12.11.2026: "лучше сделать отдельными
  // кнопками либо списком").
  const [customCategory, setCustomCategory] = useState(false);
  const [department, setDepartment] = useState("");
  const [supplier, setSupplier] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState("");

  const categoryOptions = mode === "expense" ? CATEGORY_SUGGESTIONS : INCOME_CATEGORY_SUGGESTIONS;

  function pickCategory(c: string) {
    setCategory(c);
    setCustomCategory(false);
  }

  function resetForm() {
    setAmount("");
    setCategory("");
    setCustomCategory(false);
    setDepartment("");
    setSupplier("");
    setNote("");
    setDate(today);
    setShowForm(false);
  }

  function switchMode(next: "expense" | "income") {
    setMode(next);
    resetForm();
  }

  function submit() {
    const value = Number(amount);
    if (!value || !category.trim()) return;
    if (mode === "expense") {
      addExpense(value, category.trim(), supplier.trim() || undefined, department || undefined, note.trim() || undefined, date || today);
    } else {
      addIncome(value, category.trim(), note.trim() || undefined, date || today);
    }
    resetForm();
  }

  function confirmDelete(id: string) {
    if (!deleteReason.trim()) return;
    if (mode === "expense") deleteExpense(id, deleteReason.trim());
    else deleteIncome(id, deleteReason.trim());
    setDeletingId(null);
    setDeleteReason("");
  }

  const [search, setSearch] = useState("");
  const rawEntries = mode === "expense" ? expenseEntries : incomeEntries;
  const needle = search.trim().toLowerCase();
  const entries = needle
    ? rawEntries.filter((e) => {
        const x = e as { category?: string; supplier?: string; department?: string; note?: string; createdByName?: string; date: string; amount: number };
        const [y, m, d] = x.date.slice(0, 10).split("-");
        const hay = [x.category, x.supplier, x.department, x.note, x.createdByName, x.date.slice(0, 10), `${d}.${m}.${y}`, `${d}.${m}`, String(x.amount)]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return needle.split(/\s+/).every((w) => hay.includes(w));
      })
    : rawEntries;

  return (
    <div className="screen">
      <h1>Расходы и доходы</h1>
      <p className="muted" style={{ fontSize: 13, marginTop: -8, marginBottom: 16 }}>
        Учитываются в «Сводка» автоматически.
      </p>
      <div style={{ marginBottom: 16 }}>
        <SendReportButton kind="expenses" param={currentMonthKey()} label="Excel за месяц — отправить мне в Telegram" />
      </div>

      <div className="tabs">
        <button className={`tab-btn ${mode === "expense" ? "active" : ""}`} onClick={() => switchMode("expense")}>
          Расходы
        </button>
        <button className={`tab-btn ${mode === "income" ? "active" : ""}`} onClick={() => switchMode("income")}>
          Доходы
        </button>
      </div>

      {/*
        Сводные плашки за текущий месяц — для расходов группируем по разделу
        (Бар/Кухня/Кальян/Без раздела), внутри каждого раздела показываем
        статьи; для доходов — просто по категориям (Нал/Безнал/Яндекс/
        Прочее). См. запрос Никиты 12.11.2026.
      */}
      {mode === "expense" && month.expensesByDepartment.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
          {month.expensesByDepartment.map((d) => (
            <div key={d.department} className="card" style={{ flex: "1 1 140px", minWidth: 140 }}>
              <div className="eyebrow">{d.department}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--danger)" }}>{money(d.amount)}</div>
            </div>
          ))}
        </div>
      )}
      {mode === "expense" && month.expensesByCategory.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            По статьям — текущий месяц
          </div>
          {month.expensesByCategory.map((c) => (
            <div key={c.category} className="card-row" style={{ padding: "6px 0" }}>
              <div style={{ fontSize: 14 }}>{c.category}</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{money(c.amount)}</div>
            </div>
          ))}
        </div>
      )}
      {mode === "income" && month.incomeByCategory.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            По категориям — текущий месяц
          </div>
          {month.incomeByCategory.map((c) => (
            <div key={c.category} className="card-row" style={{ padding: "6px 0" }}>
              <div style={{ fontSize: 14 }}>{c.category}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--good)" }}>{money(c.amount)}</div>
            </div>
          ))}
        </div>
      )}

      {!showForm && (
        <button className="btn secondary" style={{ width: "100%", marginBottom: 14 }} onClick={() => setShowForm(true)}>
          {mode === "expense" ? "+ Записать расход" : "+ Записать доход"}
        </button>
      )}

      {showForm && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="eyebrow">Сумма, ₽</div>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ marginBottom: 12 }} />
          <div className="eyebrow">{mode === "expense" ? "Статья" : "Категория"}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {categoryOptions.map((c) => {
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
              placeholder={mode === "expense" ? "Своя статья" : "Своя категория"}
              style={{ marginBottom: 12 }}
              autoFocus
            />
          )}

          {mode === "expense" && (
            <>
              <div className="eyebrow">Раздел (необязательно)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                {DEPARTMENT_SUGGESTIONS.map((d) => {
                  const active = department === d;
                  return (
                    <button
                      key={d}
                      type="button"
                      className={`chip chip-pick${active ? " accent" : ""}`}
                      style={{ cursor: "pointer", border: active ? "1px solid var(--accent)" : "1px solid var(--border)" }}
                      onClick={() => setDepartment(active ? "" : d)}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>

              <div className="eyebrow">Поставщик (необязательно)</div>
              <input
                type="text"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="Начните вводить — или выберите ниже"
                style={{ marginBottom: 8 }}
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                {supplierOptions
                  .filter((s) => s.toLowerCase().includes(supplier.trim().toLowerCase()))
                  .map((s) => {
                    const active = supplier === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        className={`chip chip-pick${active ? " accent" : ""}`}
                        style={{ cursor: "pointer", border: active ? "1px solid var(--accent)" : "1px solid var(--border)" }}
                        onClick={() => setSupplier(s)}
                      >
                        {s}
                      </button>
                    );
                  })}
                {/* Введённого текста нет среди известных поставщиков — явная
                    кнопка "создать", а не молчаливое "ничего не найдено" (см.
                    запрос Никиты 12.11.2026: "в случае нового поставщика должна
                    быть опция создать"). Нажатие ничего доп. не делает — поле
                    уже равно этому тексту, — просто подтверждает, что это
                    осознанный новый поставщик, а не опечатка; появится в
                    подсказках сам после сохранения (listKnownSuppliers). */}
                {supplier.trim() && !supplierOptions.some((s) => s.toLowerCase() === supplier.trim().toLowerCase()) && (
                  <button type="button" className="chip chip-pick accent" style={{ cursor: "default", border: "1px dashed var(--accent)" }}>
                    + Добавить «{supplier.trim()}»
                  </button>
                )}
              </div>
            </>
          )}

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

      <input
        type="search"
        placeholder="Поиск: статья, поставщик, заметка, сумма, дата"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 12 }}
      />
      {entries.length === 0 && (
        <div className="list-empty">{needle ? "Ничего не найдено" : mode === "expense" ? "Расходов пока нет" : "Доходов пока нет"}</div>
      )}
      {entries.map((e) => {
        const isDeleted = Boolean(e.deletedAt);
        const isExpense = mode === "expense";
        const supplierOrDept = isExpense ? [(e as { supplier?: string }).supplier, (e as { department?: string }).department].filter(Boolean).join(" · ") : "";
        return (
          <div key={e.id} className="card" style={{ opacity: isDeleted ? 0.55 : 1 }}>
            <div className="card-row">
              <div>
                <div style={{ fontWeight: 700, textDecoration: isDeleted ? "line-through" : "none" }}>
                  {e.category}
                  {supplierOrDept ? ` · ${supplierOrDept}` : ""}
                </div>
                <div className="muted" style={{ fontSize: 13, textDecoration: isDeleted ? "line-through" : "none" }}>
                  {e.note ? `${e.note} · ` : ""}
                  {new Date(e.date).toLocaleDateString("ru-RU", { day: "2-digit", month: "short" })}
                  {e.createdByName ? ` · провёл: ${e.createdByName}` : ""}
                </div>
                {isDeleted && (
                  <div className="muted" style={{ fontSize: 12, marginTop: 4, color: "var(--danger)" }}>
                    Удалено: {e.deletedByName ?? "?"} — {e.deleteReason}
                  </div>
                )}
              </div>
              <span
                style={{ fontWeight: 700, color: isExpense ? "var(--danger)" : "var(--good)", textDecoration: isDeleted ? "line-through" : "none" }}
              >
                {isExpense ? "−" : "+"}
                {money(e.amount)}
              </span>
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
