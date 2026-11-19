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
import { isCurrentUserManager } from "@/lib/telegram";
import { businessDateIso, fetchMyArrivalToday, fetchMyShiftTimesToday, fetchTodayArrivals, getTechTasksForRoleOnDate, loadTechMarks, markTechTaskDoneByStaff, techMarkFor, techMarksStore, techTasksStore, recordArrival, recordDeparture, scheduleStore, sendTechPhotos, staffProfileStore, techRoleKeyForWorkRole } from "@/data/repo";
import type { TodayArrival } from "@/data/repo";
import { ROLE_LABELS as ALL_ROLE_LABELS } from "@/lib/roles";
import type { ChecklistItem, StaffRole, WorkRole } from "@/types";

const ROLE_LABELS: Record<StaffRole, string> = { bar: "Бар", hookah: "Кальяны" };

const MAX_SHIFT_PHOTOS = 3; // обязательна минимум одна, максимум три

interface CapturedPhoto {
  url: string;
  blob: Blob;
}

/** Одно окно для фото смены: первое обязательно, можно добавить до MAX_SHIFT_PHOTOS. */
function PhotoSet({ photos, onChange }: { photos: CapturedPhoto[]; onChange: (next: CapturedPhoto[]) => void }) {
  return (
    <div>
      {photos.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          {photos.map((ph, i) => (
            <div key={ph.url} style={{ position: "relative", width: 96, height: 96 }}>
              <img src={ph.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8, display: "block" }} />
              <button
                type="button"
                aria-label="Убрать фото"
                onClick={() => onChange(photos.filter((_, j) => j !== i))}
                style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 11, border: "none", background: "rgba(0,0,0,0.6)", color: "#fff", cursor: "pointer", lineHeight: "22px", padding: 0 }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      {photos.length < MAX_SHIFT_PHOTOS && (
        <CameraCapture
          onCapture={(url, blob) => onChange([...photos, { url, blob }])}
          label={photos.length === 0 ? "Сделать фото (обязательно)" : `Добавить фото (${photos.length} из ${MAX_SHIFT_PHOTOS})`}
        />
      )}
    </div>
  );
}

/** Отправка фото выполнения тех. задачи руководителю (до трёх фото, минимум одно). */
function TechPhotoSender({ role, task }: { role: WorkRole; task: string }) {
  useStore(techMarksStore);
  useStore(techTasksStore);
  const today = businessDateIso();
  const roleKey = techRoleKeyForWorkRole(role) ?? "";
  useEffect(() => {
    loadTechMarks(today, today);
  }, [today]);
  const mark = techMarkFor(today, roleKey, task);
  const [open, setOpen] = useState(false);
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    setBusy(true);
    setError("");
    const ok = await sendTechPhotos(role, task, photos.map((p) => p.blob));
    setBusy(false);
    if (!ok) return setError("Не получилось отправить, попробуйте ещё раз");
    if (roleKey) void markTechTaskDoneByStaff(today, roleKey, task);
    setSent(true);
    setOpen(false);
    setPhotos([]);
  }

  if (mark?.approvedAt && !open) {
    return (
      <div className="muted" style={{ fontSize: 13, margin: "-4px 0 12px 4px", color: "var(--good, #3fb950)" }}>
        ✓ Принято руководителем
      </div>
    );
  }
  if ((sent || mark?.doneAt) && !open) {
    return (
      <div className="muted" style={{ fontSize: 13, margin: "-4px 0 12px 4px" }}>
        ✓ Отмечено выполненным · ждёт проверки руководителя{" "}
        <button type="button" className="btn ghost" style={{ padding: "2px 8px", fontSize: 12 }} onClick={() => { setSent(false); setOpen(true); }}>
          ещё фото
        </button>
      </div>
    );
  }
  if (!open) {
    return (
      <button className="btn secondary" style={{ width: "100%", margin: "-4px 0 12px" }} onClick={() => setOpen(true)}>
        📸 Отправить фото выполнения
      </button>
    );
  }
  return (
    <div className="card" style={{ marginTop: -4 }}>
      <div className="eyebrow">Фото выполненной работы (со штампом даты и времени)</div>
      <PhotoSet photos={photos} onChange={setPhotos} />
      {error && <div style={{ color: "var(--danger, #e5484d)", fontSize: 13, marginTop: 8 }}>{error}</div>}
      <div className="btn-row" style={{ marginTop: 10 }}>
        <button className="btn primary" disabled={photos.length === 0 || busy} onClick={send}>
          {busy ? "Отправляем…" : photos.length === 0 ? "Сделайте фото" : "Отправить"}
        </button>
        <button className="btn secondary" onClick={() => { setOpen(false); setPhotos([]); }}>
          Отмена
        </button>
      </div>
    </div>
  );
}

/** Статусы всех зон сегодня: бар и кальяны из смены заведения, остальные — по отметкам прихода и графику. */
function ZoneStatuses({ shift }: { shift: ReturnType<typeof shiftStore.get> }) {
  const schedule = useStore(scheduleStore);
  const [arrivals, setArrivals] = useState<TodayArrival[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => fetchTodayArrivals().then((a) => alive && setArrivals(a));
    load();
    const t = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  const today = businessDateIso();
  const scheduled = new Set(schedule.filter((e) => e.date.slice(0, 10) === today).map((e) => e.role));
  const order: WorkRole[] = ["bar", "hookah", "waiter", "kitchen", "cleaning"];

  return (
    <div className="card">
      {order.map((r, i) => {
        let state: string;
        let who: string | undefined;
        if (r === "bar" || r === "hookah") {
          const rs = r === "bar" ? shift.bar : shift.hookah;
          state = rs.closedAt ? "закрыта" : rs.openedAt ? "открыта" : "не открыта";
          who = rs.openedBy && !rs.closedAt ? rs.openedBy : undefined;
        } else {
          const list = arrivals.filter((a) => a.role === r);
          const active = list.find((a) => !a.closedAt);
          if (active) {
            state = "открыта";
            who = active.staffName;
          } else if (list.length > 0) {
            state = "закрыта";
          } else {
            state = scheduled.has(r) ? "не открыта" : "нет в графике";
          }
        }
        return (
          <div key={r} className="card-row" style={{ marginTop: i === 0 ? 0 : 8 }}>
            <span>{ALL_ROLE_LABELS[r]}</span>
            <span className="muted" style={{ fontSize: 13 }}>
              {state}
              {who ? ` · ${who}` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
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
  const [openPhotos, setOpenPhotos] = useState<CapturedPhoto[]>([]);
  const [closePhotos, setClosePhotos] = useState<CapturedPhoto[]>([]);

  const roleShift = role === "bar" ? shift.bar : shift.hookah;

  function selectRole(next: StaffRole) {
    setRole(next);
    setCurrentStaffRole(next);
  }

  const openReady = isChecklistComplete(roleShift.openChecklist) && openPhotos.length >= 1;
  const closeReady = isChecklistComplete(roleShift.closeChecklist) && closePhotos.length >= 1;

  // У каждой зоны (бар/кальяны) своё открытие и закрытие, по отметке самой
  // зоны, а не по общему статусу смены: смену могут открыть двое сотрудников,
  // каждый — свою зону (фидбек Никиты 12.11.2026).
  const roleOpened = !!roleShift.openedAt;
  const roleClosed = !!roleShift.closedAt;
  const showOpenChecklist = !roleOpened;
  // Закрыть зону может тот, кто её открыл, или руководитель — чтобы сотрудник
  // не закрывал чужую зону (фидбек Никиты 19.11.2026).
  const myName = getStaffProfile().name;
  const canCloseZone = !roleShift.openedBy || roleShift.openedBy === myName || isCurrentUserManager();
  const showCloseChecklist = roleOpened && !roleClosed && canCloseZone;
  const techKey = techRoleKeyForWorkRole(role);
  const techTasks = techKey ? getTechTasksForRoleOnDate(techKey, businessDateIso()) : [];

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

      <ZoneStatuses shift={shift} />

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
          <PhotoSet photos={openPhotos} onChange={setOpenPhotos} />

          <button
            className="btn primary"
            style={{ marginTop: 12 }}
            disabled={!openReady}
            onClick={() => {
              openShift(role, getStaffProfile().name, openPhotos.map((x) => x.blob));
              setOpenPhotos([]);
            }}
          >
            {openReady ? "Отправить" : !isChecklistComplete(roleShift.openChecklist) ? "Отметьте все пункты" : "Сделайте хотя бы одно фото"}
          </button>
        </>
      )}

      {/* У бара тех. задачи не показываем (фидбек Никиты 17.11.2026). */}
      {roleOpened && !roleClosed && role !== "bar" && (
        <>
          <div className="eyebrow" style={{ marginTop: 20 }}>
            Тех. задача на сегодня
          </div>
          {techTasks.length === 0 && <div className="card muted">На сегодня тех. задач нет</div>}
          {techTasks.map((t, i) => (
            <div key={i}>
              <div className="card">
                <div>{t.task}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {t.note}
                </div>
              </div>
              <TechPhotoSender role={role} task={t.task} />
            </div>
          ))}
        </>
      )}

      {roleOpened && !roleClosed && !canCloseZone && (
        <div className="card muted" style={{ marginTop: 12 }}>
          Зону «{ROLE_LABELS[role]}» открыл(а) {roleShift.openedBy}. Закрыть её может он(а) или руководитель.
        </div>
      )}

      {showCloseChecklist && (
        <>
          <h2>Чек-лист закрытия — {ROLE_LABELS[role]}</h2>
          <ChecklistGroups items={roleShift.closeChecklist} onToggle={(id) => toggleCloseChecklistItem(role, id)} />

          <div className="eyebrow" style={{ marginTop: 8 }}>
            Фото контрольных зон (со штампом даты и времени, уходит руководителю в Telegram)
          </div>
          <PhotoSet photos={closePhotos} onChange={setClosePhotos} />

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
              closeShift(role, getStaffProfile().name, handoverNote || undefined, closePhotos.map((x) => x.blob));
              setClosePhotos([]);
              setHandoverNote("");
            }}
          >
            {closeReady ? "Отправить" : !isChecklistComplete(roleShift.closeChecklist) ? "Отметьте все пункты" : "Сделайте хотя бы одно фото"}
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
  const techTasks = techKey ? getTechTasksForRoleOnDate(techKey, businessDateIso()) : [];

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
            <div key={i}>
              <div className="card">
                <div>{t.task}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {t.note}
                </div>
              </div>
              <TechPhotoSender role={role} task={t.task} />
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
