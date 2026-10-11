import { useState } from "react";
import { findGuestByPhone, registerGuest } from "@/data/repo";
import type { Guest } from "@/types";

/**
 * Вход гостя по телефону, без SMS-подтверждения на старте (см. обсуждение с
 * Никитой 11.10.2026) — номер уже есть в базе -> сразу авторизован,
 * нет -> короткая регистрация (ФИО, телефон, дата рождения).
 */
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
          onChange={(e) => setPhone(e.target.value)}
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
        <input placeholder="ФИО" value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 10 }} />
        <input type="tel" placeholder="Телефон" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ marginBottom: 10 }} />
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
