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

// --- Выручка по кальянной категории (перенесено из hookah_bot/quickresto.py,
// уже работающего в проде для того же заведения — see get_revenue_by_days) ---

const HOOKAH_GROUP_ID = 147;
const HOOKAH_GROUP_CLASS = "ru.edgex.quickresto.modules.warehouse.nomenclature.dish.DishCategory";
const REPORT_PATH = "/platform/data/front.reports.orders_by_storecategory/select";

interface QuickRestoReportResponse {
  ds?: { type?: string; object?: { totalSum?: number } }[];
  utilityData?: { aggregates?: { totalSum?: number } };
}

// Тот же отчёт, что использует веб-панель для карточки "Выручка" — отфильтрован
// по группе товаров "Кальян" (id=147). businessDayOffsetInMs/timeZone — те же
// магические константы, что и в остальных запросах этого файла (МСК, business
// day начинается в полдень по UTC).
async function fetchRevenueForRange(sinceMs: number, tillMs: number): Promise<number> {
  const params = new URLSearchParams({
    mode: "dateFilter",
    chartsEnabled: "true",
    "extParams[className]": "DateFilter",
    "extParams[dateRange][start]": String(sinceMs),
    "extParams[dateRange][end]": String(tillMs),
    "extParams[dateFrom]": String(sinceMs),
    "extParams[dateTo]": String(tillMs),
    "customParams[includeNestedGroups][eq]": "false",
    "filterField[]": "groupStoreItem",
    "filterOperator[]": "contains",
    "filterValue[0][0][branch]": "true",
    "filterValue[0][0][deleted]": "false",
    "filterValue[0][0][title]": "Кальян",
    "filterValue[0][0][id]": String(HOOKAH_GROUP_ID),
    "filterValue[0][0][className]": HOOKAH_GROUP_CLASS,
    "filterValue[0][0][_SyntheticId]": `${HOOKAH_GROUP_ID}${HOOKAH_GROUP_CLASS}`,
    businessDayOffsetInMs: "43200000",
    timeZone: "-180",
  });

  const data = await qrFetchJson<QuickRestoReportResponse>(`${REPORT_PATH}?${params.toString()}`);

  const branchItem = (data.ds ?? []).find((item) => item.type === "branchItem");
  if (branchItem?.object?.totalSum != null) return Number(branchItem.object.totalSum);
  return Number(data.utilityData?.aggregates?.totalSum ?? 0);
}

// Тот же отчёт без фильтра по категории — вся выручка заведения за диапазон
// (нужна, чтобы получить "бар/кухня" = всё минус кальяны, см. get_month_revenue
// в hookah_bot/quickresto.py — там та же логика totalSum − hookah).
async function fetchTotalRevenueForRange(sinceMs: number, tillMs: number): Promise<number> {
  const params = new URLSearchParams({
    mode: "dateFilter",
    chartsEnabled: "true",
    "extParams[className]": "DateFilter",
    "extParams[dateRange][start]": String(sinceMs),
    "extParams[dateRange][end]": String(tillMs),
    "extParams[dateFrom]": String(sinceMs),
    "extParams[dateTo]": String(tillMs),
    businessDayOffsetInMs: "43200000",
    timeZone: "-180",
  });
  const data = await qrFetchJson<QuickRestoReportResponse>(`${REPORT_PATH}?${params.toString()}`);
  return Number(data.utilityData?.aggregates?.totalSum ?? 0);
}

// Границы одного бизнес-дня (11:00-11:00 МСК) в UTC-миллисекундах для даты,
// заданной в любой таймзоне, плюс ISO-дата этого бизнес-дня (для записи в
// shift_payroll.date) — общее для всех функций выручки ниже.
function businessDayRangeMs(date: Date): { sinceMs: number; tillMs: number; isoDate: string } {
  const msk = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = Number(msk.find((p) => p.type === "year")!.value);
  const m = Number(msk.find((p) => p.type === "month")!.value);
  const d = Number(msk.find((p) => p.type === "day")!.value);

  // 11:00 МСК = 08:00 UTC (МСК = UTC+3, без перехода на летнее время).
  const sinceMs = Date.UTC(y, m - 1, d, 8, 0, 0);
  return { sinceMs, tillMs: sinceMs + 24 * 60 * 60 * 1000, isoDate: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
}

// Выручка по кальянной категории за один бизнес-день: с 11:00 до 11:00
// следующего дня по московскому времени (то же окно, что использует
// hookah_bot для дневной сверки — совпадает с businessDayOffsetInMs=12ч).
export async function fetchHookahRevenueForDate(date: Date): Promise<number> {
  const { sinceMs, tillMs } = businessDayRangeMs(date);
  return fetchRevenueForRange(sinceMs, tillMs);
}

// Выручка по кальянам, "бар/кухня" (всё остальное) и общая — за один
// бизнес-день. hookah/barKitchen оставлены для истории и команды /revenue,
// начисление ЗП (ниже) теперь считается от total у обеих ролей.
export async function fetchRevenueSplitForDate(date: Date): Promise<{ hookah: number; barKitchen: number; total: number; isoDate: string }> {
  const { sinceMs, tillMs, isoDate } = businessDayRangeMs(date);
  const [hookah, total] = await Promise.all([fetchRevenueForRange(sinceMs, tillMs), fetchTotalRevenueForRange(sinceMs, tillMs)]);
  return { hookah, barKitchen: Math.max(0, total - hookah), total, isoDate };
}

// --- Начисление ЗП по закрытой смене (см. supabase/migrations/0004_staff_payroll.sql) ---

type SalaryModel =
  | { type: "fixed"; value: number }
  | { type: "percent"; value: number }
  | { type: "fixed_plus_percent"; base: number; percent: number };

// Актуальная формула (подтверждена Никитой 28.09.2026): 8,5% от ОБЩЕЙ
// выручки заведения за бизнес-день (бар+кальяны+кухня, не только категория
// "Кальян") — каждому сотруднику на смене отдельно, независимо от роли и от
// того, сколько человек в этот день работали (если на кальянах вдвоём — оба
// получают по 8,5%, а не половину каждому). Раньше здесь была
// формула "1000₽+15% от кальянной выручки" (только для роли "кальяны", для
// бара формулы не было вообще) — заменена этой единой формулой. Используется,
// только если у сотрудника ещё не проставлена своя salary_model в Supabase.
const DEFAULT_SALARY_MODEL: SalaryModel = { type: "percent", value: 8.5 };

function computeSalary(model: SalaryModel, revenue: number): number {
  if (model.type === "fixed") return model.value;
  if (model.type === "percent") return Math.round((revenue * model.value) / 100);
  return Math.round(model.base + (revenue * model.percent) / 100);
}

async function fetchStaffSalaryModel(supabase: SupabaseClient, staffId: string): Promise<SalaryModel | null> {
  const { data, error } = await supabase.from("staff").select("salary_model").eq("id", staffId).maybeSingle();
  if (error) {
    console.error("Quick Resto: не удалось прочитать salary_model сотрудника:", error.message);
    return null;
  }
  return (data?.salary_model as SalaryModel | null) ?? null;
}

async function writeShiftPayrollForRole(
  supabase: SupabaseClient,
  shiftRowId: string | null,
  staffId: string,
  role: "bar" | "hookah",
  revenue: number,
  isoDate: string,
) {
  let model = await fetchStaffSalaryModel(supabase, staffId);
  if (!model) model = DEFAULT_SALARY_MODEL; // 8,5% от общей выручки — дефолт для обеих ролей, см. миграцию 0004
  const salary = computeSalary(model, revenue);

  const { error } = await supabase
    .from("shift_payroll")
    .insert({ staff_id: staffId, shift_id: shiftRowId, role, date: isoDate, revenue, salary });
  if (error) {
    console.error(`Quick Resto: не удалось записать начисление (${role}):`, error.message);
  } else {
    console.log(
      `Quick Resto: начислено ${role === "hookah" ? "кальяны" : "бар/кухня"} — ${salary} ₽ (выручка ${Math.round(revenue)} ₽) за ${isoDate}, staff=${staffId}`,
    );
  }
}

// --- Сверка графика с Quick Resto (см. supabase/migrations/0005_schedule_payroll_issues.sql) ---
//
// Источник истины "кто на какой роли" — график, который руководитель
// составляет заранее в мини-аппе (раздел "График и начисления"), а не
// реал-тайм действия в чек-листе смены: их ненадёжно сопоставлять с ролью на
// лету, поэтому сверка происходит на следующий день, пакетно, с фактическими
// данными Quick Resto за уже закрывшийся бизнес-день.

export interface PayrollIssueEvent {
  date: string; // ISO-дата (YYYY-MM-DD)
  role: "bar" | "hookah";
  expectedStaffName: string;
  actualStaffNames: string[];
}

async function fetchStaffName(supabase: SupabaseClient, staffId: string): Promise<string> {
  const { data } = await supabase.from("staff").select("name").eq("id", staffId).maybeSingle();
  return (data?.name as string | undefined) ?? staffId;
}

async function writePayrollIssue(
  supabase: SupabaseClient,
  onIssue: (event: PayrollIssueEvent) => void | Promise<void>,
  dateIso: string,
  role: "bar" | "hookah",
  expectedStaffId: string,
  actualStaffIds: string[],
  revenue: number,
) {
  const { error } = await supabase
    .from("payroll_issues")
    .insert({ date: dateIso, role, expected_staff_id: expectedStaffId, actual_staff_ids: actualStaffIds, revenue });
  if (error) {
    console.error(`Quick Resto: не удалось записать расхождение графика (${dateIso}, ${role}):`, error.message);
    return;
  }
  console.log(`Quick Resto: график не совпал с Quick Resto — ${dateIso}, роль ${role === "hookah" ? "кальяны" : "бар"}. Начисление отложено.`);

  const expectedStaffName = await fetchStaffName(supabase, expectedStaffId);
  const actualStaffNames = await Promise.all(actualStaffIds.map((id) => fetchStaffName(supabase, id)));
  await onIssue({ date: dateIso, role, expectedStaffName, actualStaffNames });
}

async function alreadyHandled(supabase: SupabaseClient, dateIso: string, role: "bar" | "hookah"): Promise<boolean> {
  const [payroll, issue] = await Promise.all([
    supabase.from("shift_payroll").select("id").eq("date", dateIso).eq("role", role).limit(1),
    supabase.from("payroll_issues").select("id").eq("date", dateIso).eq("role", role).limit(1),
  ]);
  return Boolean(payroll.data?.length) || Boolean(issue.data?.length);
}

// Кто реально работал в бизнес-день [sinceMs, tillMs) по Quick Resto —
// пробегаем всех сотрудников терминала и смотрим, есть ли у них запись смены,
// пересекающая это окно (см. ту же логику, что и в watchQuickRestoShifts —
// startTime===endTime означает ещё не закрытую смену).
async function resolveActualWorkedStaffIds(
  supabase: SupabaseClient,
  employees: QuickRestoEmployee[],
  sinceMs: number,
  tillMs: number,
): Promise<Set<string>> {
  const workedStaffIds = new Set<string>();
  for (const employee of employees) {
    let records: WorkshiftStatementRaw[];
    try {
      records = await fetchShiftRecords(employee.id);
    } catch (err) {
      console.error(`Quick Resto: не удалось получить смены сотрудника ${employee.id} для сверки с графиком:`, err);
      continue;
    }
    const worked = records.some((r) => r.startTime < tillMs && r.endTime > sinceMs);
    if (!worked) continue;
    const staffId = await upsertStaffForEmployee(supabase, employee);
    if (staffId) workedStaffIds.add(staffId);
  }
  return workedStaffIds;
}

/** Сверяет график на одну дату с Quick Resto и либо начисляет, либо откладывает начисление (см. writePayrollIssue). */
async function processScheduledDate(
  supabase: SupabaseClient,
  onIssue: (event: PayrollIssueEvent) => void | Promise<void>,
  dateIso: string,
) {
  const { data: scheduleRows, error } = await supabase.from("schedule_entries").select("staff_id, role").eq("date", dateIso);
  if (error) return console.error(`Quick Resto: не удалось прочитать график на ${dateIso}:`, error.message);
  if (!scheduleRows?.length) return; // на эту дату график не выставлен — нечего сверять

  const pendingRoles: { staff_id: string; role: "bar" | "hookah" }[] = [];
  for (const row of scheduleRows as { staff_id: string; role: "bar" | "hookah" }[]) {
    if (!(await alreadyHandled(supabase, dateIso, row.role))) pendingRoles.push(row);
  }
  if (!pendingRoles.length) return; // всё по этой дате уже обработано (начислено или отложено ранее)

  let employees: QuickRestoEmployee[];
  try {
    employees = await fetchEmployees();
  } catch (err) {
    console.error(`Quick Resto: не удалось получить сотрудников для сверки графика на ${dateIso}:`, err);
    return;
  }

  // Полдень МСК того дня — однозначно попадает в нужный бизнес-день независимо
  // от того, в какой момент по UTC выполняется задание.
  const middayMsk = new Date(`${dateIso}T12:00:00+03:00`);
  const { sinceMs, tillMs } = businessDayRangeMs(middayMsk);
  const workedStaffIds = await resolveActualWorkedStaffIds(supabase, employees, sinceMs, tillMs);

  let split: { total: number };
  try {
    split = await fetchRevenueSplitForDate(middayMsk);
  } catch (err) {
    console.error(`Quick Resto: не удалось получить выручку за ${dateIso}:`, err);
    return;
  }

  // Начисление теперь считается от общей выручки заведения (не от
  // кальянной/барной по отдельности) — см. DEFAULT_SALARY_MODEL выше.
  for (const { staff_id, role } of pendingRoles) {
    const revenue = split.total;
    if (workedStaffIds.has(staff_id)) {
      await writeShiftPayrollForRole(supabase, null, staff_id, role, revenue, dateIso);
    } else {
      await writePayrollIssue(supabase, onIssue, dateIso, role, staff_id, [...workedStaffIds], revenue);
    }
  }
}

function mskDateIso(offsetDays: number): string {
  const shifted = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(shifted);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

/**
 * Ежедневное начисление ЗП, в 10:00 МСК. К этому времени бар уже точно
 * закрыт всю ночь, и выручка за бизнес-день (11:00-11:00) больше не
 * изменится. Смотрим не только "вчера", но и последнюю неделю назад — так
 * подхватываются пропущенные дни, если по какой-то причине задание не
 * сработало вовремя (processScheduledDate сам пропускает уже обработанные).
 */
async function runDailyPayrollJob(supabase: SupabaseClient, onIssue: (event: PayrollIssueEvent) => void | Promise<void>) {
  for (let offset = -1; offset >= -7; offset--) {
    await processScheduledDate(supabase, onIssue, mskDateIso(offset));
  }
}

function msUntilNextMoscowHour(hour: number): number {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")!.value);
  const m = Number(parts.find((p) => p.type === "minute")!.value);
  const s = Number(parts.find((p) => p.type === "second")!.value);
  const nowSeconds = h * 3600 + m * 60 + s;
  const targetSeconds = hour * 3600;
  const diffSeconds = targetSeconds > nowSeconds ? targetSeconds - nowSeconds : 24 * 3600 - (nowSeconds - targetSeconds);
  return diffSeconds * 1000;
}

const PAYROLL_JOB_HOUR_MSK = 10;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Планирует runDailyPayrollJob на 10:00 МСК каждый день (первый запуск — на
 * ближайшие 10:00). onIssue вызывается на каждое расхождение графика с Quick
 * Resto — для уведомления руководителя в Telegram (см. index.ts).
 */
export function scheduleDailyPayrollJob(onIssue: (event: PayrollIssueEvent) => void | Promise<void>) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  function run() {
    runDailyPayrollJob(supabase, onIssue).catch((err) => console.error("Quick Resto: ошибка ежедневного начисления ЗП:", err));
    setTimeout(run, ONE_DAY_MS);
  }
  const delay = msUntilNextMoscowHour(PAYROLL_JOB_HOUR_MSK);
  setTimeout(run, delay);
  console.log(`Quick Resto: ежедневное начисление ЗП запланировано на ${PAYROLL_JOB_HOUR_MSK}:00 МСК (через ${Math.round(delay / 60000)} мин)`);
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
  // Начисление ЗП здесь НЕ считаем — оно теперь отдельным ежедневным заданием
  // в 10:00 МСК, см. schedulePayrollJob ниже. Так надёжнее: не зависит от
  // мгновенного детекта закрытия смены (см. известную проблему с задержкой/
  // сбоями статуса смены в claude/quickresto-shift-integration.md), плюс к
  // 10 утра бар уже точно закрыт и выручка за бизнес-день не изменится.
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
