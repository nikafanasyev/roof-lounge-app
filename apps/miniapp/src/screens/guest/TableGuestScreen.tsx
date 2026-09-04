import { useState } from "react";
import { useParams } from "react-router-dom";
import { createServiceCall } from "@/data/repo";
import type { ServiceCallType } from "@/types";

// Гостевой экран открывается по QR-коду со стола: t.me/<bot>/app?startapp=table_<token>
// Сейчас номер стола демонстрационно зашит в токен вида "table-7".
function tableNumberFromToken(token: string): number {
  const match = token.match(/\d+/);
  return match ? Number(match[0]) : 1;
}

const ACTIONS: { type: ServiceCallType; label: string; emoji: string }[] = [
  { type: "waiter", label: "Позвать сотрудника", emoji: "🙋" },
  { type: "bill", label: "Попросить счёт", emoji: "🧾" },
  { type: "help", label: "Нужна помощь", emoji: "🆘" },
];

export default function TableGuestScreen() {
  const { token = "table-1" } = useParams();
  const tableNumber = tableNumberFromToken(token);
  const [sent, setSent] = useState<ServiceCallType | null>(null);
  const [showLost, setShowLost] = useState(false);
  const [lostText, setLostText] = useState("");
  const [lostSent, setLostSent] = useState(false);

  function send(type: ServiceCallType) {
    createServiceCall(tableNumber, type);
    setSent(type);
    setTimeout(() => setSent(null), 2500);
  }

  return (
    <div className="app">
      <div className="screen" style={{ paddingTop: 32 }}>
        <div className="eyebrow" style={{ textAlign: "center" }}>
          Roof Lounge · Стол №{tableNumber}
        </div>
        <h1 style={{ textAlign: "center" }}>Чем помочь?</h1>

        {sent && (
          <div className="card" style={{ borderColor: "var(--good)", textAlign: "center" }}>
            Сотрудник уже в курсе — идёт к вам
          </div>
        )}

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

        <div style={{ marginTop: 24 }}>
          <button className="btn ghost" style={{ width: "100%" }} onClick={() => setShowLost((s) => !s)}>
            Я оставил вещь в заведении
          </button>
        </div>

        {showLost && !lostSent && (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="eyebrow">Опишите вещь и где примерно сидели</div>
            <textarea value={lostText} onChange={(e) => setLostText(e.target.value)} style={{ marginBottom: 12 }} />
            <button
              className="btn primary"
              disabled={!lostText.trim()}
              onClick={() => setLostSent(true)}
            >
              Отправить администратору
            </button>
          </div>
        )}
        {lostSent && <div className="card muted" style={{ marginTop: 12 }}>Заявка отправлена, с вами свяжутся</div>}

        <div className="muted" style={{ fontSize: 12, textAlign: "center", marginTop: 32 }}>
          Заказ, меню и оплата — в основном боте заведения (Quick Resto)
        </div>
      </div>
    </div>
  );
}
