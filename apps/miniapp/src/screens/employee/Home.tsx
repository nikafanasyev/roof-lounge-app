import { Link } from "react-router-dom";
import { useStore } from "@/data/useStore";
import { useEffect, useState } from "react";
import {
  businessDateIso,
  fetchMyShiftTimesToday,
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
  // «Сегодня» — бизнес-день (ночью ещё вчерашняя смена), а не дата по UTC.
  const todayKey = businessDateIso();
  const todayEntry = listMySchedule().find((e) => e.date.slice(0, 10) === todayKey);
  const earned = computeEarnedThisCalendarMonth();
  const tips = computeMyTipsForMonth(currentMonthKey());
  const isOpen = shift.status === "open";
  // Кнопка смены — по себе, а не по залу (фидбек Никиты 26.11.2026): «Закрыть» —
  // только если это я открыл зону и она ещё открыта; «Открыть» — если я в графике.
  const myOpenZone = (["bar", "hookah"] as const).find((z) => shift[z].openedAt && !shift[z].closedAt && shift[z].openedBy === me.name);
  const closedByMe = (["bar", "hookah"] as const).some((z) => shift[z].closedAt && shift[z].closedBy === me.name);
  // Кухня, клининг, официант открывают/закрывают смену без зоны — по отметке прихода/ухода.
  const [simple, setSimple] = useState<{ openedAt?: string; closedAt?: string }>({});
  useEffect(() => {
    fetchMyShiftTimesToday().then(setSimple).catch(() => undefined);
  }, []);
  const simpleOpen = !!simple.openedAt && !simple.closedAt;
  const shiftAction = myOpenZone || simpleOpen ? "close" : todayEntry && !closedByMe && !simple.closedAt ? "open" : null;

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
{shiftAction ? (
        <Link to="/employee/shift" className="btn" style={{ ...actionStyle, marginBottom: 8 }}>
          {shiftAction === "close" ? "✅ Закрыть смену" : "✅ Открыть смену"}
        </Link>
      ) : (
        <div className="muted" style={{ fontSize: 13, textAlign: "center", marginBottom: 8 }}>
          Сегодня вас нет в графике
        </div>
      )}
      <Link to="/employee/problems" className="btn secondary" style={actionStyle}>
        🛠 Сообщить о проблеме
      </Link>
    </div>
  );
}
