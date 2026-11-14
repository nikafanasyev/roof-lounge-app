import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  createServiceCall,
  getGuestByIdRemote,
  getLatestLoyaltyRequest,
  requestLoyaltyCardCreation,
  startGuestVisit,
  touchGuestVisit,
} from "@/data/repo";
import { tableLabel } from "@/lib/tables";
import type { Guest, ServiceCallType } from "@/types";

// Переадресация на внешний сервис чаевых (НетМонет) — см. обсуждение с
// Никитой 11.10.2026: реального приёма денег внутри приложения нет, кнопка
// просто уводит на страницу НетМонет этого заведения/стола.
const TIP_URL = (import.meta.env.VITE_TIP_URL as string | undefined) ?? "";

const ACTIONS: { type: ServiceCallType; label: string; emoji: string }[] = [
  { type: "master", label: "Позвать мастера", emoji: "🧑‍🔧" },
  { type: "waiter", label: "Позвать официанта", emoji: "🙋" },
  { type: "bill", label: "Попросить счёт", emoji: "🧾" },
];

function formatLastVisit(iso?: string): string {
  if (!iso) return "это ваш первый визит";
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
}

/** Главный экран гостя после авторизации — ФИО, QR лояльности, бонусы, последний визит, вызовы и чаевые. */
export default function GuestHome({
  guest,
  tableNumber,
}: {
  guest: Guest;
  tableNumber: number | null;
}) {
  const [sent, setSent] = useState<ServiceCallType | null>(null);
  // Ключ карты в Quick Resto: пока его нет, карты на кассе у гостя нет —
  // показываем кнопку "Создать карту" вместо QR (QR с внутренним кодом на кассе не читается).
  const [qrKey, setQrKey] = useState<string | undefined>(guest.quickrestoQrKey);
  const [creatingCard, setCreatingCard] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);

  async function createCard() {
    setCreatingCard(true);
    setCardError(null);
    try {
      await requestLoyaltyCardCreation(guest.id);
      // Бот создаёт карту в Quick Resto за несколько секунд — ждём результат.
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        const updated = await getGuestByIdRemote(guest.id);
        if (updated?.quickrestoQrKey) {
          setQrKey(updated.quickrestoQrKey);
          return;
        }
        const req = await getLatestLoyaltyRequest(guest.id);
        if (req?.status === "failed") {
          setCardError("Не получилось создать карту — подойдите к мастеру, он поможет");
          return;
        }
      }
      setCardError("Карта ещё создаётся — загляните сюда через минуту");
    } finally {
      setCreatingCard(false);
    }
  }
  const [showLost, setShowLost] = useState(false);
  const [lostText, setLostText] = useState("");
  const [lostSent, setLostSent] = useState(false);
  // "Последний визит" на экране — это значение ДО текущего обновления, поэтому
  // сохраняем его один раз при монтировании, а не читаем guest.lastVisitAt
  // напрямую (иначе отметка текущего визита сразу перезаписала бы дату
  // прошлого визита на экране).
  const [lastVisitShown] = useState(guest.lastVisitAt);

  // Если у гостя уже есть активный визит (сидит за столом) — просто
  // обновляем отметку последней активности; если нет — считаем, что визит
  // начинается сейчас (стол, за которым открыли мини-апп). См. обсуждение
  // с Никитой 11.10.2026: завершается визит вручную сотрудником или
  // автоматически при закрытии смены.
  useEffect(() => {
    if (guest.activeTableNumber && (tableNumber === null || guest.activeTableNumber === tableNumber)) {
      touchGuestVisit(guest.id);
    } else if (tableNumber !== null) {
      startGuestVisit(guest.id, tableNumber);
    }
  }, [guest.id, tableNumber]);

  function send(type: ServiceCallType) {
    if (tableNumber === null) return;
    createServiceCall(tableNumber, type, guest.id);
    setSent(type);
    setTimeout(() => setSent(null), 2500);
  }

  function leaveTip() {
    if (!TIP_URL || tableNumber === null) return;
    const url = `${TIP_URL}${TIP_URL.includes("?") ? "&" : "?"}table=${tableNumber}`;
    window.location.href = url;
  }

  return (
    <div className="screen" style={{ paddingTop: 24 }}>
      <div className="eyebrow" style={{ textAlign: "center" }}>
        Roof Lounge{tableNumber !== null ? ` · Стол №${tableLabel(tableNumber)}` : ""}
      </div>
      <h1 style={{ textAlign: "center" }}>{guest.displayName}</h1>

      {qrKey ? (
        <div className="card" style={{ textAlign: "center", padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <QRCodeSVG value={qrKey} size={160} />
          </div>
          <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
            Код лояльности: {guest.loyaltyCode ?? "—"} · покажите на кассе
          </div>
        </div>
      ) : (
        <div className="card" style={{ textAlign: "center", padding: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Карты лояльности пока нет</div>
          <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
            Создайте её — копите бонусы и получайте скидки при каждом визите.
          </div>
          <button className="btn primary" style={{ width: "100%" }} disabled={creatingCard} onClick={createCard}>
            {creatingCard ? "Создаём карту…" : "Создать карту лояльности"}
          </button>
          {cardError && (
            <div className="muted" style={{ color: "var(--danger)", marginTop: 8, fontSize: 13 }}>
              {cardError}
            </div>
          )}
        </div>
      )}

      <div className="stat-grid">
        <div className="stat-tile accent">
          <div className="value">{guest.bonusPoints ?? 0}</div>
          <div className="label">Бонусов</div>
        </div>
        <div className="stat-tile">
          <div className="value" style={{ fontSize: 14 }}>
            {formatLastVisit(lastVisitShown)}
          </div>
          <div className="label">Последний визит</div>
        </div>
      </div>

      {sent && (
        <div className="card" style={{ borderColor: "var(--good)", textAlign: "center" }}>
          Сотрудник уже в курсе — идёт к вам
        </div>
      )}

      {tableNumber === null && (
        <div className="card" style={{ marginBottom: 12, textAlign: "center" }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Отсканируйте QR-код на столе</div>
          <div className="muted" style={{ fontSize: 13 }}>
            Так мы поймём, где вы сидите, и вы сможете позвать мастера, официанта или попросить счёт.
          </div>
        </div>
      )}

      <h2>Позвать</h2>
      {ACTIONS.map((a) => (
        <button
          key={a.type}
          className="card card-row"
          style={{ width: "100%", border: "1px solid var(--border)", cursor: "pointer", background: "var(--surface)", opacity: tableNumber === null ? 0.5 : 1 }}
          disabled={tableNumber === null}
          onClick={() => send(a.type)}
        >
          <span style={{ fontSize: 15, color: "var(--ink)" }}>
            {a.emoji} {a.label}
          </span>
          <span className="muted">→</span>
        </button>
      ))}

      <button className="btn primary" style={{ marginTop: 16, width: "100%" }} disabled={!TIP_URL || tableNumber === null} onClick={leaveTip}>
        💸 Оставить чаевые
      </button>
      {!TIP_URL && (
        <div className="muted" style={{ fontSize: 12, textAlign: "center", marginTop: 6 }}>
          Приём чаевых скоро подключим
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <button className="btn ghost" style={{ width: "100%" }} onClick={() => setShowLost((s) => !s)}>
          Я оставил вещь в заведении
        </button>
      </div>

      {showLost && !lostSent && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="eyebrow">Опишите вещь и где примерно сидели</div>
          <textarea value={lostText} onChange={(e) => setLostText(e.target.value)} style={{ marginBottom: 12 }} />
          <button className="btn primary" disabled={!lostText.trim()} onClick={() => setLostSent(true)}>
            Отправить администратору
          </button>
        </div>
      )}
      {lostSent && (
        <div className="card muted" style={{ marginTop: 12 }}>
          Заявка отправлена, с вами свяжутся
        </div>
      )}

      <div className="muted" style={{ fontSize: 12, textAlign: "center", marginTop: 32 }}>
        Заказ, меню и оплата — в основном боте заведения (Quick Resto)
      </div>
    </div>
  );
}
