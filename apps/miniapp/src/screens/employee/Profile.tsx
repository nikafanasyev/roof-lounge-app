import { useRef, useState } from "react";
import { useStore } from "@/data/useStore";
import { getStaffProfile, staffProfileStore, updateStaffProfile, yearsOfService } from "@/data/repo";

function formatTenure(hiredAt: string): string {
  const { years, months } = yearsOfService(hiredAt);
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} г.`);
  parts.push(`${months} мес.`);
  return parts.join(" ");
}

export default function Profile() {
  useStore(staffProfileStore);
  const profile = getStaffProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [phone, setPhone] = useState(profile.phone ?? "");
  const [email, setEmail] = useState(profile.email ?? "");
  const [medicalBookNumber, setMedicalBookNumber] = useState(profile.medicalBookNumber ?? "");
  const [medicalBookExpiry, setMedicalBookExpiry] = useState(profile.medicalBookExpiry?.slice(0, 10) ?? "");

  function handlePhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateStaffProfile({ photoUrl: String(reader.result) });
    reader.readAsDataURL(file);
  }

  function save() {
    updateStaffProfile({
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      medicalBookNumber: medicalBookNumber.trim() || undefined,
      medicalBookExpiry: medicalBookExpiry ? new Date(medicalBookExpiry).toISOString() : undefined,
    });
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

      <div className="eyebrow">Телефон</div>
      <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 900 000-00-00" style={{ marginBottom: 12 }} />

      <div className="eyebrow">Почта</div>
      <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" style={{ marginBottom: 12 }} />

      <div className="eyebrow">Номер медкнижки</div>
      <input type="text" value={medicalBookNumber} onChange={(e) => setMedicalBookNumber(e.target.value)} style={{ marginBottom: 12 }} />

      <div className="eyebrow">Действует до</div>
      <input type="date" value={medicalBookExpiry} onChange={(e) => setMedicalBookExpiry(e.target.value)} style={{ marginBottom: 12 }} />
      {expirySoon && (
        <div className="card" style={{ borderColor: "var(--warn)", marginTop: -4 }}>
          <span className="muted">⚠️ Срок действия медкнижки скоро истекает или уже истёк — сообщи управляющему</span>
        </div>
      )}

      <div className="eyebrow">Модель ЗП</div>
      <div className="card muted">{profile.salaryModel}</div>

      <button className="btn primary" onClick={save} style={{ marginTop: 8 }}>
        Сохранить
      </button>
    </div>
  );
}
