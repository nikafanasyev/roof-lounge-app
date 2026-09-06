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

const CURRENT_STAFF_NAME = "Никита Афанасьев"; // заглушка до подключения Telegram-авторизации

export default function Shift() {
  const shift = useStore(shiftStore);
  const [handoverNote, setHandoverNote] = useState("");
  const [openPhoto, setOpenPhoto] = useState<string | undefined>();
  const [closePhoto, setClosePhoto] = useState<string | undefined>();

  const openReady = isChecklistComplete(shift.openChecklist) && !!openPhoto;
  const closeReady = isChecklistComplete(shift.closeChecklist) && !!closePhoto;

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

      {shift.status === "closed" && (
        <>
          <h2>Чек-лист открытия</h2>
          {shift.openChecklist.map((item) => (
            <label key={item.id} className="card card-row" style={{ cursor: "pointer" }}>
              <span>{item.label}</span>
              <input type="checkbox" checked={item.done} onChange={() => toggleOpenChecklistItem(item.id)} />
            </label>
          ))}

          <div className="eyebrow" style={{ marginTop: 8 }}>
            Фото на месте (со штампом даты и времени)
          </div>
          <CameraCapture photoUrl={openPhoto} onCapture={setOpenPhoto} label="Сфотографироваться в заведении" />

          <button
            className="btn primary"
            style={{ marginTop: 12 }}
            disabled={!openReady}
            onClick={() => {
              openShift(CURRENT_STAFF_NAME, openPhoto);
              setOpenPhoto(undefined);
            }}
          >
            {openReady ? "Открыть смену" : !isChecklistComplete(shift.openChecklist) ? "Отметьте все пункты" : "Сделайте фото"}
          </button>
        </>
      )}

      {shift.status === "open" && (
        <>
          <h2>Чек-лист закрытия</h2>
          {shift.closeChecklist.map((item) => (
            <label key={item.id} className="card card-row" style={{ cursor: "pointer" }}>
              <span>{item.label}</span>
              <input type="checkbox" checked={item.done} onChange={() => toggleCloseChecklistItem(item.id)} />
            </label>
          ))}

          <div className="eyebrow" style={{ marginTop: 8 }}>
            Фото контрольных зон (со штампом даты и времени)
          </div>
          <CameraCapture photoUrl={closePhoto} onCapture={setClosePhoto} label="Сфотографировать зал" />

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
              closeShift(CURRENT_STAFF_NAME, handoverNote || undefined, closePhoto);
              setClosePhoto(undefined);
              setHandoverNote("");
            }}
          >
            {closeReady ? "Закрыть смену" : !isChecklistComplete(shift.closeChecklist) ? "Отметьте все пункты" : "Сделайте фото"}
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

      {shift.status === "closed" && shift.closePhotoUrl && (
        <>
          <div className="eyebrow" style={{ marginTop: 12 }}>
            Фото прошлого закрытия
          </div>
          <img src={shift.closePhotoUrl} alt="" style={{ width: "100%", borderRadius: 10 }} />
        </>
      )}
    </div>
  );
}
