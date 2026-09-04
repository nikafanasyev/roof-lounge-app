import { useStore } from "@/data/useStore";
import { listServiceCalls, resolveServiceCall, serviceCallsStore } from "@/data/repo";
import type { ServiceCallType } from "@/types";

const TYPE_LABELS: Record<ServiceCallType, string> = {
  waiter: "Позвать сотрудника",
  bill: "Попросить счёт",
  help: "Нужна помощь",
};

function minutesAgo(iso: string) {
  return Math.round((Date.now() - new Date(iso).getTime()) / 60000);
}

export default function ServiceCalls() {
  useStore(serviceCallsStore);
  const calls = listServiceCalls();

  return (
    <div className="screen">
      <h1>Вызовы со столов</h1>
      {calls.length === 0 && <div className="list-empty">Вызовов ещё не было</div>}
      {calls.map((c) => (
        <div key={c.id} className="card">
          <div className="card-row">
            <span style={{ fontWeight: 700 }}>Стол №{c.tableNumber}</span>
            <span className={`chip ${c.status === "open" ? "accent" : ""}`}>
              {c.status === "open" ? `${minutesAgo(c.createdAt)} мин назад` : "обработан"}
            </span>
          </div>
          <div className="muted" style={{ margin: "8px 0" }}>
            {TYPE_LABELS[c.type]}
          </div>
          {c.status === "open" ? (
            <button className="btn primary" onClick={() => resolveServiceCall(c.id)}>
              Обработано
            </button>
          ) : (
            c.resolvedAt && (
              <div className="muted" style={{ fontSize: 12 }}>
                Реакция за {Math.round((new Date(c.resolvedAt).getTime() - new Date(c.createdAt).getTime()) / 60000)} мин
              </div>
            )
          )}
        </div>
      ))}
    </div>
  );
}
