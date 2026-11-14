import { useState } from "react";
import { fetchVerifiedPhone, findGuestByPhone, linkGuestToTelegram, registerGuest } from "@/data/repo";
import { formatPhoneInput } from "@/lib/phone";
import { canRequestContact, getTelegramUser, requestTelegramContact } from "@/lib/telegram";
import type { Guest } from "@/types";

/**
 * Вход гостя по телефону, без SMS-подтверждения на старте (см. обсуждение с
 * Никитой 11.10.2026) — номер уже есть в базе -> сразу авторизован,
 * нет -> короткая регистрация (Фамилия/Имя/Отчество, телефон, дата
 * рождения). ФИО разбито на отдельные поля (а не одна строка) — чтобы те
 * же данные позже можно было передать при создании клиента в Quick Resto
 * (см. обсуждение с Никитой про карту лояльности).
 */
export default function GuestAuth({ onAuthed }: { onAuthed: (guest: Guest, isNew: boolean) => void }) {
  const [phone, setPhone] = useState("");
  const [checking, setChecking] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "">("");
  const [birthDate, setBirthDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Номер подтверждён Telegram (кнопка "Поделиться номером") — тогда его нельзя
  // править руками, и профиль привязывается к Telegram-аккаунту.
  const tgUser = getTelegramUser();
  const [verified, setVerified] = useState(false);
  const [manual, setManual] = useState(!(tgUser && canRequestContact()));

  async function handleShare() {
    if (!tgUser) return;
    setChecking(true);
    setError(null);
    try {
      const shared = await requestTelegramContact();
      if (!shared) {
        setError("Без номера не получится — нажмите ещё раз и разрешите");
        return;
      }
      // Бот получает контакт и записывает его в telegram_contacts — ждём до ~15 с.
      let verifiedPhone: string | null = null;
      for (let i = 0; i < 15 && !verifiedPhone; i++) {
        verifiedPhone = await fetchVerifiedPhone(tgUser.id);
        if (!verifiedPhone) await new Promise((r) => setTimeout(r, 1000));
      }
      if (!verifiedPhone) {
        setError("Не дождались подтверждения номера — попробуйте ещё раз");
        setManual(true);
        return;
      }
      setPhone(formatPhoneInput(verifiedPhone));
      setVerified(true);
      const guest = await findGuestByPhone(verifiedPhone);
      if (guest) {
        await linkGuestToTelegram(guest.id, tgUser.id);
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

  async function handleCheck() {
    if (!phone.trim()) return;
    setChecking(true);
    setError(null);
    try {
      const guest = await findGuestByPhone(phone);
      if (guest) {
        if (tgUser) await linkGuestToTelegram(guest.id, tgUser.id);
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
    if (!lastName.trim() || !firstName.trim() || !phone.trim() || !birthDate || !gender) return;
    setSaving(true);
    setError(null);
    try {
      const result = await registerGuest({
        phone,
        lastName: lastName.trim(),
        firstName: firstName.trim(),
        middleName: middleName.trim() || undefined,
        birthDate,
        gender,
        telegramId: tgUser?.id,
      });
      if ("guest" in result) {
        onAuthed(result.guest, true);
      } else if (result.error === "duplicate_phone") {
        setError("Этот номер уже зарегистрирован — попробуйте войти");
      } else {
        setError(`Не получилось зарегистрироваться — попробуйте ещё раз${result.detail ? ` (${result.detail})` : ""}`);
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
        {!manual ? (
          <>
            <p className="muted" style={{ textAlign: "center", marginTop: -8 }}>
              Поделитесь номером телефона — по нему мы найдём ваши бонусы и вкусовой профиль
            </p>
            <button className="btn primary" style={{ marginTop: 16, width: "100%" }} disabled={checking} onClick={handleShare}>
              {checking ? "Проверяем…" : "Поделиться номером"}
            </button>
          </>
        ) : (
          <>
            <p className="muted" style={{ textAlign: "center", marginTop: -8 }}>
              Введите номер телефона
            </p>
            <input
              type="tel"
              placeholder="+7 900 000-00-00"
              value={phone}
              onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
              style={{ marginTop: 16, marginBottom: 12, fontSize: 18, textAlign: "center" }}
            />
            <button className="btn primary" disabled={!phone.trim() || checking} onClick={handleCheck}>
              {checking ? "Проверяем…" : "Продолжить"}
            </button>
          </>
        )}
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
        <input
          type="text"
          placeholder="Фамилия"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          style={{ marginBottom: 10 }}
        />
        <input
          type="text"
          placeholder="Имя"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          style={{ marginBottom: 10 }}
        />
        <input
          type="text"
          placeholder="Отчество (если есть)"
          value={middleName}
          onChange={(e) => setMiddleName(e.target.value)}
          style={{ marginBottom: 10 }}
        />
        {/* Выбор пола — не просили у Никиты в исходном списке полей, но
            Quick Resto требует его при создании клиента (crm.customer),
            поэтому добавили сюда же (см. обсуждение с Никитой). */}
        <select
          value={gender}
          onChange={(e) => setGender(e.target.value as "male" | "female" | "")}
          style={{ marginBottom: 10, width: "100%" }}
        >
          <option value="">Пол</option>
          <option value="male">Мужской</option>
          <option value="female">Женский</option>
        </select>
        <input
          type="tel"
          placeholder="Телефон"
          value={phone}
          readOnly={verified}
          onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
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
          disabled={!lastName.trim() || !firstName.trim() || !phone.trim() || !birthDate || !gender || saving}
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
