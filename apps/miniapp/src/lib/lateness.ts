import type { WorkRole } from "@/types";

// Штрафная сетка (редакция 22.11.2026, PDF от Никиты): на работе нужно быть в 11:45,
// ступени суммируются.
//  Первая смена (бар, кальяны, клининг):
//    с 11:47 до 12:00 — 500 ₽; с 12:01 до 13:00 — +1000 ₽; с 13:01 каждый начатый час — +1000 ₽.
//  Кухня (Аскар) — от начала своей смены (по умолчанию 12:30):
//    от 2 до 15 минут — 500 ₽; от 16 до 60 минут — +1000 ₽; каждый следующий начатый час — +1000 ₽.
//  Официант — по той же схеме, что кухня, от 18:00.
// Первое опоздание за двухнедельный табель — предупреждение (см. proposeLateFine).

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

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Опоздание от начала своей смены: 2–15 мин — 500, 16–60 — +1000, каждый следующий начатый час — +1000. */
function relativeFine(m: number, startMin: number, label: string, time: string): LateFine | null {
  const late = m - startMin;
  if (late < 2 || late > 8 * 60) return null;
  let amount = 500;
  if (late > 15) amount += 1000;
  if (late > 60) amount += Math.ceil((late - 60) / 60) * 1000;
  return { amount, reason: `Опоздание (${label}): пришёл в ${time}, смена с ${hhmm(startMin)}` };
}

export function computeLateFine(role: WorkRole, arrivedAt: Date, shiftStart?: string): LateFine | null {
  const m = moscowMinutes(arrivedAt);
  const time = hhmm(m);

  if (role === "kitchen") return relativeFine(m, toMinutes(shiftStart ?? "12:30"), "кухня", time);
  if (role === "waiter") return relativeFine(m, toMinutes(shiftStart ?? "18:00"), "официант", time);

  // Первая смена: быть в 11:45, штраф с 11:47. Позже 18:00 — уже не опоздание на первую смену.
  if (m < 11 * 60 + 47 || m >= 18 * 60) return null;
  let amount = 500;
  if (m > 12 * 60) amount += 1000;
  if (m > 13 * 60) amount += Math.ceil((m - 13 * 60) / 60) * 1000;
  return { amount, reason: `Опоздание на смену: пришёл в ${time} (быть в 11:45)` };
}
