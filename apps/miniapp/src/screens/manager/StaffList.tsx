import { useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/data/useStore";
import { createStaffInvite, deleteStaffInvite, formatSalaryModel, listActiveStaffDirectory, listStaffDirectory, listStaffInvites, staffDirectoryStore, staffInvitesStore } from "@/data/repo";
import type { StaffRole } from "@/types";

const ROLE_LABELS: Record<StaffRole, string> = { bar: "Бар", hookah: "Кальяны" };

/**
 * Форма приглашения (кнопка "+ Пригласить") — ФИО/телефон/Telegram ID, см.
 * запрос Никиты 13.10.2026. Бот создаёт инвайт-ссылку на рабочий чат
 * (watchStaffInvites в apps/bot/src/notify.ts) и просто пишет результат в
 * staff_invites — готовую ссылку (или ошибку) показываем прямо здесь, в
 * списке "Приглашения" ниже, без отдельного сообщения в Telegram (см.
 * обсуждение с Никитой 09.11.2026).
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
  sent: "ссылка готова",
  failed: "не удалось создать ссылку",
};

/**
 * Строка одного приглашения. Пока status="pending" — просто крутим
 * статус-текст (бот обычно отвечает за секунды через Realtime). Когда
 * готово — показываем саму ссылку с кнопкой "Скопировать" (переслать
 * сотруднику решает сам руководитель — в WhatsApp, личным сообщением и
 * т.д., бот не может написать новому человеку первым). Когда провалилось —
 * показываем текст ошибки бота (обычно это про права бота в рабочем чате).
 */
function InviteRow({ inv }: { inv: ReturnType<typeof listStaffInvites>[number] }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    if (!inv.inviteLink) return;
    try {
      await navigator.clipboard.writeText(inv.inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // буфер обмена недоступен (например, не https) — ссылку всё равно
      // видно текстом, можно выделить и скопировать руками.
    }
  }

  return (
    <div className="card-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 4, padding: "8px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span>{inv.fullName}</span>
        <span className="muted" style={{ fontSize: 12 }}>
          {INVITE_STATUS_LABEL[inv.status] ?? inv.status}
        </span>
      </div>
      {inv.status === "sent" && inv.inviteLink && (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="text" readOnly value={inv.inviteLink} style={{ fontSize: 12, flex: 1 }} onFocus={(e) => e.target.select()} />
          <button className="btn secondary" style={{ padding: "6px 10px", fontSize: 12, whiteSpace: "nowrap" }} onClick={copyLink}>
            {copied ? "Скопировано" : "Скопировать"}
          </button>
        </div>
      )}
      {inv.status === "failed" && inv.error && (
        <div className="muted" style={{ fontSize: 12, color: "var(--danger, #c0392b)" }}>
          {inv.error}
        </div>
      )}
      {inv.status !== "pending" && (
        <button
          className="muted"
          style={{ background: "none", border: "none", fontSize: 12, textDecoration: "underline", cursor: "pointer", alignSelf: "flex-start", padding: 0 }}
          onClick={() => deleteStaffInvite(inv.id)}
        >
          удалить
        </button>
      )}
    </div>
  );
}

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
        <InviteRow key={inv.id} inv={inv} />
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
