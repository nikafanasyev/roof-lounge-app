import { useState } from "react";
import { useStore } from "@/data/useStore";
import { addAdjustment, adjustmentsStore, deleteAdjustment, listActiveStaffDirectory, listAllAdjustments, listStaffDirectory, staffDirectoryStore } from "@/data/repo";
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
  // Раньше здесь был listAdjustments() — он возвращает записи только
  // текущего вошедшего аккаунта, поэтому штрафы/премии, начисленные другим
  // сотрудникам, в этом списке фактически не появлялись (см. жалобу Никиты
  // 14.10.2026: "штрафы нужно хранить в штрафах тоже"). listAllAdjustments()
  // — все записи по всем сотрудникам, включая удалённые (показываем их
  // зачёркнутыми, см. ниже).
  const entries = listAllAdjustments();
  // Для выбора "Кому" в форме — только действующие сотрудники (уволенному
  // новый штраф не начислить), но для подписи уже существующих записей
  // нужны ВСЕ (включая уволенных) — иначе после увольнения его старые
  // штрафы показывали бы "сотрудник не найден".
  const pickableStaff = listActiveStaffDirectory();
  const staffNameById = new Map(listStaffDirectory().map((s) => [s.id, s.name]));

  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<AdjustmentType>("fine");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [staffId, setStaffId] = useState(pickableStaff[0]?.id ?? "");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState("");

  function submit() {
    const value = Number(amount);
    if (!value || !reason.trim() || !staffId) return;
    addAdjustment(type, value, reason.trim(), staffId);
    setAmount("");
    setReason("");
    setShowForm(false);
  }

  function confirmDelete(id: string) {
    if (!deleteReason.trim()) return;
    deleteAdjustment(id, deleteReason.trim());
    setDeletingId(null);
    setDeleteReason("");
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
            {pickableStaff.map((s) => (
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
      {entries.map((a) => {
        const isDeleted = Boolean(a.deletedAt);
        return (
          <div key={a.id} className="card" style={{ opacity: isDeleted ? 0.55 : 1 }}>
            <div className="card-row">
              <div>
                <div style={{ fontWeight: 700, textDecoration: isDeleted ? "line-through" : "none" }}>
                  {staffNameById.get(a.staffId) ?? "сотрудник не найден"}
                </div>
                <div className="muted" style={{ fontSize: 13, textDecoration: isDeleted ? "line-through" : "none" }}>
                  {a.reason} · {new Date(a.date).toLocaleDateString("ru-RU", { day: "2-digit", month: "short" })}
                </div>
                {isDeleted && (
                  <div className="muted" style={{ fontSize: 12, marginTop: 4, color: "var(--danger)" }}>
                    Удалено: {a.deletedByName ?? "?"} — {a.deleteReason}
                  </div>
                )}
              </div>
              <span style={{ fontWeight: 700, color: a.type === "bonus" ? "var(--good)" : "var(--danger)", textDecoration: isDeleted ? "line-through" : "none" }}>
                {a.type === "bonus" ? "+" : "−"}
                {money(a.amount)}
              </span>
            </div>

            {!isDeleted && deletingId !== a.id && (
              <button className="btn secondary" style={{ marginTop: 10, padding: "6px 10px", fontSize: 13 }} onClick={() => setDeletingId(a.id)}>
                Удалить запись
              </button>
            )}

            {!isDeleted && deletingId === a.id && (
              <div style={{ marginTop: 10 }}>
                <input
                  type="text"
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
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
                    onClick={() => confirmDelete(a.id)}
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
