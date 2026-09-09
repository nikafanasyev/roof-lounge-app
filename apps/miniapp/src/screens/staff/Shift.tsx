import { useState } from "react";
import { useStore } from "@/data/useStore";
import {
  closeShift,
  isChecklistComplete,
  openShift,
  shiftStore,
  toggleCloseChecklistItem,
  toggleOpenChecklistItem,
} from "@/data/repo";
import CameraCapture from "@/components/CameraCapture";
import type { ChecklistItem, StaffRole } from "@/types";

const CURRENT_STAFF_NAME = "Никита Афанасьев"; // заглушка до подключения Telegram-авторизации

// Пока нет привязки роли к сотруднику через График — сотрудник выбирает сам,
// за что отвечает в эту смену (бар или кальяны), и это запоминается на
// устройстве. Когда появится распределение ролей в Графике — заменить на
// значение оттуда.
const ROLE_STORAGE_KEY = "roofLounge.staffRole";
const ROLE_LABELS: Record<StaffRole, string> = { bar: "Бар", hookah: "Кальяны" };

function loadStoredRole(): StaffRole {
  const stored = localStorage.getItem(ROLE_STORAGE_KEY);
  return stored === "bar" || stored === "hookah" ? stored : "bar";
}

interface CapturedPhoto {
  url: string;
  blob: Blob;
}

/** Чек-лист с пунктами, сгруппированными по секции (если она задана в данных). */
function ChecklistGroups({
  items,
  onToggle,
}: {
  items: ChecklistItem[];
  onToggle: (itemId: string) => void;
}) {
  const groups: { section?: string; items: ChecklistItem[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.section === item.section) {
      last.items.push(item);
    } else {
      groups.push({ section: item.section, items: [item] });
    }
  }
  return (
    <>
      {groups.map((group, idx) => (
        <div key={idx}>
          {group.section && (
            <div className="eyebrow" style={{ marginTop: idx === 0 ? 0 : 12 }}>
              {group.section}
            </div>
          )}
          {group.items.map((item) => (
            <label key={item.id} className="card card-row" style={{ cursor: "pointer" }}>
              <span>{item.label}</span>
              <input type="checkbox" checked={item.done} onChange={() => onToggle(item.id)} />
            </label>
          ))}
        </div>
      ))}
    </>
  );
}

export default function Shift() {
  const shift = useStore(shiftStore);
  const [role, setRole] = useState<StaffRole>(loadStoredRole);
  const [handoverNote, setHandoverNote] = useState("");
  const [openPhoto, setOpenPhoto] = useState<CapturedPhoto | undefined>();
  const [closePhoto, setClosePhoto] = useState<CapturedPhoto | undefined>();

  const roleShift = role === "bar" ? shift.bar : shift.hookah;

  function selectRole(next: StaffRole) {
    setRole(next);
    localStorage.setItem(ROLE_STORAGE_KEY, next);
  }

  const openReady = isChecklistComplete(roleShift.openChecklist) && !!openPhoto;
  const closeReady = isChecklistComplete(roleShift.closeChecklist) && !!closePhoto;

  // Статус смены приходит из Quick Resto (ПИН на терминале) и становится
  // "открыта" сразу, как только кто-то из сотрудников вошёл — то есть до
  // того, как каждый успевает отметить свой чек-лист открытия в приложении.
  // Поэтому какой чек-лист показывать решаем не по одному статусу, а ещё и
  // по тому, отмечен ли уже чек-лист открытия выбранной роли.
  const openChecklistDone = isChecklistComplete(roleShift.openChecklist);
  const showOpenChecklist = shift.status === "closed" || !openChecklistDone;

  return (
    <div className="screen">
      <h1>Смена</h1>

      <div className="card">
        <div className="card-row">
          <span>
            <span className={`badge-dot ${shift.status === "open" ? "done" : "open"}`} />
            Статус: {shift.status === "open" ? "открыта" : "закрыта"}
          </span>
        </div>
        {shift.openedAt && (
          <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
            Открыта в {new Date(shift.openedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
            {shift.openedBy ? ` · ${shift.openedBy}` : ""}
          </div>
        )}
      </div>

      <div className="eyebrow" style={{ marginTop: 4 }}>
        Моя зона на этой смене
      </div>
      <div className="card-row" style={{ gap: 8 }}>
        {(Object.keys(ROLE_LABELS) as StaffRole[]).map((r) => (
          <button
            key={r}
            className={`btn ${role === r ? "primary" : ""}`}
            style={{ flex: 1 }}
            onClick={() => selectRole(r)}
          >
            {ROLE_LABELS[r]}
          </button>
        ))}
      </div>

      {showOpenChecklist && (
        <>
          <h2>Чек-лист открытия — {ROLE_LABELS[role]}</h2>
          <ChecklistGroups items={roleShift.openChecklist} onToggle={(id) => toggleOpenChecklistItem(role, id)} />

          <div className="eyebrow" style={{ marginTop: 8 }}>
            Фото на месте (со штампом даты и времени, уходит руководителю в Telegram)
          </div>
          <CameraCapture
            previewUrl={openPhoto?.url}
            onCapture={(url, blob) => setOpenPhoto({ url, blob })}
            label="Сфотографироваться в заведении"
          />

          <button
            className="btn primary"
            style={{ marginTop: 12 }}
            disabled={!openReady}
            onClick={() => {
              openShift(role, CURRENT_STAFF_NAME, openPhoto?.blob);
              setOpenPhoto(undefined);
            }}
          >
            {openReady ? "Отправить" : !isChecklistComplete(roleShift.openChecklist) ? "Отметьте все пункты" : "Сделайте фото"}
          </button>
        </>
      )}

      {shift.status === "open" && !showOpenChecklist && (
        <>
          <h2>Чек-лист закрытия — {ROLE_LABELS[role]}</h2>
          <ChecklistGroups items={roleShift.closeChecklist} onToggle={(id) => toggleCloseChecklistItem(role, id)} />

          <div className="eyebrow" style={{ marginTop: 8 }}>
            Фото контрольных зон (со штампом даты и времени, уходит руководителю в Telegram)
          </div>
          <CameraCapture
            previewUrl={closePhoto?.url}
            onCapture={(url, blob) => setClosePhoto({ url, blob })}
            label="Сфотографировать зал"
          />

          <div className="eyebrow" style={{ marginTop: 12 }}>
            Передача смены (заметка для следующей)
          </div>
          <textarea
            value={handoverNote}
            onChange={(e) => setHandoverNote(e.target.value)}
            placeholder="Например: стол №4 — проблема с розеткой, завтра бронь на 12 человек"
            style={{ marginBottom: 16 }}
          />

          <button
            className="btn primary"
            disabled={!closeReady}
            onClick={() => {
              closeShift(role, CURRENT_STAFF_NAME, handoverNote || undefined, closePhoto?.blob);
              setClosePhoto(undefined);
              setHandoverNote("");
            }}
          >
            {closeReady ? "Отправить" : !isChecklistComplete(roleShift.closeChecklist) ? "Отметьте все пункты" : "Сделайте фото"}
          </button>
        </>
      )}

      {shift.handoverNote && shift.status === "closed" && (
        <>
          <div className="eyebrow" style={{ marginTop: 20 }}>
            Заметка предыдущей смены
          </div>
          <div className="card muted">{shift.handoverNote}</div>
        </>
      )}
    </div>
  );
}
