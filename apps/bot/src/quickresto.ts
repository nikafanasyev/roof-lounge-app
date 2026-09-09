import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

// Интеграция со внутренним (недокументированным) API бэк-офиса Quick Resto —
// тем же, которым пользуется веб-панель hu554.quickresto.ru. Официального
// вебхука на события "смена открыта/закрыта" у Quick Resto нет (проверено —
// список поддерживаемых триггеров у сторонних интеграторов ограничен заказами
// и счетами), поэтому единственный способ узнать об открытии смены —
// периодически опрашивать тот же эндпоинт, который дёргает браузер.
//
// Что именно опрашиваем и почему это работает — см.
// claude/quickresto-shift-integration.md в проекте (там же тестовый скрипт,
// которым это было проверено на реальных данных).

interface QuickRestoEmployeeRaw {
  id: number;
  pin?: string;
  telegramId?: string;
  firstName?: string;
  lastName?: string;
}

interface QuickRestoEmployee {
  id: number;
  pin: string;
  telegramId: string | null;
  name: string;
}

interface WorkshiftStatementRaw {
  startTime: number;
  endTime: number;
}

export interface QuickRestoShiftEvent {
  type: "opened" | "closed";
  employee: { id: number; name: string; telegramId: string | null };
  at: Date;
}

const EMPLOYEES_PATH =
  "/platform/data/personnel.employee/select?start=0&count=150&groupField%5B%5D=role&groupDir%5B%5D=asc&businessDayOffsetInMs=43200000&timeZone=-180";

function workshiftPath(employeeId: number) {
  return (
    `/platform/data/personnel.salary.workshift_statement/select?start=0&count=150&mode=currentPeriod` +
    `&ownerContextId=${employeeId}&ownerContextClassName=ru.edgex.quickresto.modules.personnel.employee.Employee` +
    `&businessDayOffsetInMs=43200000&timeZone=-180`
  );
}

// --- HTTP-клиент с ручной cookie-jar (fetch в Node не хранит cookies сам) ---

const cookieJar = new Map<string, string>();
let loggedIn = false;

function storeCookies(res: Response) {
  const setCookie =
    typeof (res.headers as { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : res.headers.get("set-cookie")
        ? [res.headers.get("set-cookie")!]
        : [];
  for (const raw of setCookie) {
    const pair = raw.split(";")[0];
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    cookieJar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}

function cookieHeader() {
  return [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function qrFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`https://${env.QR_HOST}${path}`, {
    ...init,
    headers: {
      Accept: "application/json, text/plain, */*",
      ...(init.headers ?? {}),
      Cookie: cookieHeader(),
    },
  });
  storeCookies(res);
  return res;
}

async function login() {
  const body = new URLSearchParams({
    j_username: env.QR_LOGIN,
    j_password: env.QR_PASSWORD,
    j_rememberme: "true",
  }).toString();
  const res = await qrFetch("/platform/j_spring_security_check", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Quick Resto: логин не удался (HTTP ${res.status})`);
  }
  loggedIn = true;
}

// Сессия Quick Resto может протухнуть в любой момент — тогда вместо JSON
// приходит HTML-страница логина (со статусом 200). Ловим это через неудачный
// JSON.parse, а не только по HTTP-статусу, и перелогиниваемся один раз.
async function qrFetchJson<T>(path: string): Promise<T> {
  if (!loggedIn) await login();

  let res = await qrFetch(path);
  let text = await res.text();

  const looksExpired = res.status === 401 || res.status === 403 || !text.trim().startsWith("{");
  if (looksExpired) {
    loggedIn = false;
    await login();
    res = await qrFetch(path);
    text = await res.text();
  }

  if (!res.ok) {
    throw new Error(`Quick Resto: HTTP ${res.status} на ${path}`);
  }
  return JSON.parse(text) as T;
}

async function fetchEmployees(): Promise<QuickRestoEmployee[]> {
  const data = await qrFetchJson<{ ds?: { object: QuickRestoEmployeeRaw }[] }>(EMPLOYEES_PATH);
  return (data.ds ?? [])
    .map((d) => d.object)
    .filter((e): e is QuickRestoEmployeeRaw & { pin: string } => !!e.pin) // без ПИНа — служебные записи, не сотрудники на терминале
    .map((e) => ({
      id: e.id,
      pin: e.pin,
      telegramId: e.telegramId?.trim() || null,
      name: `${e.lastName ?? ""} ${e.firstName ?? ""}`.trim() || `Сотрудник #${e.id}`,
    }));
}

// Признак открытой смены — startTime === endTime (Quick Resto дублирует старт
// в конец, пока сотрудник не закрыл смену на терминале; не null, не "сейчас").
async function fetchShiftStatus(employeeId: number): Promise<{ isOpen: boolean; startTime: number; endTime: number } | null> {
  const data = await qrFetchJson<{ ds?: { object: WorkshiftStatementRaw }[] }>(workshiftPath(employeeId));
  const shifts = (data.ds ?? []).map((d) => d.object);
  const last = shifts[shifts.length - 1];
  if (!last) return null;
  return { isOpen: last.startTime === last.endTime, startTime: last.startTime, endTime: last.endTime };
}

function isOperatingHours(date: Date, startHour: number, endHour: number): boolean {
  const hour = date.getHours();
  if (startHour === endHour) return true; // 0 = не ограничиваем
  if (startHour < endHour) return hour >= startHour && hour < endHour;
  return hour >= startHour || hour < endHour; // диапазон через полночь, например 10..4
}

// --- Синхронизация с нашей БД (staff + shifts, см. supabase/migrations/0001_init.sql) ---

// В проекте нет сгенерированных Database-типов для Supabase (см. notify.ts —
// там та же ситуация), поэтому без явной типизации схемы .insert()/.update()
// на новых для бота таблицах (staff, shifts) TypeScript выводит их как never.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

// Сотрудник привязывается к staff по telegram_id — это то же самое значение,
// что и telegramId в Quick Resto (поле руками заполняется в карточке
// сотрудника при найме). Роль не трогаем, если запись уже есть — иначе
// каждый опрос сбрасывал бы вручную выставленную роль "manager"/"master"
// обратно на дефолтную "staff".
async function upsertStaffForEmployee(supabase: SupabaseClient, employee: QuickRestoEmployee): Promise<string | null> {
  if (!employee.telegramId) return null;
  const telegramId = Number(employee.telegramId);
  if (!Number.isFinite(telegramId)) return null;

  const { data: existing, error: selectError } = await supabase
    .from("staff")
    .select("id, name")
    .eq("telegram_id", telegramId)
    .maybeSingle();
  if (selectError) {
    console.error("Quick Resto: не удалось прочитать staff:", selectError.message);
    return null;
  }
  if (existing) {
    if (existing.name !== employee.name) {
      await supabase.from("staff").update({ name: employee.name }).eq("id", existing.id as string);
    }
    return existing.id as string;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("staff")
    .insert({ telegram_id: telegramId, name: employee.name, role: "staff" })
    .select("id")
    .single();
  if (insertError) {
    console.error("Quick Resto: не удалось создать запись в staff:", insertError.message);
    return null;
  }
  return inserted.id as string;
}

async function loadOpenShiftRowId(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase
    .from("shifts")
    .select("id, closed_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("Quick Resto: не удалось прочитать текущую смену:", error.message);
    return null;
  }
  if (data && !data.closed_at) return data.id as string;
  return null;
}

async function openVenueShift(supabase: SupabaseClient, employee: QuickRestoEmployee, openedAt: Date): Promise<string | null> {
  const staffId = await upsertStaffForEmployee(supabase, employee);
  const { data, error } = await supabase
    .from("shifts")
    .insert({ opened_by: staffId, opened_at: openedAt.toISOString(), open_checklist: [], close_checklist: [] })
    .select("id")
    .single();
  if (error) {
    console.error("Quick Resto: не удалось создать строку смены:", error.message);
    return null;
  }
  return data.id as string;
}

async function closeVenueShift(supabase: SupabaseClient, shiftRowId: string, employee: QuickRestoEmployee, closedAt: Date) {
  const staffId = await upsertStaffForEmployee(supabase, employee);
  const { error } = await supabase
    .from("shifts")
    .update({ closed_by: staffId, closed_at: closedAt.toISOString() })
    .eq("id", shiftRowId);
  if (error) console.error("Quick Resto: не удалось закрыть строку смены:", error.message);
}

/**
 * Опрашивает Quick Resto и синхронизирует статус смены заведения в таблицу
 * `shifts` (Shift.tsx читает её как есть, ничего в самом экране менять не
 * нужно). Модель: "смена заведения" считается открытой, пока хотя бы один
 * сотрудник числится вошедшим по ПИН-коду на терминале, и закрывается, когда
 * последний из вошедших закрывает смену. onEvent вызывается на каждом таком
 * переходе — для уведомления в Telegram.
 *
 * Важно про пропуски: если сотрудник забудет закрыть смену на терминале,
 * для нас (и для Quick Resto) она будет считаться открытой до тех пор, пока
 * кто-нибудь не закроет её вручную в бэк-офисе — это ограничение источника
 * данных, не самого опроса.
 */
export function watchQuickRestoShifts(onEvent: (event: QuickRestoShiftEvent) => void | Promise<void>) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  let employees: QuickRestoEmployee[] = [];
  let employeesLoadedAt = 0;
  const openState = new Map<number, boolean>();
  let currentShiftRowId: string | null = null;
  let warmedUp = false; // первый проход только запоминает состояние, событий не шлёт

  async function tick() {
    const now = new Date();
    if (!isOperatingHours(now, env.QR_POLL_START_HOUR, env.QR_POLL_END_HOUR)) return;

    if (!employees.length || Date.now() - employeesLoadedAt > 30 * 60_000) {
      try {
        employees = await fetchEmployees();
        employeesLoadedAt = Date.now();
      } catch (err) {
        console.error("Quick Resto: не удалось обновить список сотрудников:", err);
        return;
      }
    }

    if (!warmedUp) {
      currentShiftRowId = await loadOpenShiftRowId(supabase);
    }

    let anyOpenNow = false;
    let transitionToOpen: { employee: QuickRestoEmployee; at: number } | undefined;
    let transitionToClosed: { employee: QuickRestoEmployee; at: number } | undefined;

    for (const employee of employees) {
      let status: Awaited<ReturnType<typeof fetchShiftStatus>>;
      try {
        status = await fetchShiftStatus(employee.id);
      } catch (err) {
        console.error(`Quick Resto: ошибка получения смены сотрудника ${employee.id}:`, err);
        continue;
      }
      const wasOpen = openState.get(employee.id) ?? false;
      const isOpen = status?.isOpen ?? false;
      openState.set(employee.id, isOpen);

      if (isOpen) {
        anyOpenNow = true;
        if (!wasOpen && warmedUp) transitionToOpen = { employee, at: status!.startTime };
      } else if (wasOpen && warmedUp) {
        transitionToClosed = { employee, at: status?.endTime ?? Date.now() };
      }
    }

    if (warmedUp && anyOpenNow && !currentShiftRowId && transitionToOpen) {
      currentShiftRowId = await openVenueShift(supabase, transitionToOpen.employee, new Date(transitionToOpen.at));
      await onEvent({
        type: "opened",
        employee: transitionToOpen.employee,
        at: new Date(transitionToOpen.at),
      });
    }

    if (warmedUp && !anyOpenNow && currentShiftRowId && transitionToClosed) {
      const rowId = currentShiftRowId;
      currentShiftRowId = null;
      await closeVenueShift(supabase, rowId, transitionToClosed.employee, new Date(transitionToClosed.at));
      await onEvent({
        type: "closed",
        employee: transitionToClosed.employee,
        at: new Date(transitionToClosed.at),
      });
    }

    warmedUp = true;
  }

  tick().catch((err) => console.error("Quick Resto: ошибка первого опроса:", err));
  setInterval(() => {
    tick().catch((err) => console.error("Quick Resto: ошибка опроса:", err));
  }, env.QR_POLL_INTERVAL_MS);
}
