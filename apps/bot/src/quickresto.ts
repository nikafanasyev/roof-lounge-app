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
//
// Возвращаем ВЕСЬ список записей (отсортированный по возрастанию startTime),
// а не только последнюю: если сотрудник успел открыть и закрыть смену
// несколько раз подряд быстрее интервала опроса, на очередном тике видна
// только эта история целиком — единственный способ не потерять промежуточные
// переходы (сравнение "было/стало" по одной последней записи их тихо теряет).
async function fetchShiftRecords(employeeId: number): Promise<WorkshiftStatementRaw[]> {
  const data = await qrFetchJson<{ ds?: { object: WorkshiftStatementRaw }[] }>(workshiftPath(employeeId));
  return (data.ds ?? []).map((d) => d.object).sort((a, b) => a.startTime - b.startTime);
}

// Часы работы заведения (QR_POLL_START_HOUR/END_HOUR) заданы в московском
// времени, а Railway крутит контейнер в UTC — date.getHours() без явной
// таймзоны сверял бы их с UTC-часом и мог включать/выключать опрос не тогда.
function isOperatingHours(date: Date, startHour: number, endHour: number): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", hour12: false, timeZone: "Europe/Moscow" }).format(date),
  );
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

// Те же пункты, что и в дефолтных заготовках apps/miniapp/src/data/seed.ts
// (BAR_OPEN_CHECKLIST/BAR_CLOSE_CHECKLIST/HOOKAH_OPEN_CHECKLIST/HOOKAH_CLOSE_CHECKLIST)
// — держать в синхроне вручную, общего пакета между miniapp и bot сейчас нет.
// Новую строку смены создаём сразу с этими пунктами по каждой роли (done:
// false), а не пустыми массивами: иначе мини-апп при первой загрузке
// подставлял бы то, что случайно было в его локальном сторе (например, уже
// отмеченный чек-лист с прошлой смены), и экран открытия мог бы решить, что
// чек-лист уже пройден. Полный текст пунктов — см. seed.ts, здесь только id
// и label, чтобы файл не раздувался; главное, чтобы id совпадали построчно.
const DEFAULT_BAR_OPEN_CHECKLIST = [
  { id: "bar-o-1", section: "Подготовка зала", label: "Включить свет, вытяжку, приток, термопот, кофемашину, музыку (отрегулировать громкость во втором зале), лампочки, стены во 2 зале", done: false },
  { id: "bar-o-2", section: "Подготовка зала", label: "Проверить закрытие предыдущей смены (чистота диванов, столов, меню, ламп и т.д.), убрать все недочёты", done: false },
  { id: "bar-o-3", section: "Подготовка зала", label: "Проверить часы и распределить по подразделениям", done: false },
  { id: "bar-o-4", section: "Подготовка зала", label: "Протереть столы на веранде", done: false },
  { id: "bar-o-5", section: "Открытие кассовой смены", label: "Пересчитать наличные в кассе", done: false },
  { id: "bar-o-6", section: "Открытие кассовой смены", label: "Открыть кассовую смену на планшете", done: false },
  { id: "bar-o-7", section: "Открытие рабочей зоны", label: "Проверка рабочей техники: льдогенератор, холодильник, кофемашина, термопот", done: false },
  { id: "bar-o-8", section: "Открытие рабочей зоны", label: "Пополнить всё необходимое для смены: пюре, сиропы, фрукты, алкоголь, чай и т.д.", done: false },
  { id: "bar-o-9", section: "Открытие рабочей зоны", label: "Проверить заполнение холодильника с напитками", done: false },
  { id: "bar-o-10", section: "Открытие рабочей зоны", label: "Подготовить сервировку (салфетки для зала, минажи для веранды, приборы)", done: false },
  { id: "bar-o-11", section: "Открытие рабочей зоны", label: "Составить заказ на Сбер", done: false },
  { id: "bar-o-12", section: "Контроль бронирований", label: "Проверить рабочий телефон (звук, уведомления, работу ВПН)", done: false },
  { id: "bar-o-13", section: "Контроль бронирований", label: "Проверить планшет с системой бронирования", done: false },
  { id: "bar-o-14", section: "Контроль бронирований", label: "Подтвердить новые брони, внести все бронирования в систему", done: false },
  { id: "bar-o-15", section: "Выполнение тех. задач", label: "Выполнить техническую задачу по графику дня (пн — морозилка, вт — термопот, ср — холодильник/ледген, чт — полки с посудой, пт — верхние полки, вс — барная станция/разморозить морозилку; каждый второй день — зарядка лампочек) и отправить фото в чат", done: false },
];
const DEFAULT_BAR_CLOSE_CHECKLIST = [
  { id: "bar-c-1", section: "Закрытие рабочей зоны", label: "Заполнить термопот", done: false },
  { id: "bar-c-2", section: "Закрытие рабочей зоны", label: "Замыть кофемашину", done: false },
  { id: "bar-c-3", section: "Закрытие рабочей зоны", label: "Замыть весь рабочий инвентарь", done: false },
  { id: "bar-c-4", section: "Закрытие рабочей зоны", label: "Протереть холодильник, ледогенератор, кофемашину и т.д.", done: false },
  { id: "bar-c-5", section: "Закрытие рабочей зоны", label: "Замыть раковину, барную станцию", done: false },
  { id: "bar-c-6", section: "Закрытие рабочей зоны", label: "Выполнить тех. задачу дня", done: false },
  { id: "bar-c-7", section: "Закрытие рабочей зоны", label: "Сфотографировать рабочую зону и отправить в чат", done: false },
  { id: "bar-c-8", section: "Проверка закрытия зала", label: "Диваны чистые", done: false },
  { id: "bar-c-9", section: "Проверка закрытия зала", label: "Столы чистые", done: false },
  { id: "bar-c-10", section: "Проверка закрытия зала", label: "Салфетницы заполнены", done: false },
  { id: "bar-c-11", section: "Проверка закрытия зала", label: "Холодильник заполнен", done: false },
  { id: "bar-c-12", section: "Закрытие кассовой смены", label: "Сверить данные терминала и ФР2", done: false },
  { id: "bar-c-13", section: "Закрытие кассовой смены", label: "Пересчитать наличные в кассе", done: false },
  { id: "bar-c-14", section: "Закрытие кассовой смены", label: "Провести сверку итогов", done: false },
  { id: "bar-c-15", section: "Закрытие кассовой смены", label: "Закрыть кассовую смену на планшете", done: false },
  { id: "bar-c-16", section: "Закрытие кассовой смены", label: "Отправить отчёт по смене с внесением всех расходов (фото отчётов по ФР2 и виртуалке, сверка итогов, текстовая часть: дата, выручка, безналичные, наличные, расходы, внесение, наличные в кассе)", done: false },
  { id: "bar-c-17", section: "Поставить технику на зарядку", label: "Телефон", done: false },
  { id: "bar-c-18", section: "Поставить технику на зарядку", label: "2 планшета", done: false },
  { id: "bar-c-19", section: "Поставить технику на зарядку", label: "Часы зал / веранда", done: false },
  { id: "bar-c-20", section: "Поставить технику на зарядку", label: "Лампы (каждый второй день)", done: false },
  { id: "bar-c-21", section: "Закрытие заведения", label: "Выключить приток, вытяжку", done: false },
  { id: "bar-c-22", section: "Закрытие заведения", label: "Выключить лампочки, стены в зале", done: false },
  { id: "bar-c-23", section: "Закрытие заведения", label: "Выключить музыку", done: false },
  { id: "bar-c-24", section: "Закрытие заведения", label: "Выключить свет в щитке", done: false },
  { id: "bar-c-25", section: "Закрытие заведения", label: "Закрыть заведение и оставить ключ", done: false },
];
const DEFAULT_HOOKAH_OPEN_CHECKLIST = [
  { id: "hookah-o-1", label: "Плита включена", done: false },
  { id: "hookah-o-2", label: "Кальянная станция/калауды чистые, по необходимости — исправить", done: false },
  { id: "hookah-o-3", label: "Проверить количество углей/мундштуков и т.п.", done: false },
  { id: "hookah-o-4", label: "Распаковать угли в достаточном количестве", done: false },
  { id: "hookah-o-5", label: "Мундштуки на столах заполнены", done: false },
  { id: "hookah-o-6", label: "Распаковать табаки по контейнерам (в случае необходимости)", done: false },
  { id: "hookah-o-7", label: "Проверить количество фруктов (минимальный остаток — 2 грейпфрута)", done: false },
  { id: "hookah-o-8", label: "Опустошить ведро с использованными углями по необходимости", done: false },
];
const DEFAULT_HOOKAH_CLOSE_CHECKLIST = [
  { id: "hookah-c-1", label: "Плита для углей выключена", done: false },
  { id: "hookah-c-2", label: "Расставить кальяны по местам", done: false },
  { id: "hookah-c-3", label: "Протереть все поверхности кальянной станции влажной тряпкой, затем сухой — без разводов", done: false },
  { id: "hookah-c-4", label: "Промыть и просушить щипцы/ножи/шила/кадила", done: false },
  { id: "hookah-c-5", label: "Протереть печь для углей", done: false },
  { id: "hookah-c-6", label: "Протереть полки/контейнеры с табаком", done: false },
  { id: "hookah-c-7", label: "Сложить пустые контейнеры на их место", done: false },
  { id: "hookah-c-8", label: "Расставить чаши по форме на резинку для чаш", done: false },
  { id: "hookah-c-9", label: "Вымыть раковину и зону вокруг неё", done: false },
  { id: "hookah-c-10", label: "Промыть все шланги с мундштуками, протереть их без разводов", done: false },
  { id: "hookah-c-11", label: "Залить водой использованные угли так, чтобы не осталось ни одного угля в ведре", done: false },
  { id: "hookah-c-12", label: "Заполнить мундштучницы", done: false },
  { id: "hookah-c-13", label: "Выбросить весь накопившийся мусор", done: false },
  { id: "hookah-c-14", label: "Отправить фотоотчёт в чат о закрытии смены", done: false },
];

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
    .insert({
      opened_by: staffId,
      opened_at: openedAt.toISOString(),
      bar_open_checklist: DEFAULT_BAR_OPEN_CHECKLIST,
      bar_close_checklist: DEFAULT_BAR_CLOSE_CHECKLIST,
      hookah_open_checklist: DEFAULT_HOOKAH_OPEN_CHECKLIST,
      hookah_close_checklist: DEFAULT_HOOKAH_CLOSE_CHECKLIST,
    })
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
async function safeNotify(onEvent: (event: QuickRestoShiftEvent) => void | Promise<void>, event: QuickRestoShiftEvent) {
  try {
    await onEvent(event);
  } catch (err) {
    // Ошибка отправки уведомления (например, sendMessage) не должна мешать
    // остальному опросу — строка в shifts к этому моменту уже записана.
    console.error("Quick Resto: не удалось обработать событие смены:", err);
  }
}

export function watchQuickRestoShifts(onEvent: (event: QuickRestoShiftEvent) => void | Promise<void>) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  let employees: QuickRestoEmployee[] = [];
  let employeesLoadedAt = 0;
  // Для каждого сотрудника помним startTime и isOpen последней уже виденной
  // записи смены. На каждом тике нужно поймать оба вида переходов:
  //  1) та же самая запись (тот же startTime) сама закрылась — endTime стал
  //     реальным, startTime не изменился;
  //  2) появились новые записи (новый startTime) — сотрудник успел открыть
  //     (и, может, уже закрыть) смену один или несколько раз с прошлого
  //     опроса; при быстрых повторных ПИН-входах их может быть сразу
  //     несколько, и все они должны попасть в events по порядку.
  const lastKnown = new Map<number, { startTime: number; isOpen: boolean }>();
  const openEmployeeIds = new Set<number>();
  let currentShiftRowId: string | null = null;
  let warmedUp = false; // первый проход только запоминает состояние, событий не шлёт
  let tickCount = 0;

  async function tick() {
    const now = new Date();
    if (!isOperatingHours(now, env.QR_POLL_START_HOUR, env.QR_POLL_END_HOUR)) return;

    tickCount += 1;
    // Раз в ~10 опросов пишем короткую сводку — чтобы по логам было видно, что
    // опрос вообще жив и доходит до Quick Resto, даже если переходов не было.
    if (tickCount % 10 === 0) {
      console.log(
        `Quick Resto: опрос жив (тик ${tickCount}), на смене: ${openEmployeeIds.size ? [...openEmployeeIds].join(", ") : "никого"}, строка смены заведения: ${currentShiftRowId ?? "нет"}`,
      );
    }

    if (!employees.length || Date.now() - employeesLoadedAt > 30 * 60_000) {
      try {
        employees = await fetchEmployees();
        employeesLoadedAt = Date.now();
        console.log(`Quick Resto: список сотрудников обновлён (${employees.length}): ${employees.map((e) => `${e.name} (id=${e.id})`).join(", ")}`);
      } catch (err) {
        console.error("Quick Resto: не удалось обновить список сотрудников:", err);
        return;
      }
    }

    if (!warmedUp) {
      currentShiftRowId = await loadOpenShiftRowId(supabase);
    }

    const events: { type: "opened" | "closed"; employee: QuickRestoEmployee; at: number }[] = [];

    for (const employee of employees) {
      let records: WorkshiftStatementRaw[];
      try {
        records = await fetchShiftRecords(employee.id);
      } catch (err) {
        console.error(`Quick Resto: ошибка получения смены сотрудника ${employee.id}:`, err);
        continue;
      }
      if (!records.length) continue;

      const prior = lastKnown.get(employee.id);

      if (warmedUp) {
        // 1) Та самая запись, что была открыта на прошлом опросе, могла
        // закрыться сама по себе (startTime тот же, endTime стал реальным) —
        // это не появится ни в какой "новой" записи, поэтому проверяем
        // отдельно, до фильтрации по startTime.
        if (prior?.isOpen) {
          const same = records.find((r) => r.startTime === prior.startTime);
          if (same && same.startTime !== same.endTime) {
            events.push({ type: "closed", employee, at: same.endTime });
          }
        }

        // 2) Любые записи новее прежней — один или несколько циклов
        // открытие/закрытие, случившихся с прошлого опроса.
        const newer = records.filter((r) => !prior || r.startTime > prior.startTime);
        for (const record of newer) {
          const isOpen = record.startTime === record.endTime;
          events.push({ type: "opened", employee, at: record.startTime });
          if (!isOpen) {
            events.push({ type: "closed", employee, at: record.endTime });
          }
        }
      }

      const last = records[records.length - 1];
      const stillOpen = last.startTime === last.endTime;
      lastKnown.set(employee.id, { startTime: last.startTime, isOpen: stillOpen });
      if (stillOpen) openEmployeeIds.add(employee.id);
      else openEmployeeIds.delete(employee.id);
    }

    if (events.length) {
      console.log(
        `Quick Resto: обнаружены переходы (${events.length}): ` +
          events
            .map((e) => `${e.type} — ${e.employee.name} @ ${new Date(e.at).toLocaleTimeString("ru-RU", { timeZone: "Europe/Moscow" })}`)
            .join("; ") +
          `; сейчас на смене: ${openEmployeeIds.size ? [...openEmployeeIds].join(", ") : "никого"}; строка смены заведения: ${currentShiftRowId ?? "нет"}`,
      );
    }

    events.sort((a, b) => a.at - b.at);
    for (const event of events) {
      if (event.type === "opened" && !currentShiftRowId) {
        currentShiftRowId = await openVenueShift(supabase, event.employee, new Date(event.at));
        console.log(`Quick Resto: строка смены заведения создана — id=${currentShiftRowId ?? "ОШИБКА, см. лог выше"}`);
        await safeNotify(onEvent, { type: "opened", employee: event.employee, at: new Date(event.at) });
      } else if (event.type === "closed" && currentShiftRowId && openEmployeeIds.size === 0) {
        const rowId = currentShiftRowId;
        currentShiftRowId = null;
        await closeVenueShift(supabase, rowId, event.employee, new Date(event.at));
        await safeNotify(onEvent, { type: "closed", employee: event.employee, at: new Date(event.at) });
      } else if (event.type === "opened") {
        console.log(`Quick Resto: открытие ${event.employee.name} проигнорировано — смена заведения уже открыта (строка ${currentShiftRowId})`);
      } else if (event.type === "closed") {
        console.log(
          `Quick Resto: закрытие ${event.employee.name} не закрывает смену заведения — ` +
            (currentShiftRowId ? `ещё открыты: ${[...openEmployeeIds].join(", ") || "—"}` : "строки смены заведения и так нет"),
        );
      }
    }

    warmedUp = true;
  }

  tick().catch((err) => console.error("Quick Resto: ошибка первого опроса:", err));
  setInterval(() => {
    tick().catch((err) => console.error("Quick Resto: ошибка опроса:", err));
  }, env.QR_POLL_INTERVAL_MS);
}
