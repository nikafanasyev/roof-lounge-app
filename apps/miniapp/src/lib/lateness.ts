import type { WorkRole } from "@/types";

// Штрафная сетка (редакция 17.11.2026): ступени суммируются.
//  Первая смена (приходить к 11:30, отсчёт опоздания от 12:00):
//    с 11:47 до 12:00 — 500 ₽; с 12:01 до 13:00 — +2000 ₽; с 13:01 каждый начатый час — +1000 ₽.
//  Вторая смена (официант, с 18:00):
//    от 2 до 15 минут — 500 ₽; от 16 до 60 минут — +1000 ₽; каждый следующий начатый час — +1000 ₽.

export interface LateFine {
  amount: number;
  reason: string;
}

/** Минуты от полуночи по московскому времени. */
function moscowMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export function computeLateFine(role: WorkRole, arrivedAt: Date): LateFine | null {
  const m = moscowMinutes(arrivedAt);
  const time = hhmm(m);

  if (role === "waiter") {
    const late = m - 18 * 60;
    if (late < 2 || m >= 23 * 60) return null;
    let amount = 500;
    if (late > 15) amount += 1000;
    if (late > 60) amount += Math.ceil((late - 60) / 60) * 1000;
    return { amount, reason: `Опоздание на вторую смену: пришёл в ${time} (смена с 18:00)` };
  }

  // Первая смена. Позже 18:00 — это уже не опоздание на первую смену.
  if (m < 11 * 60 + 47 || m >= 18 * 60) return null;
  let amount = 500;
  if (m > 12 * 60) amount += 2000;
  if (m > 13 * 60) amount += Math.ceil((m - 13 * 60) / 60) * 1000;
  return { amount, reason: `Опоздание на смену: пришёл в ${time} (смена с 12:00)` };
}
