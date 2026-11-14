import { useEffect, useState } from "react";
import { fetchManagerCandidates, setStaffManager, type ManagerCandidate } from "@/data/repo";
import { isOwner } from "@/lib/telegram";

/**
 * Назначение руководителей — только для владельца (аккаунт из
 * VITE_MANAGER_TELEGRAM_IDS). Руководитель видит свой кабинет без Telegram id вручную.
 */
export default function ManagersAdmin() {
  const [list, setList] = useState<ManagerCandidate[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function reload() {
    setList(await fetchManagerCandidates());
  }
  useEffect(() => {
    reload();
  }, []);

  if (!isOwner()) {
    return (
      <div className="screen">
        <div className="list-empty">Раздел доступен только владельцу</div>
      </div>
    );
  }

  async function toggle(c: ManagerCandidate) {
    setBusyId(c.id);
    setError(null);
    const ok = await setStaffManager(c.id, !c.isManager);
    if (!ok) setError("Не получилось сохранить — попробуйте ещё раз");
    await reload();
    setBusyId(null);
  }

  const managers = (list ?? []).filter((c) => c.isManager);
  const others = (list ?? []).filter((c) => !c.isManager);

  return (
    <div className="screen">
      <h1>Руководители</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        Руководитель видит кабинет руководителя: сводку, зарплаты, расходы, штрафы и т.д. Сотрудник должен уже быть добавлен в приложение.
      </p>
      {error && <div className="muted" style={{ color: "var(--danger)", marginBottom: 8 }}>{error}</div>}

      {list === null ? (
        <div className="list-empty">Загружаем…</div>
      ) : (
        <>
          {managers.length === 0 && <div className="list-empty">Пока нет назначенных руководителей</div>}
          {managers.map((c) => (
            <div key={c.id} className="card card-row">
              <div style={{ fontWeight: 700 }}>{c.name}</div>
              <button className="btn secondary" disabled={busyId === c.id} onClick={() => toggle(c)}>
                {busyId === c.id ? "…" : "Снять права"}
              </button>
            </div>
          ))}

          <button className="btn primary" style={{ width: "100%", marginTop: 16 }} onClick={() => setAdding((v) => !v)}>
            {adding ? "Скрыть список" : "+ Добавить руководителя"}
          </button>

          {adding && (
            <div style={{ marginTop: 12 }}>
              {others.length === 0 && <div className="list-empty">Все сотрудники уже руководители</div>}
              {others.map((c) => (
                <div key={c.id} className="card card-row">
                  <div>{c.name}</div>
                  <button className="btn primary" disabled={busyId === c.id} onClick={() => toggle(c)}>
                    {busyId === c.id ? "…" : "Назначить"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
