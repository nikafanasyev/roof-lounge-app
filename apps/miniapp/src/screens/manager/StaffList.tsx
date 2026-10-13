import { useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/data/useStore";
import { createStaffInvite, formatSalaryModel, listActiveStaffDirectory, listStaffDirectory, listStaffInvites, staffDirectoryStore, staffInvitesStore } from "@/data/repo";
import type { StaffRole } from "@/types";

const ROLE_LABELS: Record<StaffRole, string> = { bar: "Бар", hookah: "Кальяны" };

/**
 * Форма приглашения (кнопка "+ Пригласить") — ФИО/телефон/Telegram ID, см.
 * запрос Никиты 13.10.2026. Бот сам создаёт инвайт-ссылку на рабочий чат
 * (watchStaffInvites в apps/bot/src/notify.ts) — Telegram не даёт боту
 * написать человеку первым, поэтому ссылка уходит руководителю в чат, а не
 * сразу новому сотруднику.
 */
function InviteForm({ onClose }: { onClose: () => void }) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [telegramId, setTelegramId] = useState("");

  function submit() {
    if (!fullName.trim()) return;
    createStaffInvite({ fullName: fullName.trim(), phone: phone.trim() || undefined, telegramId: telegramId.trim() || undefined });
    onClose();
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="eyebrow">Пригласить сотрудника</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
        <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="ФИО" />
        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Телефон (необязательно)" />
        <input type="text" value={telegramId} onChange={(e) => setTelegramId(e.target.value)} placeholder="Telegram ID (необязательно)" />
      </div>
      <div className="btn-row" style={{ marginTop: 10 }}>
        <button className="btn secondary" onClick={onClose}>
          Отмена
        </button>
        <button className="btn primary" disabled={!fullName.trim()} onClick={submit}>
          Отправить приглашение
        </button>
      </div>
    </div>
  );
}

const INVITE_STATUS_LABEL: Record<string, string> = {
  pending: "готовим ссылку…",
  sent: "ссылка готова — переслана в рабочий чат",
  failed: "не удалось создать ссылку",
};

function RecentInvites() {
  useStore(staffInvitesStore);
  const invites = listStaffInvites().slice(0, 5);
  if (!invites.length) return null;
  return (
    <>
      <div className="eyebrow" style={{ marginTop: 16 }}>
        Приглашения
      </div>
      {invites.map((inv) => (
        <div key={inv.id} className="card-row" style={{ padding: "8px 0" }}>
          <span>{inv.fullName}</span>
          <span className="muted" style={{ fontSize: 12 }}>
            {INVITE_STATUS_LABEL[inv.status] ?? inv.status}
          </span>
        </div>
      ))}
    </>
  );
}

export default function StaffList() {
  useStore(staffDirectoryStore);
  // Активный ростер — для основного списка; уволенные (archived) больше
  // здесь не показываются как "сотрудники", но их карточка (и вся история ЗП/
  // штрафов) никуда не делась — доступна отдельным свёрнутым списком ниже,
  // см. запрос Никиты 14.10.2026 про сохранение данных после удаления.
  const staff = listActiveStaffDirectory();
  const archivedStaff = listStaffDirectory().filter((s) => s.archived);
  const [inviting, setInviting] = useState(false);

  return (
    <div className="screen">
      <h1>Сотрудники</h1>

      {!inviting ? (
        <button className="btn secondary" style={{ marginBottom: 14 }} onClick={() => setInviting(true)}>
          + Пригласить сотрудника
        </button>
      ) : (
        <InviteForm onClose={() => setInviting(false)} />
      )}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {staff.map((s, idx) => (
          <Link
            key={s.id}
            to={`/manager/staff/${s.id}`}
            style={{
              textDecoration: "none",
              color: "inherit",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "12px 14px",
              borderTop: idx === 0 ? "none" : "1px solid var(--border)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {s.photoUrl ? (
                <img src={s.photoUrl} alt="" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} />
              ) : (
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: "var(--surface-2, #eee)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                  }}
                >
                  👤
                </div>
              )}
              <div>
                <div style={{ fontWeight: 600 }}>{s.name}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  {s.role ? ROLE_LABELS[s.role] : "Роль не задана"} · {formatSalaryModel(s)}
                </div>
              </div>
            </div>
            <span className="muted">→</span>
          </Link>
        ))}
        {staff.length === 0 && <div style={{ padding: 14 }} className="muted">Сотрудников пока нет</div>}
      </div>

      {archivedStaff.length > 0 && (
        <>
          <div className="eyebrow" style={{ marginTop: 16 }}>
            Уволены ({archivedStaff.length})
          </div>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {archivedStaff.map((s, idx) => (
              <Link
                key={s.id}
                to={`/manager/staff/${s.id}`}
                style={{
                  textDecoration: "none",
                  color: "inherit",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "12px 14px",
                  borderTop: idx === 0 ? "none" : "1px solid var(--border)",
                  opacity: 0.6,
                }}
              >
                <span>{s.name}</span>
                <span className="muted" style={{ fontSize: 12 }}>история ЗП сохранена →</span>
              </Link>
            ))}
          </div>
        </>
      )}

      <RecentInvites />
    </div>
  );
}
