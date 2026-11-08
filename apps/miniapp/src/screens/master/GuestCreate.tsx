import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { registerGuest, findGuestByPhone } from "@/data/repo";
import { formatPhoneInput } from "@/lib/phone";

/**
 * Создание карты лояльности гостю силами сотрудника/мастера — тот же
 * набор полей и та же вставка в guests, что и при самостоятельной
 * регистрации гостя по QR (см. screens/guest/GuestAuth.tsx), просто
 * инициирует не сам гость, а сотрудник с его слов (см. обсуждение с
 * Никитой: "и та и та опция должна быть доступна"). Карта лояльности +
 * QR-код для показа гостю уже появляются автоматически — см. GuestProfile.
 *
 * Создание клиента в Quick Resto с привязкой QR к кассе — отдельный шаг,
 * который пока не реализован (нужен снимок реального запроса из админки
 * Quick Resto, см. обсуждение с Никитой); сейчас карта лояльности работает
 * только внутри приложения.
 */
export default function GuestCreate() {
  const navigate = useNavigate();
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "">("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingGuestId, setExistingGuestId] = useState<string | null>(null);

  const canSave = lastName.trim() && firstName.trim() && phone.trim() && birthDate && gender && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    setExistingGuestId(null);
    try {
      const result = await registerGuest({
        phone,
        lastName: lastName.trim(),
        firstName: firstName.trim(),
        middleName: middleName.trim() || undefined,
        birthDate,
        gender: gender as "male" | "female",
      });
      if ("guest" in result) {
        navigate(`/employee/guests/${result.guest.id}`, { replace: true });
        return;
      }
      if (result.error === "duplicate_phone") {
        const existing = await findGuestByPhone(phone);
        setExistingGuestId(existing?.id ?? null);
        setError("Гость с этим номером уже есть в базе.");
      } else {
        setError("Не получилось сохранить — попробуйте ещё раз");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="screen">
      <Link to="/employee/guests" className="muted" style={{ textDecoration: "none", fontSize: 14 }}>
        ← Все гости
      </Link>

      <h1 style={{ marginTop: 8 }}>Создать карту лояльности</h1>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        Фамилия, имя, отчество, телефон и дата рождения — как у гостя в документе.
      </p>

      <div className="card">
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
          onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
          style={{ marginBottom: 10 }}
        />
        <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
          Дата рождения
        </div>
        <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} style={{ marginBottom: 10 }} />

        <button className="btn primary" style={{ width: "100%" }} disabled={!canSave} onClick={handleSave}>
          {saving ? "Сохраняем…" : "Создать карту"}
        </button>

        {error && (
          <div className="muted" style={{ color: "var(--danger)", marginTop: 10, textAlign: "center" }}>
            {error}
            {existingGuestId && (
              <>
                {" "}
                <Link to={`/employee/guests/${existingGuestId}`}>Открыть карту гостя</Link>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
