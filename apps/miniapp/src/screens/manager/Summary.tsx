import { Link } from "react-router-dom";
import { useStore } from "@/data/useStore";
import { averageReactionMinutes, computeExpensesLast30, computeRevenueTrend, expensesStore, problemsStore, serviceCallsStore, shiftPayrollStore, shiftStore, tasksStore } from "@/data/repo";

function money(n: number): string {
  return n.toLocaleString("ru-RU") + " ₽";
}

function formatDay(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
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

  const openCalls = calls.filter((c) => c.status === "open");
  const openProblems = problems.filter((p) => p.status !== "done");
  const openTasks = tasks.filter((t) => !t.done);
  const avgReaction = averageReactionMinutes();
  // Финансовая часть сводки — выручка за 30 дней с динамикой к предыдущим
  // 30 дням, плюс последний день, за который есть данные (см. запрос
  // Никиты 11.11.2026: "может быть финансовые показатели сюда добавить и
  // динамику?"), и расходы за те же 30 дней (ручной ввод в "Расходы", см.
  // 0017_expenses.sql) — итог "Чистыми" прямо тут, чтобы не считать в
  // уме. ABC-анализ по позициям — отдельная доработка позже (нужна новая
  // интеграция с Quick Resto по продажам).
  const revenue = computeRevenueTrend();
  const expenses30 = computeExpensesLast30();
  const net30 = revenue.last30 - expenses30;

  return (
    <div className="screen">
      <h1>Сводка</h1>

      <div className="eyebrow" style={{ marginTop: 4 }}>
        Финансы
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div className="card">
          <div className="eyebrow">Выручка за 30 дней</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{money(revenue.last30)}</div>
          {revenue.changePercent === null ? (
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              нет данных за пред. 30 дней
            </div>
          ) : (
            <div
              style={{
                fontSize: 12,
                marginTop: 4,
                color: revenue.changePercent >= 0 ? "var(--good)" : "var(--danger)",
              }}
            >
              {revenue.changePercent >= 0 ? "▲" : "▼"} {revenue.changePercent >= 0 ? "+" : ""}
              {revenue.changePercent}% к пред. 30 дням
            </div>
          )}
        </div>
        <div className="card">
          <div className="eyebrow">
            {revenue.lastRecordedDay ? `Выручка · ${formatDay(revenue.lastRecordedDay.date)}` : "Выручка"}
          </div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>
            {revenue.lastRecordedDay ? money(revenue.lastRecordedDay.revenue) : "—"}
          </div>
        </div>
        <Link to="/manager/expenses" className="card" style={{ display: "block" }}>
          <div className="eyebrow">Расходы за 30 дней</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--danger)" }}>{money(expenses30)}</div>
        </Link>
        <div className="card">
          <div className="eyebrow">Чистыми за 30 дней</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: net30 >= 0 ? "var(--good)" : "var(--danger)" }}>{money(net30)}</div>
        </div>
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
