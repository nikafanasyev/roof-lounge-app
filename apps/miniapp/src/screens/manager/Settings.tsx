import { useEffect, useState } from "react";
import { useStore } from "@/data/useStore";
import { saveVenueSettings, venueSettingsStore } from "@/data/repo";
import type { ShiftTemplate, VenueSettings } from "@/data/repo";
import { ROLE_LABELS } from "@/lib/roles";
import type { WorkRole } from "@/types";

const DAYS = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
// Порядок показа: с понедельника.
const ORDER = [1, 2, 3, 4, 5, 6, 0];

function NumField({ label, value, onChange, min, max, suffix }: { label: string; value: number; onChange: (n: number) => void; min: number; max: number; suffix: string }) {
  return (
    <label className="card-row" style={{ marginTop: 8 }}>
      <span>{label}</span>
      <span>
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || 0)))}
          style={{ width: 64, textAlign: "right" }}
        />{" "}
        <span className="muted">{suffix}</span>
      </span>
    </label>
  );
}

/** Раздел «Настройки» (руководитель): часы работы, начало бизнес-дня, параметры борда. */
export default function Settings() {
  const saved = useStore(venueSettingsStore);
  const [draft, setDraft] = useState<VenueSettings>(saved);
  const [justSaved, setJustSaved] = useState(false);

  // Подхватываем изменения с другого устройства, пока не правили локально.
  useEffect(() => {
    setDraft(saved);
  }, [saved]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  function setDay(i: number, patch: Partial<VenueSettings["hours"][number]>) {
    setDraft((d) => ({ ...d, hours: d.hours.map((h, idx) => (idx === i ? { ...h, ...patch } : h)) }));
  }

  function setShift(role: WorkRole, patch: Partial<ShiftTemplate>) {
    setDraft((d) => ({ ...d, shifts: { ...d.shifts, [role]: { ...d.shifts[role], ...patch } } }));
  }
  const SHIFT_ROLES: WorkRole[] = ["bar", "hookah", "waiter", "kitchen", "cleaning"];

  return (
    <div className="screen">
      <h1>Настройки</h1>

      <div className="eyebrow">Время смен по ролям</div>
      <div className="card">
        {SHIFT_ROLES.map((r, n) => {
          const t = draft.shifts[r];
          return (
            <div key={r} style={{ marginTop: n === 0 ? 0 : 12 }}>
              <div style={{ fontWeight: 700 }}>{ROLE_LABELS[r]}</div>
              <div className="card-row" style={{ gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                <span className="muted" style={{ fontSize: 13 }}>вс–чт</span>
                <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="time" value={t.weekdayStart} onChange={(e) => setShift(r, { weekdayStart: e.target.value })} />
                  <span className="muted">–</span>
                  <input type="time" value={t.weekdayEnd} onChange={(e) => setShift(r, { weekdayEnd: e.target.value })} />
                </span>
              </div>
              <div className="card-row" style={{ gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                <span className="muted" style={{ fontSize: 13 }}>пт, сб</span>
                <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="time" value={t.weekendStart} onChange={(e) => setShift(r, { weekendStart: e.target.value })} />
                  <span className="muted">–</span>
                  <input type="time" value={t.weekendEnd} onChange={(e) => setShift(r, { weekendEnd: e.target.value })} />
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="muted" style={{ fontSize: 12, margin: "6px 4px 14px" }}>
        Подставляется, когда вы ставите человека в график. Уже поставленные смены не меняются.
      </div>

      <div className="eyebrow">Часы работы заведения</div>
      <div className="card">
        {ORDER.map((i, n) => {
          const h = draft.hours[i];
          return (
            <div key={i} className="card-row" style={{ marginTop: n === 0 ? 0 : 10, gap: 8, flexWrap: "wrap" }}>
              <span style={{ minWidth: 110 }}>{DAYS[i]}</span>
              <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {h.closed ? (
                  <span className="muted">выходной</span>
                ) : (
                  <>
                    <input type="time" value={h.open} onChange={(e) => setDay(i, { open: e.target.value })} />
                    <span className="muted">–</span>
                    <input type="time" value={h.close} onChange={(e) => setDay(i, { close: e.target.value })} />
                  </>
                )}
                <label style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 13 }}>
                  <input type="checkbox" checked={h.closed} onChange={(e) => setDay(i, { closed: e.target.checked })} />
                  вых.
                </label>
              </span>
            </div>
          );
        })}
      </div>
      <div className="muted" style={{ fontSize: 12, margin: "6px 4px 14px" }}>
        Сотрудники видят часы на своей «Главной». Время закрытия после полуночи (например 02:00) значит «ночью следующего дня».
      </div>

      <div className="eyebrow">Бизнес-день</div>
      <div className="card">
        <NumField label="Начало бизнес-дня" value={draft.businessDayStartHour} min={0} max={23} suffix="ч" onChange={(n) => setDraft((d) => ({ ...d, businessDayStartHour: n }))} />
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          До этого часа ночная смена ещё относится к прошлому дню. Влияет на экран «Смена» и отметки прихода в приложении. Бот пока считает выручку и начисления с 11:00.
        </div>
      </div>

      <div className="eyebrow" style={{ marginTop: 14 }}>Борд кальянов: уголь</div>
      <div className="card">
        <NumField label="Замена угля каждые" value={draft.coalCycleMin} min={5} max={60} suffix="мин" onChange={(n) => setDraft((d) => ({ ...d, coalCycleMin: n }))} />
        <NumField label="Жёлтая подсветка за" value={draft.coalSoonMin} min={0} max={10} suffix="мин до" onChange={(n) => setDraft((d) => ({ ...d, coalSoonMin: n }))} />
        <NumField label="Красная подсветка" value={draft.coalLateMin} min={0} max={10} suffix="мин после" onChange={(n) => setDraft((d) => ({ ...d, coalLateMin: n }))} />
      </div>

      <button
        className="btn primary"
        style={{ marginTop: 16 }}
        disabled={!dirty}
        onClick={() => {
          saveVenueSettings(draft);
          setJustSaved(true);
          setTimeout(() => setJustSaved(false), 2000);
        }}
      >
        {justSaved ? "Сохранено ✓" : dirty ? "Сохранить" : "Нет изменений"}
      </button>
    </div>
  );
}
