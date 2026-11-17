import { useEffect, useState } from "react";
import { useStore } from "@/data/useStore";
import {
  closeShift,
  getCurrentStaffRole,
  getStaffProfile,
  isChecklistComplete,
  openShift,
  setCurrentStaffRole,
  shiftStore,
  toggleCloseChecklistItem,
  toggleOpenChecklistItem,
} from "@/data/repo";
import CameraCapture from "@/components/CameraCapture";
import { fetchMyArrivalToday, fetchMyShiftTimesToday, getTodayCleaningTasksForRole, recordArrival, recordDeparture, staffProfileStore, techRoleKeyForWorkRole } from "@/data/repo";
import type { ChecklistItem, StaffRole } from "@/types";

const ROLE_LABELS: Record<StaffRole, string> = { bar: "Бар", hookah: "Кальяны" };

const SHIFT_PHOTOS = 3;

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

function ZoneShift() {
  const shift = useStore(shiftStore);
  const [role, setRole] = useState<StaffRole>(getCurrentStaffRole);
  const [handoverNote, setHandoverNote] = useState("");
  const [openPhotos, setOpenPhotos] = useState<(CapturedPhoto | undefined)[]>(() => Array(SHIFT_PHOTOS).fill(undefined));
  const [closePhotos, setClosePhotos] = useState<(CapturedPhoto | undefined)[]>(() => Array(SHIFT_PHOTOS).fill(undefined));
  const openCount = openPhotos.filter(Boolean).length;
  const closeCount = closePhotos.filter(Boolean).length;

  const roleShift = role === "bar" ? shift.bar : shift.hookah;

  function selectRole(next: StaffRole) {
    setRole(next);
    setCurrentStaffRole(next);
  }

  const openReady = isChecklistComplete(roleShift.openChecklist) && openCount === SHIFT_PHOTOS;
  const closeReady = isChecklistComplete(roleShift.closeChecklist) && closeCount === SHIFT_PHOTOS;

  // У каждой зоны (бар/кальяны) своё открытие и закрытие, по отметке самой
  // зоны, а не по общему статусу смены: смену могут открыть двое сотрудников,
  // каждый — свою зону (фидбек Никиты 12.11.2026).
  const roleOpened = !!roleShift.openedAt;
  const roleClosed = !!roleShift.closedAt;
  const showOpenChecklist = !roleOpened;
  const showCloseChecklist = roleOpened && !roleClosed;
  const techKey = techRoleKeyForWorkRole(role);
  const techTasks = techKey ? getTodayCleaningTasksForRole(techKey) : [];

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

      <div className="card">
        {(Object.keys(ROLE_LABELS) as StaffRole[]).map((r) => {
          const rs = r === "bar" ? shift.bar : shift.hookah;
          const state = rs.closedAt ? "закрыта" : rs.openedAt ? "открыта" : "не открыта";
          return (
            <div key={r} className="card-row" style={{ marginTop: r === "bar" ? 0 : 8 }}>
              <span>{ROLE_LABELS[r]}</span>
              <span className="muted" style={{ fontSize: 13 }}>
                {state}
                {rs.openedBy && !rs.closedAt ? ` · ${rs.openedBy}` : ""}
              </span>
            </div>
          );
        })}
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
          {openPhotos.map((ph, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <CameraCapture
                previewUrl={ph?.url}
                onCapture={(url, blob) => setOpenPhotos((l) => l.map((x, j) => (j === i ? { url, blob } : x)))}
                label={`Фото ${i + 1} из ${SHIFT_PHOTOS}`}
              />
            </div>
          ))}

          <button
            className="btn primary"
            style={{ marginTop: 12 }}
            disabled={!openReady}
            onClick={() => {
              openShift(role, getStaffProfile().name, openPhotos.filter((x): x is CapturedPhoto => !!x).map((x) => x.blob));
              setOpenPhotos(Array(SHIFT_PHOTOS).fill(undefined));
            }}
          >
            {openReady ? "Отправить" : !isChecklistComplete(roleShift.openChecklist) ? "Отметьте все пункты" : `Сделайте фото (${openCount} из ${SHIFT_PHOTOS})`}
          </button>
        </>
      )}

      {roleOpened && !roleClosed && (
        <>
          <div className="eyebrow" style={{ marginTop: 20 }}>
            Тех. задача на сегодня
          </div>
          {techTasks.length === 0 && <div className="card muted">На сегодня тех. задач нет</div>}
          {techTasks.map((t, i) => (
            <div key={i} className="card">
              <div>{t.task}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {t.note}
              </div>
            </div>
          ))}
        </>
      )}

      {showCloseChecklist && (
        <>
          <h2>Чек-лист закрытия — {ROLE_LABELS[role]}</h2>
          <ChecklistGroups items={roleShift.closeChecklist} onToggle={(id) => toggleCloseChecklistItem(role, id)} />

          <div className="eyebrow" style={{ marginTop: 8 }}>
            Фото контрольных зон (со штампом даты и времени, уходит руководителю в Telegram)
          </div>
          {closePhotos.map((ph, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <CameraCapture
                previewUrl={ph?.url}
                onCapture={(url, blob) => setClosePhotos((l) => l.map((x, j) => (j === i ? { url, blob } : x)))}
                label={`Фото ${i + 1} из ${SHIFT_PHOTOS}`}
              />
            </div>
          ))}

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
              closeShift(role, getStaffProfile().name, handoverNote || undefined, closePhotos.filter((x): x is CapturedPhoto => !!x).map((x) => x.blob));
              setClosePhotos(Array(SHIFT_PHOTOS).fill(undefined));
              setHandoverNote("");
            }}
          >
            {closeReady ? "Отправить" : !isChecklistComplete(roleShift.closeChecklist) ? "Отметьте все пункты" : `Сделайте фото (${closeCount} из ${SHIFT_PHOTOS})`}
          </button>
        </>
      )}

      {roleOpened && roleClosed && (
        <div className="card muted" style={{ marginTop: 12 }}>
          Зона «{ROLE_LABELS[role]}» закрыта{roleShift.closedBy ? ` · ${roleShift.closedBy}` : ""}.
        </div>
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

/** Кухня и клининг: без чек-листа — кнопка "Открыть смену" + фото на месте. */
function SimpleShift({ role }: { role: "kitchen" | "cleaning" | "waiter" }) {
  const [openedAt, setOpenedAt] = useState<string | undefined>();
  const [closedAt, setClosedAt] = useState<string | undefined>();
  const [closePhoto, setClosePhoto] = useState<CapturedPhoto | undefined>();
  const [photo, setPhoto] = useState<CapturedPhoto | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (role === "waiter") {
      fetchMyShiftTimesToday().then((t) => {
        setOpenedAt(t.openedAt);
        setClosedAt(t.closedAt);
      });
    } else {
      fetchMyArrivalToday().then(setOpenedAt);
    }
  }, [role]);
  const techKey = techRoleKeyForWorkRole(role);
  const techTasks = techKey ? getTodayCleaningTasksForRole(techKey) : [];

  async function open() {
    if (!photo) return;
    setBusy(true);
    setError("");
    const res = await recordArrival(role, photo.blob);
    setBusy(false);
    if (!res.ok) return setError("Не получилось открыть смену, попробуйте ещё раз");
    setOpenedAt(res.openedAt);
    setPhoto(undefined);
  }

  async function close() {
    if (!closePhoto) return;
    setBusy(true);
    setError("");
    const res = await recordDeparture(role, closePhoto.blob);
    setBusy(false);
    if (!res.ok) return setError("Не получилось закрыть смену, попробуйте ещё раз");
    setClosedAt(res.closedAt);
    setClosePhoto(undefined);
  }

  return (
    <div className="screen">
      <h1>Смена</h1>
      {!openedAt ? (
        <>
          <div className="eyebrow">Фото на месте (со штампом даты и времени, уходит руководителю в Telegram)</div>
          <CameraCapture previewUrl={photo?.url} onCapture={(url, blob) => setPhoto({ url, blob })} label="Сфотографироваться в заведении" />
          {error && <div style={{ color: "var(--danger, #e5484d)", fontSize: 13, marginTop: 8 }}>{error}</div>}
          <button className="btn primary" style={{ marginTop: 12, width: "100%" }} disabled={!photo || busy} onClick={open}>
            {busy ? "Открываем…" : photo ? "Открыть смену" : "Сделайте фото"}
          </button>
        </>
      ) : (
        <>
          <div className="card">
            <span className="badge-dot done" />
            Смена открыта в {new Date(openedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
          </div>
          <div className="eyebrow" style={{ marginTop: 20 }}>
            Тех. задача на сегодня
          </div>
          {techTasks.length === 0 && <div className="card muted">На сегодня тех. задач нет</div>}
          {techTasks.map((t, i) => (
            <div key={i} className="card">
              <div>{t.task}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {t.note}
              </div>
            </div>
          ))}
          {role === "waiter" && !closedAt && (
            <>
              <div className="eyebrow" style={{ marginTop: 20 }}>
                Закрытие смены: фото (со штампом даты и времени)
              </div>
              <CameraCapture previewUrl={closePhoto?.url} onCapture={(url, blob) => setClosePhoto({ url, blob })} label="Сфотографировать зал" />
              {error && <div style={{ color: "var(--danger, #e5484d)", fontSize: 13, marginTop: 8 }}>{error}</div>}
              <button className="btn primary" style={{ marginTop: 12, width: "100%" }} disabled={!closePhoto || busy} onClick={close}>
                {busy ? "Закрываем…" : closePhoto ? "Закрыть смену" : "Сделайте фото"}
              </button>
            </>
          )}
          {role === "waiter" && closedAt && (
            <div className="card" style={{ marginTop: 12 }}>
              <span className="badge-dot done" />
              Смена закрыта в {new Date(closedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function Shift() {
  const me = useStore(staffProfileStore);
  if (me.role === "kitchen" || me.role === "cleaning" || me.role === "waiter") return <SimpleShift role={me.role} />;
  return <ZoneShift />;
}
