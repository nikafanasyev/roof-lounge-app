import { useState } from "react";
import { useStore } from "@/data/useStore";
import { addAdjustment, adjustmentsStore, listAdjustments, listStaffDirectory, staffDirectoryStore } from "@/data/repo";
import type { AdjustmentType } from "@/types";

function money(n: number): string {
  return n.toLocaleString("ru-RU") + " ₽";
}

/**
 * Начисление штрафов/премий для руководителя — раньше такая форма была
 * только в кабинете "Сотрудник" (экран "Ещё" → "Штрафы и премии",
 * screens/employee/Adjustments.tsx), а руководитель внутри Telegram заперт
 * в кабинете "Руководитель" без доступа к "Сотрудник" (см. RoleShell в
 * App.tsx) — физически не мог туда попасть. Этот экран — то же самое
 * (addAdjustment в data/repo.ts), но в разделе руководителя и сразу по
 * всем сотрудникам, без привязки "это я". См. запрос Никиты 14.10.2026.
 */
export default function Fines() {
  useStore(adjustmentsStore);
  useStore(staffDirectoryStore);
  const entries = listAdjustments();
  const staffList = listStaffDirectory();
  const staffNameById = new Map(staffList.map((s) => [s.id, s.name]));

  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<AdjustmentType>("fine");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [staffId, setStaffId] = useState(staffList[0]?.id ?? "");

  function submit() {
    const value = Number(amount);
    if (!value || !reason.trim() || !staffId) return;
    addAdjustment(type, value, reason.trim(), staffId);
    setAmount("");
    setReason("");
    setShowForm(false);
  }

  return (
    <div className="screen">
      <h1>Штрафы и премии</h1>
      <p className="muted" style={{ fontSize: 13, marginTop: -8, marginBottom: 16 }}>
        Учитываются в «Зарплата» и в карточке сотрудника автоматически.
      </p>

      {!showForm && (
        <button className="btn secondary" style={{ width: "100%", marginBottom: 14 }} onClick={() => setShowForm(true)}>
          + Начислить штраф или премию
        </button>
      )}

      {showForm && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="tabs">
            <button className={`tab-btn ${type === "fine" ? "active" : ""}`} onClick={() => setType("fine")}>
              Штраф
            </button>
            <button className={`tab-btn ${type === "bonus" ? "active" : ""}`} onClick={() => setType("bonus")}>
              Премия
            </button>
          </div>
          <div className="eyebrow">Кому</div>
          <select value={staffId} onChange={(e) => setStaffId(e.target.value)} style={{ marginBottom: 12 }}>
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <div className="eyebrow">Сумма, ₽</div>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ marginBottom: 12 }} />
          <div className="eyebrow">Причина</div>
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} style={{ marginBottom: 12 }} />
          <div className="btn-row">
            <button className="btn secondary" style={{ flex: 1 }} onClick={() => setShowForm(false)}>
              Отмена
            </button>
            <button className="btn primary" style={{ flex: 1 }} disabled={!staffId} onClick={submit}>
              Начислить
            </button>
          </div>
        </div>
      )}

      {entries.length === 0 && <div className="list-empty">Записей пока нет</div>}
      {entries.map((a) => (
        <div key={a.id} className="card card-row">
          <div>
            <div style={{ fontWeight: 700 }}>{staffNameById.get(a.staffId) ?? "сотрудник не найден"}</div>
            <div className="muted" style={{ fontSize: 13 }}>
              {a.reason} · {new Date(a.date).toLocaleDateString("ru-RU", { day: "2-digit", month: "short" })}
            </div>
          </div>
          <span style={{ fontWeight: 700, color: a.type === "bonus" ? "var(--good)" : "var(--danger)" }}>
            {a.type === "bonus" ? "+" : "−"}
            {money(a.amount)}
          </span>
        </div>
      ))}
    </div>
  );
}
