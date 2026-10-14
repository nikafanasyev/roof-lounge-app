import { useState } from "react";
import { findGuestByPhone, registerGuest } from "@/data/repo";
import type { Guest } from "@/types";

/**
 * Вход гостя по телефону, без SMS-подтверждения на старте (см. обсуждение с
 * Никитой 11.10.2026) — номер уже есть в базе -> сразу авторизован,
 * нет -> короткая регистрация (ФИО, телефон, дата рождения).
 */
// Если начали печатать номер с "9" (а не с "+7"/"8") — подставляем "+7"
// впереди: так привычнее печатать мобильный номер без кода страны, не
// думая о нём (см. запрос Никиты 14.10.2026). Срабатывает только пока вся
// строка состоит из цифр, начинающихся с 9 — после подстановки строка уже
// начинается на "+7" и под регулярку не попадает повторно.
function autoPrefixPhone(raw: string): string {
  return /^9\d*$/.test(raw) ? `+7${raw}` : raw;
}

export default function GuestAuth({ onAuthed }: { onAuthed: (guest: Guest, isNew: boolean) => void }) {
  const [phone, setPhone] = useState("");
  const [checking, setChecking] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheck() {
    if (!phone.trim()) return;
    setChecking(true);
    setError(null);
    try {
      const guest = await findGuestByPhone(phone);
      if (guest) {
        onAuthed(guest, false);
      } else {
        setNotFound(true);
      }
    } catch {
      setError("Не получилось проверить номер — попробуйте ещё раз");
    } finally {
      setChecking(false);
    }
  }

  async function handleRegister() {
    if (!name.trim() || !phone.trim() || !birthDate) return;
    setSaving(true);
    setError(null);
    try {
      const guest = await registerGuest({ phone, displayName: name.trim(), birthDate });
      if (guest) {
        onAuthed(guest, true);
      } else {
        setError("Не получилось зарегистрироваться — попробуйте ещё раз");
      }
    } finally {
      setSaving(false);
    }
  }

  if (!notFound) {
    return (
      <div className="screen" style={{ paddingTop: 32 }}>
        <div className="eyebrow" style={{ textAlign: "center" }}>
          Roof Lounge
        </div>
        <h1 style={{ textAlign: "center" }}>Добро пожаловать</h1>
        <p className="muted" style={{ textAlign: "center", marginTop: -8 }}>
          Введите номер телефона
        </p>
        <input
          type="tel"
          placeholder="+7 900 000-00-00"
          value={phone}
          onChange={(e) => setPhone(autoPrefixPhone(e.target.value))}
          style={{ marginTop: 16, marginBottom: 12, fontSize: 18, textAlign: "center" }}
        />
        <button className="btn primary" disabled={!phone.trim() || checking} onClick={handleCheck}>
          {checking ? "Проверяем…" : "Продолжить"}
        </button>
        {error && (
          <div className="muted" style={{ color: "var(--danger)", marginTop: 10, textAlign: "center" }}>
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="screen" style={{ paddingTop: 32 }}>
      <div className="eyebrow" style={{ textAlign: "center" }}>
        Roof Lounge
      </div>
      <h1 style={{ textAlign: "center" }}>Знакомимся</h1>
      <p className="muted" style={{ textAlign: "center", marginTop: -8 }}>
        Вы у нас впервые — пара слов о вас
      </p>
      <div className="card" style={{ marginTop: 16 }}>
        <input type="text" placeholder="ФИО" value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 10 }} />
        <input
          type="tel"
          placeholder="Телефон"
          value={phone}
          onChange={(e) => setPhone(autoPrefixPhone(e.target.value))}
          style={{ marginBottom: 10 }}
        />
        {/* Пустой input[type=date] без подписи не объясняет, что он вводит —
            выглядит "поплывшим" полем без смысла (см. скриншот и обсуждение
            с Никитой 14.10.2026). Подпись над полем снимает вопрос. */}
        <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
          Дата рождения
        </div>
        <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} style={{ marginBottom: 10 }} />
        <button
          className="btn primary"
          style={{ width: "100%" }}
          disabled={!name.trim() || !phone.trim() || !birthDate || saving}
          onClick={handleRegister}
        >
          {saving ? "Сохраняем…" : "Готово"}
        </button>
      </div>
      {error && (
        <div className="muted" style={{ color: "var(--danger)", marginTop: 10, textAlign: "center" }}>
          {error}
        </div>
      )}
    </div>
  );
}
