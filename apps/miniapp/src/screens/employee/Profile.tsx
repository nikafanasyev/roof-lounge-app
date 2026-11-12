import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/data/useStore";
import { formatSalaryModel, getStaffProfile, staffProfileStore, updateStaffProfile, updateStaffProfileById, uploadStaffPhoto, yearsOfService } from "@/data/repo";
import { getTelegramUser } from "@/lib/telegram";
import { ROLE_LABELS } from "@/lib/roles";
import { NameEditor } from "@/components/NameEditor";

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

  const [photoError, setPhotoError] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  async function handlePhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    setPhotoError("");
    const err = await uploadStaffPhoto(profile.id, file);
    setPhotoBusy(false);
    if (err) setPhotoError(err);
  }

  const expirySoon =
    profile.medicalBookExpiry && new Date(profile.medicalBookExpiry).getTime() - Date.now() < 86400000 * 30;

  return (
    <div className="screen">
      <Link to="/employee/more" className="muted" style={{ textDecoration: "none", fontSize: 14 }}>
        ← Ещё
      </Link>
      <h1>Профиль</h1>

      {(photoBusy || photoError) && (
        <div className="muted" style={{ fontSize: 13, marginBottom: 8, color: photoError ? "var(--danger, #e5484d)" : undefined }}>
          {photoBusy ? "Загружаем фото…" : photoError}
        </div>
      )}
      <div className="card" style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <div className="avatar-upload" onClick={() => fileInputRef.current?.click()}>
          {profile.photoUrl ? <img src={profile.photoUrl} alt="" /> : "📷"}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoPick} style={{ display: "none" }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <NameEditor
            name={profile.name}
            fontSize={16}
            onSave={async (next) => {
              const result = await updateStaffProfileById(profile.id, { name: next });
              if (!result || !result.error) updateStaffProfile({ name: next });
              return result;
            }}
          />
          <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
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
      <div className="eyebrow">Должность и роль на смене</div>
      <div className="card muted">
        {[profile.position, profile.role ? ROLE_LABELS[profile.role] : null].filter(Boolean).join(" · ") || "назначает руководитель"}
      </div>

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
