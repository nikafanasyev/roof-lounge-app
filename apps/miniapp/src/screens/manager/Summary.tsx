import { useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/data/useStore";
import {
  averageReactionMinutes,
  cashSplitStore,
  computeMonthFinancials,
  currentMonthKey,
  expensesStore,
  getCashSplitForMonth,
  listAvailableMonths,
  problemsStore,
  serviceCallsStore,
  shiftMonthKey,
  shiftPayrollStore,
  shiftStore,
  tasksStore,
} from "@/data/repo";

function money(n: number): string {
  return n.toLocaleString("ru-RU") + " ₽";
}

function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Блок "Автоматические предупреждения" раньше дублировал то, что уже видно
// в плитках выше (открытые вызовы/проблемы) — на "Сводке" это лишняя,
// отвлекающая информация при каждой загрузке экрана (см. обсуждение с
// Никитой 14.10.2026). Сами же предупреждения (чек-лист не открыт,
// просроченные проблемы, вызов без реакции) по смыслу ближе к разделам
// "Проблемы"/"Вызовы" — здесь не убираем логику целиком, просто не рисуем
// список на "Сводке".
export default function Summary() {
  const calls = useStore(serviceCallsStore);
  const problems = useStore(problemsStore);
  const tasks = useStore(tasksStore);
  const shift = useStore(shiftStore);
  useStore(shiftPayrollStore);
  useStore(expensesStore);
  useStore(cashSplitStore);

  const openCalls = calls.filter((c) => c.status === "open");
  const openProblems = problems.filter((p) => p.status !== "done");
  const openTasks = tasks.filter((t) => !t.done);
  const avgReaction = averageReactionMinutes();

  // Раньше выручка/расходы считались скользящим окном "30 дней" — Никита
  // попросил вместо этого календарный месяц с переключателем между месяцами
  // (см. запрос 12.11.2026: "выручку надо сделать не за 30 дней, а за
  // текущий месяц" + "в идеале сделать переключатель по месяцам"), плюс
  // разбивку расходов по статьям на этом же экране — по образцу ОДДС,
  // который он ведёт сам (см. скриншот 12.11.2026).
  const months = listAvailableMonths();
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const data = computeMonthFinancials(monthKey);
  const canGoNext = monthKey < currentMonthKey();
  const canGoPrev = months.includes(shiftMonthKey(monthKey, -1));
  const cashSplit = getCashSplitForMonth(monthKey);

  return (
    <div className="screen">
      <h1>Сводка</h1>

      <div className="eyebrow" style={{ marginTop: 4 }}>
        Финансы
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button
          className="btn secondary"
          style={{ padding: "6px 12px", fontSize: 14 }}
          disabled={!canGoPrev}
          onClick={() => setMonthKey((k) => shiftMonthKey(k, -1))}
        >
          ←
        </button>
        <div style={{ fontWeight: 700 }}>{formatMonthLabel(monthKey)}</div>
        <button
          className="btn secondary"
          style={{ padding: "6px 12px", fontSize: 14 }}
          disabled={!canGoNext}
          onClick={() => setMonthKey((k) => shiftMonthKey(k, 1))}
        >
          →
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div className="card">
          <div className="eyebrow">Выручка</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{money(data.revenue)}</div>
          {data.changePercent === null ? (
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              нет данных за пред. месяц
            </div>
          ) : (
            <div style={{ fontSize: 12, marginTop: 4, color: data.changePercent >= 0 ? "var(--good)" : "var(--danger)" }}>
              {data.changePercent >= 0 ? "▲" : "▼"} {data.changePercent >= 0 ? "+" : ""}
              {data.changePercent}% к пред. месяцу
            </div>
          )}
        </div>
        <Link to="/manager/expenses" className="card" style={{ display: "block" }}>
          <div className="eyebrow">Расходы</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--danger)" }}>{money(data.expenses)}</div>
        </Link>
        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <div className="eyebrow">Чистыми</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: data.net >= 0 ? "var(--good)" : "var(--danger)" }}>{money(data.net)}</div>
        </div>
      </div>

      {data.expensesByCategory.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Расходы по статьям
          </div>
          {data.expensesByCategory.map((c) => (
            <div key={c.category} className="card-row" style={{ padding: "6px 0" }}>
              <div style={{ fontSize: 14 }}>{c.category}</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{money(c.amount)}</div>
            </div>
          ))}
        </div>
      )}

      {/*
        Нал/безнал — Никита попросил "в идеале как-то следить за налом и
        безналом" (12.11.2026). Источник — отчёт Quick Resto
        finances.reports.financial ("Сумма продаж наличные"/"безналичные"
        внутри "Общая выручка"), который бот синхронизирует раз в сутки в
        monthly_cash_split (см. apps/bot/src/quickresto.ts,
        syncMonthlyCashSplit, и claude/quickresto-shift-integration.md).
        Бот синхронизирует только ТЕКУЩИЙ месяц — для прошлых месяцев строки
        в monthly_cash_split не будет, пока нет отдельной команды для
        ручной синхронизации задним числом, поэтому показываем "—", а не 0 ₽.
      */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>
          Нал / безнал
        </div>
        {cashSplit ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>
                Наличные
              </div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{money(cashSplit.cash)}</div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>
                Безналичные
              </div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{money(cashSplit.cashless)}</div>
            </div>
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 13 }}>
            Ещё не синхронизировано за этот месяц
          </div>
        )}
      </div>

      <div className="eyebrow">Операционка</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Link to="/manager/calls" className="card" style={{ display: "block" }}>
          <div className="eyebrow">Открытые вызовы</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{openCalls.length}</div>
        </Link>
        <div className="card">
          <div className="eyebrow">Ср. время реакции</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{avgReaction !== null ? `${avgReaction} мин` : "—"}</div>
        </div>
        <Link to="/manager/problems" className="card" style={{ display: "block" }}>
          <div className="eyebrow">Открытые проблемы</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{openProblems.length}</div>
        </Link>
        <div className="card">
          <div className="eyebrow">Задачи в работе</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{openTasks.length}</div>
        </div>
      </div>

      <div className="card">
        <div className="eyebrow">Статус смены</div>
        <div>
          <span className={`badge-dot ${shift.status === "open" ? "done" : "open"}`} />
          {shift.status === "open" ? `Открыта${shift.openedBy ? ` · ${shift.openedBy}` : ""}` : "Закрыта"}
        </div>
      </div>
    </div>
  );
}
