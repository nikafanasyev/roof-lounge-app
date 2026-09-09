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

interface CapturedPhoto {
  url: string;
  blob: Blob;
}

export default function Shift() {
  const shift = useStore(shiftStore);
  const [handoverNote, setHandoverNote] = useState("");
  const [openPhoto, setOpenPhoto] = useState<CapturedPhoto | undefined>();
  const [closePhoto, setClosePhoto] = useState<CapturedPhoto | undefined>();

  const openReady = isChecklistComplete(shift.openChecklist) && !!openPhoto;
  const closeReady = isChecklistComplete(shift.closeChecklist) && !!closePhoto;

  // Статус смены теперь приходит из Quick Resto (ПИН на терминале) и
  // становится "открыта" сразу, как только сотрудник вошёл — то есть до того,
  // как он успевает отметить чек-лист открытия в приложении. Поэтому какой
  // чек-лист показывать решаем не по одному статусу, а ещё и по тому, отмечен
  // ли уже чек-лист открытия: пока не отмечен — показываем открытие, даже
  // если Quick Resto уже считает смену открытой.
  const openChecklistDone = isChecklistComplete(shift.openChecklist);
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

      {showOpenChecklist && (
        <>
          <h2>Чек-лист открытия</h2>
          {shift.openChecklist.map((item) => (
            <label key={item.id} className="card card-row" style={{ cursor: "pointer" }}>
              <span>{item.label}</span>
              <input type="checkbox" checked={item.done} onChange={() => toggleOpenChecklistItem(item.id)} />
            </label>
          ))}

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
              openShift(CURRENT_STAFF_NAME, openPhoto?.blob);
              setOpenPhoto(undefined);
            }}
          >
            {openReady ? "Отправить" : !isChecklistComplete(shift.openChecklist) ? "Отметьте все пункты" : "Сделайте фото"}
          </button>
        </>
      )}

      {shift.status === "open" && !showOpenChecklist && (
        <>
          <h2>Чек-лист закрытия</h2>
          {shift.closeChecklist.map((item) => (
            <label key={item.id} className="card card-row" style={{ cursor: "pointer" }}>
              <span>{item.label}</span>
              <input type="checkbox" checked={item.done} onChange={() => toggleCloseChecklistItem(item.id)} />
            </label>
          ))}

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
              closeShift(CURRENT_STAFF_NAME, handoverNote || undefined, closePhoto?.blob);
              setClosePhoto(undefined);
              setHandoverNote("");
            }}
          >
            {closeReady ? "Отправить" : !isChecklistComplete(shift.closeChecklist) ? "Отметьте все пункты" : "Сделайте фото"}
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
