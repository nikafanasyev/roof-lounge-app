import { useState } from "react";
import { useStore } from "@/data/useStore";
import { decideFlavorProposal, flavorProposalsStore } from "@/data/repo";

export default function FlavorProposals() {
  const all = useStore(flavorProposalsStore);
  const pending = all.filter((p) => p.status === "pending");
  const decided = all.filter((p) => p.status !== "pending").slice(0, 20);
  const [edits, setEdits] = useState<Record<string, { brand: string; name: string }>>({});

  return (
    <div className="screen">
      <h1>Новые вкусы</h1>
      <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
        Предложения мастеров. После одобрения вкус добавляется в каталог на стойке.
      </div>

      <h2>На согласовании</h2>
      {pending.length === 0 && <div className="list-empty">Нет новых предложений</div>}
      {pending.map((p) => {
        const e = edits[p.id] ?? { brand: p.brand, name: p.name };
        return (
          <div key={p.id} className="card" style={{ display: "grid", gap: 8 }}>
            <input type="text" value={e.brand} onChange={(ev) => setEdits({ ...edits, [p.id]: { ...e, brand: ev.target.value } })} />
            <input type="text" value={e.name} onChange={(ev) => setEdits({ ...edits, [p.id]: { ...e, name: ev.target.value } })} />
            <div className="muted" style={{ fontSize: 12 }}>
              от {p.proposedByName ?? "сотрудника"}
              {p.note ? ` · ${p.note}` : ""}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn" style={{ flex: 1 }} onClick={() => decideFlavorProposal(p.id, true, e)}>
                ✓ Добавить на стойку
              </button>
              <button type="button" className="btn secondary" style={{ flex: 1 }} onClick={() => decideFlavorProposal(p.id, false)}>
                Отклонить
              </button>
            </div>
          </div>
        );
      })}

      {decided.length > 0 && <h2>История</h2>}
      {decided.map((p) => (
        <div key={p.id} className="card card-row">
          <span>
            {p.brand} — {p.name}
          </span>
          <span className="muted">{p.status === "approved" ? "одобрено" : "отклонено"}</span>
        </div>
      ))}
    </div>
  );
}
