// Разбор графика, вставленного текстом (как его пишут в чат), — фидбек Никиты 22.11.2026.
// Поддерживаются два вида:
//  1) строка-шапка с ролями по колонкам, дальше строки «день имя день имя»:
//       Бар Кальян
//       23 Артем 23 Никита
//  2) блоки: строка с одной ролью, под ней строки «день Имя Фамилия»:
//       Бар
//       16 Артём Боков
// Месяц определяется сам: дни идут по порядку, при переходе 30 → 1 — следующий месяц;
// первый день берётся ближайший к сегодняшней дате.
import type { StaffProfile, WorkRole } from "@/types";

const ROLE_WORDS: [RegExp, WorkRole][] = [
  [/^бар/, "bar"],
  [/^кальян/, "hookah"],
  [/^кух/, "kitchen"],
  [/^(клин|уборк)/, "cleaning"],
  [/^офиц/, "waiter"],
];

const NICKNAMES: Record<string, string> = {
  даня: "даниил",
  данил: "даниил",
  макс: "максим",
  тема: "артем",
  темa: "артем",
  саша: "александр",
  дима: "дмитрий",
  ник: "никита",
};

export interface ParsedEntry {
  dateIso: string;
  role: WorkRole;
  rawName: string;
  staffId?: string; // найденный сотрудник (может быть не найден — выбрать вручную)
  candidates: StaffProfile[];
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/[.,;:]/g, "").trim();

function roleOf(word: string): WorkRole | undefined {
  const w = norm(word);
  return ROLE_WORDS.find(([re]) => re.test(w))?.[1];
}

function matchStaff(raw: string, staff: StaffProfile[]): StaffProfile[] {
  const tokens = norm(raw).split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const first = NICKNAMES[tokens[0]] ?? tokens[0];
  const last = tokens[1];
  const people = staff.map((s) => ({ s, parts: norm(s.name).split(/\s+/) }));
  const byFull = people.filter((p) => tokens.length > 1 && (p.parts.join(" ") === tokens.join(" ") || p.parts.slice().reverse().join(" ") === tokens.join(" ")));
  if (byFull.length) return byFull.map((p) => p.s);
  const firstOk = (p: { parts: string[] }) =>
    p.parts.some((part) => part === first || part.startsWith(first) || (first.length >= 3 && part.slice(0, 3) === first.slice(0, 3)));
  let hits = people.filter(firstOk);
  if (last && hits.length > 1) {
    const narrowed = hits.filter((p) => p.parts.some((part) => part.startsWith(last.slice(0, 3))));
    if (narrowed.length) hits = narrowed;
  }
  return hits.map((p) => p.s);
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Превращает последовательность чисел дней в даты: ближайший к today месяц, дальше по порядку. */
function resolveDays(days: number[], today: Date): string[] {
  if (!days.length) return [];
  const candidates = [-1, 0, 1].map((k) => new Date(today.getFullYear(), today.getMonth() + k, days[0], 12));
  let cur = candidates.reduce((best, c) => (Math.abs(c.getTime() - today.getTime()) < Math.abs(best.getTime() - today.getTime()) ? c : best));
  const out = [iso(cur)];
  for (let i = 1; i < days.length; i++) {
    let next = new Date(cur.getFullYear(), cur.getMonth(), days[i], 12);
    if (days[i] < cur.getDate()) next = new Date(cur.getFullYear(), cur.getMonth() + 1, days[i], 12);
    out.push(iso(next));
    cur = next;
  }
  return out;
}

export function parseScheduleText(text: string, staff: StaffProfile[], today = new Date()): { entries: ParsedEntry[]; errors: string[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const errors: string[] = [];
  const raw: { day: number; role: WorkRole; name: string }[][] = []; // группы (колонки/блоки) со своим порядком дней
  let columns: WorkRole[] = [];
  let blockRole: WorkRole | undefined;
  const groupFor = new Map<string, number>();
  const group = (key: string) => {
    if (!groupFor.has(key)) {
      groupFor.set(key, raw.length);
      raw.push([]);
    }
    return raw[groupFor.get(key)!];
  };

  for (const line of lines) {
    const words = line.split(/\s+/);
    const roles = words.map(roleOf);
    if (!/\d/.test(line) && roles.every(Boolean)) {
      if (roles.length > 1) {
        columns = roles as WorkRole[];
        blockRole = undefined;
      } else {
        blockRole = roles[0];
        columns = [];
      }
      continue;
    }
    // «23 Артем 23 Никита» → пары (день, имя)
    const pairs = [...line.matchAll(/(\d{1,2})\s*[.)-]?\s+([^\d]+?)(?=\s+\d{1,2}\s|$)/g)].map((m) => ({ day: Number(m[1]), name: m[2].trim() }));
    if (!pairs.length) {
      errors.push(`Не понял строку: «${line}»`);
      continue;
    }
    pairs.forEach((p, i) => {
      const role = columns.length ? columns[i] : blockRole;
      if (!role) {
        errors.push(`Не понятно, какая роль у «${line}» — добавьте строку «Бар» / «Кальян» над графиком`);
        return;
      }
      const key = columns.length ? `col-${i}-${role}` : `block-${role}-${raw.length}`;
      group(columns.length ? key : `block-${role}`).push({ day: p.day, role, name: p.name });
    });
  }

  const entries: ParsedEntry[] = [];
  for (const g of raw) {
    const dates = resolveDays(g.map((x) => x.day), today);
    g.forEach((x, i) => {
      const candidates = matchStaff(x.name, staff);
      entries.push({ dateIso: dates[i], role: x.role, rawName: x.name, staffId: candidates.length === 1 ? candidates[0].id : undefined, candidates });
    });
  }
  entries.sort((a, b) => a.dateIso.localeCompare(b.dateIso) || a.role.localeCompare(b.role));
  return { entries, errors };
}
