import { Link } from "react-router-dom";
import { useStore } from "@/data/useStore";
import {
  computeEarnedThisCalendarMonth,
  computeMyTipsForMonth,
  currentMonthKey,
  getStaffProfile,
  listMySchedule,
  venueSettingsStore,
  scheduleStore,
  shiftPayrollStore,
  shiftStore,
  tipsStore,
} from "@/data/repo";
import { ROLE_LABELS } from "@/lib/roles";

function money(n: number): string {
  return n.toLocaleString("ru-RU") + " ₽";
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}

function zoneState(z: { openedAt?: string; closedAt?: string }): string {
  return z.closedAt ? "закрыта" : z.openedAt ? "открыта" : "не открыта";
}

const actionStyle = { display: "block", textAlign: "center", textDecoration: "none" } as const;

/** Главная сотрудника: приветствие, плитки на сегодня и быстрые действия. */
export default function Home() {
  useStore(scheduleStore);
  useStore(shiftPayrollStore);
  useStore(tipsStore);
  const shift = useStore(shiftStore);
  const venue = useStore(venueSettingsStore);
  const todayHours = venue.hours[new Date().getDay()];

  const me = getStaffProfile();
  const firstName = (me.name || "").split(" ")[0];
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayEntry = listMySchedule().find((e) => e.date.slice(0, 10) === todayKey);
  const earned = computeEarnedThisCalendarMonth();
  const tips = computeMyTipsForMonth(currentMonthKey());
  const isOpen = shift.status === "open";

  return (
    <div className="screen">
      <h1>
        {greeting()}
        {firstName ? `, ${firstName}` : ""}
      </h1>

      <div className="hero-stat-card">
        <div className="eyebrow">Моя смена сегодня</div>
        <div className="value" style={{ fontSize: 22 }}>
          {todayEntry ? `${todayEntry.startTime}–${todayEntry.endTime}` : "Свободный день"}
        </div>
        {todayEntry && <div className="muted">{ROLE_LABELS[todayEntry.role] ?? todayEntry.role}</div>}
      </div>

      <div className="stat-grid cols-3">
        <div className={`stat-tile ${isOpen ? "good" : ""}`}>
          <div className="value">{isOpen ? "Открыта" : "Закрыта"}</div>
          <div className="label">Смена в зале</div>
          <div className="muted" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.35 }}>
            Бар: {zoneState(shift.bar)}
            <br />
            Кальяны: {zoneState(shift.hookah)}
          </div>
        </div>
        <div className="stat-tile">
          <div className="value">{money(earned)}</div>
          <div className="label">За месяц</div>
        </div>
        <div className="stat-tile good">
          <div className="value">{money(tips)}</div>
          <div className="label">Чаевые</div>
        </div>
      </div>

      <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
        Часы работы сегодня: {todayHours.closed ? "выходной" : `${todayHours.open}–${todayHours.close}`}
      </div>

      <h2>Быстрые действия</h2>
      <Link to="/employee/shift" className="btn" style={{ ...actionStyle, marginBottom: 8 }}>
        {isOpen ? "✅ Закрыть смену" : "✅ Открыть смену"}
      </Link>
      <Link to="/employee/problems" className="btn secondary" style={actionStyle}>
        🛠 Сообщить о проблеме
      </Link>
    </div>
  );
}
