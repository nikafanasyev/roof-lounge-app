import { useRef } from "react";
import { useStore } from "@/data/useStore";
import { formatSalaryModel, getStaffProfile, staffProfileStore, updateStaffProfile, yearsOfService } from "@/data/repo";
import { getTelegramUser } from "@/lib/telegram";

function formatTenure(hiredAt: string): string {
  const { years, months } = yearsOfService(hiredAt);
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} г.`);
  parts.push(`${months} мес.`);
  return parts.join(" ");
}

function formatExpiry(iso?: string): string {
  if (!iso) return "не указано";
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function Profile() {
  useStore(staffProfileStore);
  const profile = getStaffProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const telegramUser = getTelegramUser();

  function handlePhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateStaffProfile({ photoUrl: String(reader.result) });
    reader.readAsDataURL(file);
  }

  const expirySoon =
    profile.medicalBookExpiry && new Date(profile.medicalBookExpiry).getTime() - Date.now() < 86400000 * 30;

  return (
    <div className="screen">
      <h1>Профиль</h1>

      <div className="card" style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <div className="avatar-upload" onClick={() => fileInputRef.current?.click()}>
          {profile.photoUrl ? <img src={profile.photoUrl} alt="" /> : "📷"}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoPick} style={{ display: "none" }} />
        <div>
          <div style={{ fontWeight: 700 }}>{profile.name}</div>
          <div className="muted" style={{ fontSize: 13 }}>
            Стаж: {formatTenure(profile.hiredAt)}
          </div>
          <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 12, marginTop: 6 }} onClick={() => fileInputRef.current?.click()}>
            Сменить фото
          </button>
        </div>
      </div>

      {/* Телефон приходит из Telegram (шаринг контакта — TODO: подключить
          WebApp.requestContact и сохранение в staff.phone), почту и данные
          медкнижки заполняет руководитель. Сотрудник эти поля не редактирует. */}
      <div className="eyebrow">Телефон</div>
      <div className="card muted">{profile.phone || telegramUser?.username || "определится из Telegram"}</div>

      <div className="eyebrow">Почта</div>
      <div className="card muted">{profile.email || "заполняет руководитель"}</div>

      <div className="eyebrow">Медкнижка</div>
      <div className="card">
        <div className="card-row">
          <span className="muted">Номер</span>
          <span>{profile.medicalBookNumber || "не указан"}</span>
        </div>
        <div className="card-row" style={{ marginTop: 8 }}>
          <span className="muted">Действует до</span>
          <span style={{ color: expirySoon ? "var(--warn)" : "var(--ink)" }}>{formatExpiry(profile.medicalBookExpiry)}</span>
        </div>
      </div>
      {expirySoon && (
        <div className="card" style={{ borderColor: "var(--warn)" }}>
          <span className="muted">⚠️ Срок действия медкнижки скоро истекает или уже истёк — сообщи управляющему</span>
        </div>
      )}

      <div className="eyebrow">Модель ЗП</div>
      <div className="card muted">{formatSalaryModel(profile)}</div>
    </div>
  );
}
