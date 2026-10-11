import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { createServiceCall, touchGuestVisit } from "@/data/repo";
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
export default function GuestHome({ guest, tableNumber }: { guest: Guest; tableNumber: number }) {
  const [sent, setSent] = useState<ServiceCallType | null>(null);
  const [showLost, setShowLost] = useState(false);
  const [lostText, setLostText] = useState("");
  const [lostSent, setLostSent] = useState(false);
  // "Последний визит" на экране — это значение ДО текущего обновления, поэтому
  // сохраняем его один раз при монтировании, а не читаем guest.lastVisitAt
  // напрямую (иначе отметка текущего визита сразу перезаписала бы дату
  // прошлого визита на экране).
  const [lastVisitShown] = useState(guest.lastVisitAt);

  useEffect(() => {
    touchGuestVisit(guest.id);
  }, [guest.id]);

  function send(type: ServiceCallType) {
    createServiceCall(tableNumber, type, guest.id);
    setSent(type);
    setTimeout(() => setSent(null), 2500);
  }

  function leaveTip() {
    if (!TIP_URL) return;
    const url = `${TIP_URL}${TIP_URL.includes("?") ? "&" : "?"}table=${tableNumber}`;
    window.location.href = url;
  }

  return (
    <div className="screen" style={{ paddingTop: 24 }}>
      <div className="eyebrow" style={{ textAlign: "center" }}>
        Roof Lounge · Стол №{tableNumber}
      </div>
      <h1 style={{ textAlign: "center" }}>{guest.displayName}</h1>

      <div className="card" style={{ textAlign: "center", padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <QRCodeSVG value={guest.loyaltyCode ?? guest.id} size={160} />
        </div>
        <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
          Код лояльности: {guest.loyaltyCode ?? "—"}
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-tile">
          <div className="value" style={{ color: "var(--accent)" }}>
            {guest.bonusPoints ?? 0}
          </div>
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

      <h2>Позвать</h2>
      {ACTIONS.map((a) => (
        <button
          key={a.type}
          className="card card-row"
          style={{ width: "100%", border: "1px solid var(--border)", cursor: "pointer", background: "var(--surface)" }}
          onClick={() => send(a.type)}
        >
          <span style={{ fontSize: 15, color: "var(--ink)" }}>
            {a.emoji} {a.label}
          </span>
          <span className="muted">→</span>
        </button>
      ))}

      <button className="btn primary" style={{ marginTop: 16, width: "100%" }} disabled={!TIP_URL} onClick={leaveTip}>
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
