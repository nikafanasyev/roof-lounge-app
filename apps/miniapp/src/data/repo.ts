// Единая точка доступа к данным приложения.
//
// Без настроенного Supabase-проекта (см. .env.example) работает поверх
// in-memory моков (seed.ts) — этого достаточно, чтобы пройти все сценарии
// интерфейса прямо сейчас, без единой настройки.
//
// Если VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY заданы — при старте
// приложения (initData(), вызывается из main.tsx) сторы заполняются реальными
// данными из Supabase, а мутации (createMix, resolveServiceCall и т.д.)
// синхронно обновляют стор для мгновенного отклика интерфейса И параллельно,
// в фоне, пишут то же самое в Supabase — экраны об этом не знают, сигнатуры
// функций не поменялись.
//
// Текущий сотрудник определяется по Telegram-аккаунту (см. ensureCurrentStaff
// ниже) — каждый, кто открывает мини-апп через Telegram, получает свою
// собственную строку staff (или ту, что уже создал бот при входе по ПИН на
// терминале Quick Resto, см. apps/bot/src/quickresto.ts), а не общую демо-запись.

import type {
  Adjustment,
  AdjustmentType,
  AromaDirection,
  AromaTag,
  ChecklistItem,
  Flavor,
  Guest,
  KnowledgeArticle,
  Mix,
  MixItem,
  PayoutRecord,
  PayrollIssue,
  Problem,
  ProblemCategory,
  RoleChecklists,
  SalaryModel,
  ScheduleEntry,
  ServiceCall,
  ServiceCallType,
  Shift,
  ShiftPayrollEntry,
  StaffProfile,
  StaffRole,
  Task,
} from "@/types";
import {
  seedAdjustments,
  seedFlavors,
  seedGuests,
  seedKnowledgeArticles,
  seedMixes,
  seedPayouts,
  seedPayrollIssues,
  seedProblems,
  seedSchedule,
  seedServiceCalls,
  seedShift,
  seedShiftPayroll,
  seedStaffDirectory,
  seedStaffProfile,
  seedTasks,
} from "./seed";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { getTelegramUser } from "@/lib/telegram";
import { computeShiftSalary, DEFAULT_SALARY_MODEL } from "@/lib/payroll";

// --- простой реактивный стор (pub/sub), чтобы экраны обновлялись после мутаций ---

type Listener = () => void;

class Store<T> {
  constructor(private value: T) {}
  private listeners = new Set<Listener>();

  get(): T {
    return this.value;
  }

  set(next: T) {
    this.value = next;
    this.listeners.forEach((l) => l());
  }

  update(fn: (prev: T) => T) {
    this.set(fn(this.value));
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const guestsStore = new Store<Guest[]>(seedGuests);
export const flavorsStore = new Store<Flavor[]>(seedFlavors);
export const aromaTagsStore = new Store<AromaTag[]>([]); // справочник вкусового квиза гостя, грузится из Supabase (см. loadAromaTags)
export const mixesStore = new Store<Mix[]>(seedMixes);
export const serviceCallsStore = new Store<ServiceCall[]>(seedServiceCalls);
export const shiftStore = new Store<Shift>(seedShift);
export const problemsStore = new Store<Problem[]>(seedProblems);
export const tasksStore = new Store<Task[]>(seedTasks);
export const staffProfileStore = new Store<StaffProfile>(seedStaffProfile);
export const staffDirectoryStore = new Store<StaffProfile[]>(seedStaffDirectory);
export const shiftPayrollStore = new Store<ShiftPayrollEntry[]>(seedShiftPayroll);
export const payoutsStore = new Store<PayoutRecord[]>(seedPayouts);
export const adjustmentsStore = new Store<Adjustment[]>(seedAdjustments);
export const scheduleStore = new Store<ScheduleEntry[]>(seedSchedule);
export const payrollIssuesStore = new Store<PayrollIssue[]>(seedPayrollIssues);
export const knowledgeStore = new Store<KnowledgeArticle[]>(seedKnowledgeArticles);

const uid = () => crypto.randomUUID();

// --- Синхронизация с Supabase (см. заголовок файла) ---

// Фолбэк вне Telegram (обычный браузер при разработке, без initDataUnsafe.user) —
// см. ensureCurrentStaff ниже. В реальном Telegram-клиенте используется
// настоящий telegram_id пользователя, отдельно от этого фолбэка.
const DEMO_STAFF_TELEGRAM_ID = 1;
const DEMO_STAFF_NAME = "Никита Афанасьев";

let syncInitialized = false;
const staffNameById = new Map<string, string>();
const tableIdByNumber = new Map<number, string>();
const tableNumberById = new Map<string, number>();

function logSyncError(scope: string, error: unknown) {
  // MVP: логируем в консоль, не блокируем интерфейс. Экран уже обновился
  // оптимистично из локального стора независимо от результата записи в Supabase.
  console.error(`[supabase:${scope}]`, error);
}

/** Вызывается один раз при старте приложения (см. main.tsx). Без Supabase — no-op. */
export async function initData(): Promise<void> {
  if (!isSupabaseConfigured || !supabase || syncInitialized) return;
  syncInitialized = true;
  try {
    await ensureCurrentStaff();
    await loadTables();
    await Promise.all([
      loadFlavors(),
      loadGuests(),
      loadAromaTags(),
      loadMixes(),
      loadServiceCalls(),
      loadShift(),
      loadProblems(),
      loadTasks(),
      loadStaffDirectory(),
      loadShiftPayroll(),
      loadAdjustments(),
      loadPayouts(),
      loadSchedule(),
      loadPayrollIssues(),
    ]);
    subscribeRealtime();
  } catch (error) {
    logSyncError("initData", error);
  }
}

/**
 * Определяет текущего сотрудника по Telegram-аккаунту (initDataUnsafe.user.id,
 * см. lib/telegram.ts) — раньше здесь всегда была одна служебная демо-запись
 * DEMO_STAFF_ID, из-за чего все, кто открывал мини-апп, писались "за одного
 * человека". Вне Telegram (обычный браузер при разработке) getTelegramUser()
 * вернёт null — тогда используем DEMO_STAFF_TELEGRAM_ID, как и раньше.
 *
 * upsert с ignoreDuplicates: строка для этого telegram_id может уже
 * существовать — её мог создать бот раньше (apps/bot/src/quickresto.ts
 * upsertStaffForEmployee, при входе по ПИН на терминале Quick Resto). Тогда
 * ничего не перезаписываем, а просто читаем то, что уже есть (имя из Quick
 * Resto точнее, чем из Telegram; salary_model и т.д. мог проставить бот).
 */
async function ensureCurrentStaff() {
  const tgUser = getTelegramUser();
  const telegramId = tgUser?.id ?? DEMO_STAFF_TELEGRAM_ID;
  const fallbackName = tgUser ? `${tgUser.first_name}${tgUser.last_name ? ` ${tgUser.last_name}` : ""}`.trim() : DEMO_STAFF_NAME;

  const { error: upsertError } = await supabase!
    .from("staff")
    .upsert({ telegram_id: telegramId, name: fallbackName, role: "master" }, { onConflict: "telegram_id", ignoreDuplicates: true });
  if (upsertError) logSyncError("ensureCurrentStaff:upsert", upsertError);

  const { data: row, error: selectError } = await supabase!
    .from("staff")
    .select("id, name, work_role, salary_model, photo_url, phone, email, medical_book_number, medical_book_expiry, hired_at")
    .eq("telegram_id", telegramId)
    .single();
  if (selectError || !row) return logSyncError("ensureCurrentStaff:select", selectError);

  staffNameById.set(row.id, row.name ?? fallbackName);
  staffProfileStore.update((prev) => ({
    ...prev,
    id: row.id,
    name: row.name ?? fallbackName,
    photoUrl: row.photo_url ?? prev.photoUrl,
    phone: row.phone ?? prev.phone,
    email: row.email ?? prev.email,
    medicalBookNumber: row.medical_book_number ?? prev.medicalBookNumber,
    medicalBookExpiry: row.medical_book_expiry ?? prev.medicalBookExpiry,
    hiredAt: row.hired_at ?? prev.hiredAt,
    // Модель ЗП и роль на смене — из Supabase, если уже проставлены вручную
    // (руководитель через Supabase Studio), иначе дефолт 8,5% от общей
    // выручки (см. DEFAULT_SALARY_MODEL).
    salaryModel: (row.salary_model as SalaryModel | null) ?? DEFAULT_SALARY_MODEL,
    role: (row.work_role as StaffRole | null) ?? prev.role,
  }));
}

async function loadTables() {
  const { data, error } = await supabase!.from("restaurant_tables").select("*");
  if (error) return logSyncError("loadTables", error);
  tableIdByNumber.clear();
  tableNumberById.clear();
  for (const row of data ?? []) {
    tableIdByNumber.set(row.number, row.id);
    tableNumberById.set(row.id, row.number);
  }
}

async function getOrCreateTableId(tableNumber: number): Promise<string | null> {
  if (!supabase) return null;
  const cached = tableIdByNumber.get(tableNumber);
  if (cached) return cached;
  const { data, error } = await supabase
    .from("restaurant_tables")
    .upsert({ number: tableNumber }, { onConflict: "number" })
    .select()
    .single();
  if (error || !data) {
    logSyncError("getOrCreateTableId", error);
    return null;
  }
  tableIdByNumber.set(data.number, data.id);
  tableNumberById.set(data.id, data.number);
  return data.id;
}

async function loadFlavors() {
  const { data, error } = await supabase!.from("flavors").select("*").eq("active", true);
  if (error) return logSyncError("loadFlavors", error);
  flavorsStore.set(
    (data ?? []).map((r) => ({
      id: r.id,
      brand: r.brand,
      name: r.name,
      code: r.code ?? "",
      categories: r.categories ?? [],
    })),
  );
}

async function loadAromaTags() {
  const { data, error } = await supabase!.from("aroma_tags").select("*").order("name");
  if (error) return logSyncError("loadAromaTags", error);
  aromaTagsStore.set(
    (data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      direction: r.direction as AromaDirection,
      custom: Boolean(r.custom),
    })),
  );
}

// ВАЖНО: только эти колонки, не select("*") — initData() грузит это при
// любом открытии мини-аппа, включая гостевой QR-сценарий без авторизации
// (см. /table/:token). Телефон/дату рождения/бонусы/код лояльности других
// гостей так светить нельзя — их тянем точечно, по конкретному гостю (см.
// findGuestByPhone/getGuestByIdRemote ниже).
async function loadGuests() {
  const { data, error } = await supabase!.from("guests").select("id, display_name, badges, telegram_id");
  if (error) return logSyncError("loadGuests", error);
  guestsStore.set(
    (data ?? []).map((r) => ({
      id: r.id,
      displayName: r.display_name,
      badges: r.badges ?? [],
      tableTelegramId: r.telegram_id ? String(r.telegram_id) : undefined,
    })),
  );
}

async function loadMixes() {
  const [mixesRes, itemsRes, ratingsRes] = await Promise.all([
    supabase!.from("mixes").select("*").order("created_at", { ascending: false }),
    supabase!.from("mix_items").select("*"),
    supabase!.from("mix_ratings").select("*"),
  ]);
  if (mixesRes.error) return logSyncError("loadMixes", mixesRes.error);
  if (itemsRes.error) logSyncError("loadMixes:items", itemsRes.error);
  if (ratingsRes.error) logSyncError("loadMixes:ratings", ratingsRes.error);

  const itemsByMix = new Map<string, MixItem[]>();
  for (const it of itemsRes.data ?? []) {
    const list = itemsByMix.get(it.mix_id) ?? [];
    list.push({ flavorId: it.flavor_id, sharePercent: it.share_percent });
    itemsByMix.set(it.mix_id, list);
  }
  const ratingByMix = new Map<string, number>();
  for (const r of ratingsRes.data ?? []) {
    ratingByMix.set(r.mix_id, r.rating);
  }

  mixesStore.set(
    (mixesRes.data ?? []).map((r) => ({
      id: r.id,
      guestId: r.guest_id,
      masterId: r.master_id,
      masterName: staffNameById.get(r.master_id) ?? DEMO_STAFF_NAME,
      title: r.title,
      coverEmoji: r.cover_url ?? "🍃",
      items: itemsByMix.get(r.id) ?? [],
      strength: r.strength ?? 0,
      bowlType: r.bowl_type ?? undefined,
      density: r.density ?? undefined,
      masterNote: r.master_note ?? undefined,
      description: r.description ?? undefined,
      tags: r.tags ?? [],
      createdAt: r.created_at,
      rating: ratingByMix.get(r.id),
    })),
  );
}

async function loadServiceCalls() {
  const { data, error } = await supabase!.from("service_calls").select("*").order("created_at", { ascending: false });
  if (error) return logSyncError("loadServiceCalls", error);
  serviceCallsStore.set(
    (data ?? []).map((r) => ({
      id: r.id,
      tableNumber: tableNumberById.get(r.table_id) ?? 0,
      type: r.type,
      status: r.status,
      createdAt: r.created_at,
      resolvedAt: r.resolved_at ?? undefined,
    })),
  );
}

async function loadShift() {
  const { data, error } = await supabase!
    .from("shifts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return logSyncError("loadShift", error);
  if (!data) return; // смен ещё не было — оставляем закрытую заготовку из seed
  const prev = shiftStore.get();
  shiftStore.set({
    id: data.id,
    status: data.closed_at ? "closed" : data.opened_at ? "open" : "closed",
    openedBy: data.opened_by ? staffNameById.get(data.opened_by) ?? DEMO_STAFF_NAME : undefined,
    openedAt: data.opened_at ?? undefined,
    closedBy: data.closed_by ? staffNameById.get(data.closed_by) ?? DEMO_STAFF_NAME : undefined,
    closedAt: data.closed_at ?? undefined,
    bar: {
      openChecklist: data.bar_open_checklist?.length ? data.bar_open_checklist : prev.bar.openChecklist,
      closeChecklist: data.bar_close_checklist?.length ? data.bar_close_checklist : prev.bar.closeChecklist,
      openedBy: data.bar_opened_by ? staffNameById.get(data.bar_opened_by) ?? DEMO_STAFF_NAME : undefined,
      openedAt: data.bar_opened_at ?? undefined,
      closedBy: data.bar_closed_by ? staffNameById.get(data.bar_closed_by) ?? DEMO_STAFF_NAME : undefined,
      closedAt: data.bar_closed_at ?? undefined,
    },
    hookah: {
      openChecklist: data.hookah_open_checklist?.length ? data.hookah_open_checklist : prev.hookah.openChecklist,
      closeChecklist: data.hookah_close_checklist?.length ? data.hookah_close_checklist : prev.hookah.closeChecklist,
      openedBy: data.hookah_opened_by ? staffNameById.get(data.hookah_opened_by) ?? DEMO_STAFF_NAME : undefined,
      openedAt: data.hookah_opened_at ?? undefined,
      closedBy: data.hookah_closed_by ? staffNameById.get(data.hookah_closed_by) ?? DEMO_STAFF_NAME : undefined,
      closedAt: data.hookah_closed_at ?? undefined,
    },
    handoverNote: data.handover_note ?? undefined,
  });
}

async function loadProblems() {
  const { data, error } = await supabase!.from("problems").select("*").order("created_at", { ascending: false });
  if (error) return logSyncError("loadProblems", error);
  problemsStore.set(
    (data ?? []).map((r) => ({
      id: r.id,
      category: r.category,
      description: r.description,
      reportedBy: r.reported_by ? staffNameById.get(r.reported_by) ?? DEMO_STAFF_NAME : "",
      createdAt: r.created_at,
      status: r.status,
      assignee: r.assignee ? staffNameById.get(r.assignee) : undefined,
    })),
  );
}

async function loadTasks() {
  const { data, error } = await supabase!.from("tasks").select("*").order("created_at", { ascending: false });
  if (error) return logSyncError("loadTasks", error);
  tasksStore.set(
    (data ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      dueDate: r.due_date ?? undefined,
      assignee: r.assignee ? staffNameById.get(r.assignee) : undefined,
      done: r.done,
    })),
  );
}

async function loadStaffDirectory() {
  const { data, error } = await supabase!.from("staff").select("*");
  if (error) return logSyncError("loadStaffDirectory", error);
  for (const r of data ?? []) staffNameById.set(r.id, r.name);
  staffDirectoryStore.set(
    (data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      photoUrl: r.photo_url ?? undefined,
      phone: r.phone ?? undefined,
      email: r.email ?? undefined,
      medicalBookNumber: r.medical_book_number ?? undefined,
      medicalBookExpiry: r.medical_book_expiry ?? undefined,
      hiredAt: r.hired_at ?? r.created_at,
      // Раньше без явной salary_model сотрудник вообще не попадал в этот
      // список (карточка "Сотрудники", выбор в "Графике") — из-за этого
      // список почти всегда оказывался пустым, потому что вручную модель
      // почти никто не проставлял. Теперь есть настоящий дефолт (8,5% от
      // общей выручки, см. DEFAULT_SALARY_MODEL) — фильтр убран, все, кто
      // когда-то вошёл по ПИН/Telegram, считаются сотрудниками.
      salaryModel: (r.salary_model as SalaryModel | null) ?? DEFAULT_SALARY_MODEL,
      role: (r.work_role as StaffRole | null) ?? undefined,
    })),
  );
}

async function loadShiftPayroll() {
  const { data, error } = await supabase!.from("shift_payroll").select("*").order("date", { ascending: false });
  if (error) return logSyncError("loadShiftPayroll", error);
  shiftPayrollStore.set(
    (data ?? []).map((r) => ({
      id: r.id,
      staffId: r.staff_id,
      date: r.date,
      revenue: Number(r.revenue),
      salary: Number(r.salary),
      role: (r.role as StaffRole | null) ?? undefined,
    })),
  );
}

async function loadAdjustments() {
  const { data, error } = await supabase!.from("adjustments").select("*").order("date", { ascending: false });
  if (error) return logSyncError("loadAdjustments", error);
  adjustmentsStore.set(
    (data ?? []).map((r) => ({
      id: r.id,
      staffId: r.staff_id,
      type: r.type,
      amount: Number(r.amount),
      reason: r.reason,
      date: r.date,
    })),
  );
}

async function loadPayouts() {
  const { data, error } = await supabase!.from("payouts").select("*").order("date", { ascending: false });
  if (error) return logSyncError("loadPayouts", error);
  payoutsStore.set(
    (data ?? []).map((r) => ({
      id: r.id,
      staffId: r.staff_id,
      date: r.date,
      amount: Number(r.amount),
      note: r.note ?? undefined,
    })),
  );
}

async function loadSchedule() {
  const { data, error } = await supabase!.from("schedule_entries").select("*").order("date", { ascending: true });
  if (error) return logSyncError("loadSchedule", error);
  scheduleStore.set(
    (data ?? []).map((r) => ({
      id: r.id,
      staffId: r.staff_id,
      role: r.role as StaffRole,
      date: r.date,
      startTime: r.start_time,
      endTime: r.end_time,
    })),
  );
}

async function loadPayrollIssues() {
  const { data, error } = await supabase!.from("payroll_issues").select("*").order("date", { ascending: false });
  if (error) return logSyncError("loadPayrollIssues", error);
  payrollIssuesStore.set(
    (data ?? []).map((r) => ({
      id: r.id,
      date: r.date,
      role: r.role as StaffRole,
      expectedStaffId: r.expected_staff_id,
      actualStaffIds: r.actual_staff_ids ?? [],
      revenue: Number(r.revenue),
      resolved: r.resolved,
    })),
  );
}

function subscribeRealtime() {
  if (!supabase) return;
  supabase
    .channel("roof-lounge-sync")
    .on("postgres_changes", { event: "*", schema: "public", table: "mixes" }, () => loadMixes())
    .on("postgres_changes", { event: "*", schema: "public", table: "mix_items" }, () => loadMixes())
    .on("postgres_changes", { event: "*", schema: "public", table: "mix_ratings" }, () => loadMixes())
    .on("postgres_changes", { event: "*", schema: "public", table: "guests" }, () => loadGuests())
    .on("postgres_changes", { event: "*", schema: "public", table: "service_calls" }, () => loadServiceCalls())
    .on("postgres_changes", { event: "*", schema: "public", table: "shifts" }, () => loadShift())
    .on("postgres_changes", { event: "*", schema: "public", table: "problems" }, () => loadProblems())
    .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => loadTasks())
    .on("postgres_changes", { event: "*", schema: "public", table: "staff" }, () => loadStaffDirectory())
    .on("postgres_changes", { event: "*", schema: "public", table: "shift_payroll" }, () => loadShiftPayroll())
    .on("postgres_changes", { event: "*", schema: "public", table: "adjustments" }, () => loadAdjustments())
    .on("postgres_changes", { event: "*", schema: "public", table: "payouts" }, () => loadPayouts())
    .on("postgres_changes", { event: "*", schema: "public", table: "schedule_entries" }, () => loadSchedule())
    .on("postgres_changes", { event: "*", schema: "public", table: "payroll_issues" }, () => loadPayrollIssues())
    .subscribe();
}

// --- Гости и вкусовой профиль ---

export function listGuests(): Guest[] {
  return guestsStore.get();
}

export function getGuest(id: string): Guest | undefined {
  return guestsStore.get().find((g) => g.id === id);
}

export function listMixesForGuest(guestId: string): Mix[] {
  return mixesStore
    .get()
    .filter((m) => m.guestId === guestId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function rateMix(mixId: string, rating: number) {
  mixesStore.update((mixes) => mixes.map((m) => (m.id === mixId ? { ...m, rating } : m)));
  if (isSupabaseConfigured && supabase) {
    const mix = mixesStore.get().find((m) => m.id === mixId);
    if (mix) {
      supabase
        .from("mix_ratings")
        .upsert({ mix_id: mixId, guest_id: mix.guestId, rating }, { onConflict: "mix_id,guest_id" })
        .then(({ error }) => error && logSyncError("rateMix", error));
    }
  }
}

export function removeMix(mixId: string) {
  mixesStore.update((mixes) => mixes.filter((m) => m.id !== mixId));
  if (isSupabaseConfigured && supabase) {
    supabase
      .from("mixes")
      .delete()
      .eq("id", mixId)
      .then(({ error }) => error && logSyncError("removeMix", error));
  }
}

export function getFlavor(id: string): Flavor | undefined {
  return flavorsStore.get().find((f) => f.id === id);
}

export function searchFlavors(query: string): Flavor[] {
  const q = query.trim().toLowerCase();
  if (!q) return flavorsStore.get();
  return flavorsStore
    .get()
    .filter((f) => f.brand.toLowerCase().includes(q) || f.name.toLowerCase().includes(q));
}

/** Вкусовой профиль гостя, посчитанный из истории миксов (аналог taste_profile). */
export interface TasteProfile {
  topCategories: string[];
  averageStrength: number | null;
  categoryShare: Record<string, number>; // 0..1, для шкал "Любит"
  favoriteMixes: Mix[];
}

export function computeTasteProfile(guestId: string): TasteProfile {
  const mixes = listMixesForGuest(guestId);
  const categoryWeight: Record<string, number> = {};
  let strengthSum = 0;
  let strengthCount = 0;

  for (const mix of mixes) {
    if (mix.strength) {
      strengthSum += mix.strength;
      strengthCount += 1;
    }
    for (const item of mix.items) {
      const flavor = getFlavor(item.flavorId);
      if (!flavor) continue;
      const weight = (item.sharePercent / 100) * (mix.rating ?? 3); // выше оценка — сильнее влияет
      for (const cat of flavor.categories) {
        categoryWeight[cat] = (categoryWeight[cat] ?? 0) + weight;
      }
    }
  }

  const maxWeight = Math.max(1, ...Object.values(categoryWeight));
  const categoryShare: Record<string, number> = {};
  for (const [cat, w] of Object.entries(categoryWeight)) {
    categoryShare[cat] = w / maxWeight;
  }

  const topCategories = Object.entries(categoryWeight)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([cat]) => cat);

  const favoriteMixes = [...mixes]
    .filter((m) => (m.rating ?? 0) >= 4)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));

  return {
    topCategories,
    averageStrength: strengthCount ? strengthSum / strengthCount : null,
    categoryShare,
    favoriteMixes,
  };
}

// --- Сборка микса ---

export function computeStrengthFromItems(items: MixItem[]): number {
  // Заглушка вместо реальной формулы крепости по табакам — усредняем по позициям.
  if (!items.length) return 0;
  const total = items.reduce((sum, it) => {
    const flavor = getFlavor(it.flavorId);
    const base = flavor?.categories.includes("Чайный") ? 2 : 3;
    return sum + base * (it.sharePercent / 100);
  }, 0);
  return Math.max(1, Math.min(5, Math.round(total)));
}

export function createMix(input: {
  guestId: string;
  masterId: string;
  masterName: string;
  title: string;
  coverEmoji: string;
  items: MixItem[];
  bowlType?: string;
  density?: string;
  masterNote?: string;
  description?: string;
  tags: string[];
}): Mix {
  const mix: Mix = {
    id: uid(),
    ...input,
    strength: computeStrengthFromItems(input.items),
    createdAt: new Date().toISOString(),
  };
  mixesStore.update((mixes) => [mix, ...mixes]);

  if (isSupabaseConfigured && supabase) {
    supabase
      .from("mixes")
      .insert({
        id: mix.id,
        guest_id: mix.guestId,
        master_id: getStaffProfile().id,
        title: mix.title,
        cover_url: mix.coverEmoji,
        strength: mix.strength,
        bowl_type: mix.bowlType,
        density: mix.density,
        master_note: mix.masterNote,
        description: mix.description,
        tags: mix.tags,
        created_at: mix.createdAt,
      })
      .then(({ error }) => {
        if (error) return logSyncError("createMix", error);
        if (!mix.items.length) return;
        supabase!
          .from("mix_items")
          .insert(mix.items.map((it) => ({ mix_id: mix.id, flavor_id: it.flavorId, share_percent: it.sharePercent })))
          .then(({ error: itemsError }) => itemsError && logSyncError("createMix:items", itemsError));
      });
  }

  return mix;
}

// --- QR-вызовы персонала (гостевой сценарий за столом) ---

export function listServiceCalls(): ServiceCall[] {
  return [...serviceCallsStore.get()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createServiceCall(tableNumber: number, type: ServiceCallType, guestId?: string): ServiceCall {
  const call: ServiceCall = {
    id: uid(),
    tableNumber,
    type,
    status: "open",
    createdAt: new Date().toISOString(),
    guestId,
  };
  serviceCallsStore.update((calls) => [call, ...calls]);

  if (isSupabaseConfigured && supabase) {
    getOrCreateTableId(tableNumber).then((tableId) => {
      if (!tableId) return;
      supabase!
        .from("service_calls")
        .insert({
          id: call.id,
          table_id: tableId,
          type: call.type,
          status: call.status,
          created_at: call.createdAt,
          guest_id: guestId ?? null,
        })
        .then(({ error }) => error && logSyncError("createServiceCall", error));
    });
  }

  return call;
}

// --- Гостевой профиль (QR на столе -> /table/:token, см. screens/guest/) ---
//
// Отдельная личность от сотрудников/мастера: гость заходит по телефону, без
// SMS-кода на старте (см. обсуждение с Никитой 11.10.2026) — если телефон
// уже есть в базе, сразу попадает в свой профиль, иначе короткая регистрация
// (ФИО, телефон, дата рождения) и вкусовой квиз. Личность хранится в
// localStorage на устройстве гостя (см. screens/guest/GuestFlow.tsx), не
// привязана к Telegram.
//
// Эти функции НЕ используют guestsStore (он урезан до id/displayName/badges
// для общего справочника у мастера, см. loadGuests выше) — читают/пишут
// Supabase напрямую, по одному гостю за раз, чтобы не тянуть чужие
// телефоны/даты рождения в браузер первого встречного со сканом QR.

function mapGuestRow(r: Record<string, unknown>): Guest {
  return {
    id: r.id as string,
    displayName: r.display_name as string,
    badges: (r.badges as string[] | null) ?? [],
    tableTelegramId: r.telegram_id ? String(r.telegram_id) : undefined,
    phone: (r.phone as string | null) ?? undefined,
    birthDate: (r.birth_date as string | null) ?? undefined,
    loyaltyCode: (r.loyalty_code as string | null) ?? undefined,
    bonusPoints: Number(r.bonus_points ?? 0),
    lastVisitAt: (r.last_visit_at as string | null) ?? undefined,
    tasteDirections: (r.taste_directions as AromaDirection[] | null) ?? [],
    likedAromaIds: (r.liked_aroma_ids as string[] | null) ?? [],
    dislikedAromaIds: (r.disliked_aroma_ids as string[] | null) ?? [],
  };
}

/** Нормализация ввода — сравниваем телефоны по цифрам, не по форматированию (+7/8, пробелы, скобки). */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && (digits[0] === "7" || digits[0] === "8")) return "7" + digits.slice(1);
  if (digits.length === 10) return "7" + digits;
  return digits;
}

export async function findGuestByPhone(phone: string): Promise<Guest | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const normalized = normalizePhone(phone);
  const { data, error } = await supabase.from("guests").select("*").eq("phone", normalized).maybeSingle();
  if (error) {
    logSyncError("findGuestByPhone", error);
    return null;
  }
  return data ? mapGuestRow(data) : null;
}

export async function getGuestByIdRemote(guestId: string): Promise<Guest | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data, error } = await supabase.from("guests").select("*").eq("id", guestId).maybeSingle();
  if (error) {
    logSyncError("getGuestByIdRemote", error);
    return null;
  }
  return data ? mapGuestRow(data) : null;
}

export async function registerGuest(input: { phone: string; displayName: string; birthDate: string }): Promise<Guest | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const normalized = normalizePhone(input.phone);
  const { data, error } = await supabase
    .from("guests")
    .insert({ phone: normalized, display_name: input.displayName, birth_date: input.birthDate, last_visit_at: new Date().toISOString() })
    .select("*")
    .single();
  if (error) {
    logSyncError("registerGuest", error);
    return null;
  }
  return mapGuestRow(data);
}

export async function saveGuestTasteProfile(
  guestId: string,
  profile: { tasteDirections: AromaDirection[]; likedAromaIds: string[]; dislikedAromaIds: string[] },
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  const { error } = await supabase
    .from("guests")
    .update({
      taste_directions: profile.tasteDirections,
      liked_aroma_ids: profile.likedAromaIds,
      disliked_aroma_ids: profile.dislikedAromaIds,
    })
    .eq("id", guestId);
  if (error) logSyncError("saveGuestTasteProfile", error);
}

/** Отмечает визит (вызывается при открытии главного гостевого экрана). */
export async function touchGuestVisit(guestId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  const { error } = await supabase.from("guests").update({ last_visit_at: new Date().toISOString() }).eq("id", guestId);
  if (error) logSyncError("touchGuestVisit", error);
}

export function listAromaTags(): AromaTag[] {
  return aromaTagsStore.get();
}

export function listAromaTagsByDirection(direction: AromaDirection): AromaTag[] {
  return aromaTagsStore.get().filter((t) => t.direction === direction);
}

export function searchAromaTags(query: string): AromaTag[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return aromaTagsStore.get().filter((t) => t.name.toLowerCase().includes(q));
}

/** N случайных ароматов (для квиза — показываем не весь список сразу, см. обсуждение с Никитой 11.10.2026). */
export function randomAromaTags(count: number, excludeIds: string[] = []): AromaTag[] {
  const pool = aromaTagsStore.get().filter((t) => !excludeIds.includes(t.id));
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/** Гость добавляет свой аромат, если в списке нет подходящего — сразу доступен для выбора (локально и в общем справочнике). */
export async function addCustomAromaTag(name: string, direction: AromaDirection): Promise<AromaTag | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (!isSupabaseConfigured || !supabase) {
    const local: AromaTag = { id: uid(), name: trimmed, direction, custom: true };
    aromaTagsStore.update((list) => [...list, local]);
    return local;
  }
  const { data, error } = await supabase
    .from("aroma_tags")
    .upsert({ name: trimmed, direction, custom: true }, { onConflict: "name" })
    .select("*")
    .single();
  if (error || !data) {
    logSyncError("addCustomAromaTag", error);
    return null;
  }
  const tag: AromaTag = { id: data.id, name: data.name, direction: data.direction as AromaDirection, custom: Boolean(data.custom) };
  aromaTagsStore.update((list) => (list.some((t) => t.id === tag.id) ? list : [...list, tag]));
  return tag;
}

export function resolveServiceCall(id: string) {
  const resolvedAt = new Date().toISOString();
  serviceCallsStore.update((calls) =>
    calls.map((c) => (c.id === id ? { ...c, status: "resolved", resolvedAt } : c)),
  );
  if (isSupabaseConfigured && supabase) {
    supabase
      .from("service_calls")
      .update({ status: "resolved", resolved_at: resolvedAt, resolved_by: getStaffProfile().id })
      .eq("id", id)
      .then(({ error }) => error && logSyncError("resolveServiceCall", error));
  }
}

export function averageReactionMinutes(): number | null {
  const resolved = serviceCallsStore.get().filter((c) => c.resolvedAt);
  if (!resolved.length) return null;
  const totalMs = resolved.reduce(
    (sum, c) => sum + (new Date(c.resolvedAt!).getTime() - new Date(c.createdAt).getTime()),
    0,
  );
  return Math.round(totalMs / resolved.length / 60000);
}

// --- Смена персонала ---
//
// Упрощение MVP: и в моках, и в Supabase текущая смена — одна изменяемая
// запись (id не меняется между открытием/закрытием), а не история по одной
// строке на смену. Полноценный лог смен — отдельная доработка на будущее.

export function getShift(): Shift {
  return shiftStore.get();
}

// Статус смены (открыта/закрыта, кем и когда) теперь выставляет бот через
// интеграцию с Quick Resto (apps/bot/src/quickresto.ts, по ПИН-входу
// сотрудника на терминале) — см. claude/quickresto-shift-integration.md в
// проекте. Отсюда мы больше НЕ пишем opened_by/opened_at/closed_by/closed_at,
// чтобы не перезатирать то, что записал бот, — только чек-листы и заметку
// передачи смены, точечными update по id уже существующей строки.
function roleChecklistColumn(role: StaffRole, kind: "open" | "close"): string {
  return `${role}_${kind}_checklist`;
}

function syncChecklist(role: StaffRole, kind: "open" | "close", items: ChecklistItem[]) {
  if (!isSupabaseConfigured || !supabase) return;
  supabase
    .from("shifts")
    .update({ [roleChecklistColumn(role, kind)]: items })
    .eq("id", shiftStore.get().id)
    .then(({ error }) => error && logSyncError("syncChecklist", error));
}

// {role}_opened_by / {role}_closed_by — кто именно из "универсалов" на смене
// отвечал за бар/кальяны (не путать с opened_by/closed_at на самой строке —
// это венью-статус из Quick Resto, см. комментарий выше). Нужно для
// автоматического начисления ЗП: бот при закрытии смены читает эти поля,
// чтобы понять, кому какую выручку начислять (apps/bot/src/quickresto.ts
// writePayrollForClosedShift).
function roleStaffColumn(role: StaffRole, kind: "open" | "close"): string {
  return kind === "open" ? `${role}_opened_by` : `${role}_closed_by`;
}

function syncRoleClaim(role: StaffRole, kind: "open" | "close") {
  if (!isSupabaseConfigured || !supabase) return;
  supabase
    .from("shifts")
    .update({ [roleStaffColumn(role, kind)]: getStaffProfile().id })
    .eq("id", shiftStore.get().id)
    .then(({ error }) => error && logSyncError("syncRoleClaim", error));
}

/**
 * Раньше статус смены заведения (открыта/закрыта) целиком приходил из Quick
 * Resto (по ПИН-входу на терминале) — но этот детект оказался ненадёжным
 * (задержки, сотрудники без личных ПИНов, см. claude/quickresto-shift-integration.md),
 * из-за чего кнопка "Отправить" в чек-листе открытия переставала реально
 * что-либо открывать: чек-лист и фото уходили, а статус смены не менялся.
 * Возвращаем кнопку как источник истины: если смена ещё не открыта — создаём
 * новую строку в `shifts` (или просто помечаем локально открытой без
 * Supabase). Quick Resto по-прежнему опрашивается ботом и шлёт уведомления в
 * Telegram, но на статус в мини-аппе больше не влияет.
 */
async function openVenueShiftIfNeeded(): Promise<string> {
  const current = shiftStore.get();
  if (current.status === "open") return current.id;

  const openedAt = new Date().toISOString();
  const openedByName = getStaffProfile().name;
  // Помечаем открытой сразу, не дожидаясь ответа Supabase, — чтобы интерфейс
  // не "подвисал" на плохой связи.
  shiftStore.update((s) => ({ ...s, status: "open", openedBy: openedByName, openedAt }));

  if (!isSupabaseConfigured || !supabase) return current.id;

  const staffId = getStaffProfile().id;
  const { data, error } = await supabase
    .from("shifts")
    .insert({
      opened_by: staffId || null,
      opened_at: openedAt,
      bar_open_checklist: current.bar.openChecklist,
      bar_close_checklist: current.bar.closeChecklist,
      hookah_open_checklist: current.hookah.openChecklist,
      hookah_close_checklist: current.hookah.closeChecklist,
    })
    .select("id")
    .single();

  if (error || !data) {
    logSyncError("openVenueShiftIfNeeded", error);
    return current.id;
  }

  const newId = data.id as string;
  shiftStore.update((s) => ({ ...s, id: newId }));
  return newId;
}

/** Закрывает смену заведения на кнопку — см. комментарий у openVenueShiftIfNeeded. */
function closeVenueShift(closedBy: string, closedAt: string, handoverNote?: string) {
  if (!isSupabaseConfigured || !supabase) return;
  const staffId = getStaffProfile().id;
  supabase
    .from("shifts")
    .update({
      closed_by: staffId || null,
      closed_at: closedAt,
      ...(handoverNote ? { handover_note: handoverNote } : {}),
    })
    .eq("id", shiftStore.get().id)
    .then(({ error }) => error && logSyncError("closeVenueShift", error));
}

/**
 * Фото открытия/закрытия смены НЕ сохраняется у нас: загружаем в Storage-бакет
 * shift-photos и кладём строку в shift_photo_uploads — бот (apps/bot) подхватывает
 * её через Realtime, пересылает фото руководителю в Telegram и сразу удаляет и
 * файл, и запись. Без Supabase — просто no-op, фото живёт только в памяти вкладки.
 */
function uploadAndNotifyShiftPhoto(role: StaffRole, kind: "open" | "close", blob: Blob, staffName: string) {
  if (!isSupabaseConfigured || !supabase) return;
  const shiftId = shiftStore.get().id;
  const path = `${shiftId}/${role}-${kind}-${Date.now()}.jpg`;
  supabase.storage
    .from("shift-photos")
    .upload(path, blob, { contentType: "image/jpeg" })
    .then(({ error: uploadError }) => {
      if (uploadError) return logSyncError("uploadShiftPhoto", uploadError);
      supabase!
        .from("shift_photo_uploads")
        .insert({ shift_id: shiftId, kind, role, storage_path: path, staff_name: staffName })
        .then(({ error }) => error && logSyncError("shiftPhotoUpload:insert", error));
    });
}

function roleChecklists(shift: Shift, role: StaffRole): RoleChecklists {
  return role === "bar" ? shift.bar : shift.hookah;
}

export function toggleOpenChecklistItem(role: StaffRole, itemId: string) {
  shiftStore.update((shift) => ({
    ...shift,
    [role]: {
      ...roleChecklists(shift, role),
      openChecklist: roleChecklists(shift, role).openChecklist.map((i) =>
        i.id === itemId ? { ...i, done: !i.done } : i,
      ),
    },
  }));
  syncChecklist(role, "open", roleChecklists(shiftStore.get(), role).openChecklist);
}

export function toggleCloseChecklistItem(role: StaffRole, itemId: string) {
  shiftStore.update((shift) => ({
    ...shift,
    [role]: {
      ...roleChecklists(shift, role),
      closeChecklist: roleChecklists(shift, role).closeChecklist.map((i) =>
        i.id === itemId ? { ...i, done: !i.done } : i,
      ),
    },
  }));
  syncChecklist(role, "close", roleChecklists(shiftStore.get(), role).closeChecklist);
}

/**
 * Открывает смену заведения на кнопку (см. openVenueShiftIfNeeded), помечает,
 * что эту роль на смене занял текущий сотрудник (для истории/будущей
 * сверки), и отправляет фото открытия руководителю в Telegram. Чек-лист уже
 * сохранён поштучно через toggleOpenChecklistItem. Принимает роль (бар/
 * кальяны), т.к. у каждой роли свой чек-лист и своё фото.
 */
export async function openShift(role: StaffRole, openedBy: string, photoBlob?: Blob) {
  await openVenueShiftIfNeeded();
  syncRoleClaim(role, "open");
  if (photoBlob) uploadAndNotifyShiftPhoto(role, "open", photoBlob, openedBy);
}

/** Закрывает смену заведения на кнопку — см. closeVenueShift. */
export function closeShift(role: StaffRole, closedBy: string, handoverNote?: string, photoBlob?: Blob) {
  syncRoleClaim(role, "close");
  const closedAt = new Date().toISOString();
  shiftStore.update((shift) => ({
    ...shift,
    status: "closed",
    closedBy,
    closedAt,
    handoverNote: handoverNote ?? shift.handoverNote,
  }));
  closeVenueShift(closedBy, closedAt, handoverNote);
  if (photoBlob) uploadAndNotifyShiftPhoto(role, "close", photoBlob, closedBy);
}

export function isChecklistComplete(items: ChecklistItem[]): boolean {
  return items.length > 0 && items.every((i) => i.done);
}

// --- Поломки и задачи ---

export function listProblems(): Problem[] {
  return [...problemsStore.get()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function reportProblem(input: { category: ProblemCategory; description: string; reportedBy: string }) {
  const problem: Problem = { id: uid(), ...input, createdAt: new Date().toISOString(), status: "open" };
  problemsStore.update((problems) => [problem, ...problems]);
  if (isSupabaseConfigured && supabase) {
    supabase
      .from("problems")
      .insert({
        id: problem.id,
        category: problem.category,
        description: problem.description,
        reported_by: getStaffProfile().id,
        status: problem.status,
        created_at: problem.createdAt,
      })
      .then(({ error }) => error && logSyncError("reportProblem", error));
  }
}

export function resolveProblem(id: string) {
  const resolvedAt = new Date().toISOString();
  problemsStore.update((problems) => problems.map((p) => (p.id === id ? { ...p, status: "done" as const } : p)));
  if (isSupabaseConfigured && supabase) {
    supabase
      .from("problems")
      .update({ status: "done", resolved_at: resolvedAt })
      .eq("id", id)
      .then(({ error }) => error && logSyncError("resolveProblem", error));
  }
}

export function daysOpen(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
}

export function listTasks(): Task[] {
  return tasksStore.get();
}

export function toggleTask(id: string) {
  let nextDone = false;
  tasksStore.update((tasks) =>
    tasks.map((t) => {
      if (t.id !== id) return t;
      nextDone = !t.done;
      return { ...t, done: nextDone };
    }),
  );
  if (isSupabaseConfigured && supabase) {
    supabase
      .from("tasks")
      .update({ done: nextDone })
      .eq("id", id)
      .then(({ error }) => error && logSyncError("toggleTask", error));
  }
}

export function addTask(title: string, assignee?: string, dueDate?: string) {
  const task: Task = { id: uid(), title, assignee, dueDate, done: false };
  tasksStore.update((tasks) => [task, ...tasks]);
  if (isSupabaseConfigured && supabase) {
    supabase
      .from("tasks")
      .insert({
        id: task.id,
        title: task.title,
        due_date: task.dueDate ?? null,
        done: false,
        created_by: getStaffProfile().id,
      })
      .then(({ error }) => error && logSyncError("addTask", error));
  }
}

// --- Личный кабинет сотрудника ---
//
// Пока работает только на моках: под эти сущности (staff_profile, payroll,
// adjustments, schedule, knowledge_base) ещё нет таблиц в Supabase — это
// следующий шаг, когда определимся с моделью ЗП и структурой базы знаний.

export function getStaffProfile(): StaffProfile {
  return staffProfileStore.get();
}

export function updateStaffProfile(patch: Partial<Omit<StaffProfile, "id">>) {
  staffProfileStore.update((profile) => ({ ...profile, ...patch }));
}

// --- Раздел "Сотрудники" у руководителя ---
//
// Список всех сотрудников (не только текущего вошедшего) + начисления по
// каждому из них. Пока тоже только на моках, как и весь личный кабинет выше.

export function listStaffDirectory(): StaffProfile[] {
  return staffDirectoryStore.get();
}

export function getStaffProfileById(staffId: string): StaffProfile | undefined {
  return staffDirectoryStore.get().find((s) => s.id === staffId);
}

export function yearsOfService(hiredAt: string): { years: number; months: number } {
  const ms = Date.now() - new Date(hiredAt).getTime();
  const totalMonths = Math.max(0, Math.floor(ms / (86400000 * 30.44)));
  return { years: Math.floor(totalMonths / 12), months: totalMonths % 12 };
}

export function formatSalaryModel(profile: StaffProfile): string {
  const { salaryModel } = profile;
  if (salaryModel.type === "fixed") return `Фиксированная ставка: ${salaryModel.value.toLocaleString("ru-RU")} ₽ / смена`;
  if (salaryModel.type === "percent") return `Процент от выручки: ${salaryModel.value}%`;
  return `${salaryModel.base.toLocaleString("ru-RU")} ₽ + ${salaryModel.percent}% от выручки`;
}

export { computeShiftSalary };

export function listShiftPayrollForStaff(staffId: string): ShiftPayrollEntry[] {
  return shiftPayrollStore
    .get()
    .filter((s) => s.staffId === staffId)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Личный кабинет сотрудника — всегда про текущего вошедшего (см. ensureCurrentStaff выше). */
export function listShiftPayroll(): ShiftPayrollEntry[] {
  return listShiftPayrollForStaff(getStaffProfile().id);
}

/** Смены сгруппированы по месяцу — выплаты идут не по сменам, а за период. */
export function listShiftPayrollByMonthForStaff(staffId: string): { monthLabel: string; total: number; shifts: ShiftPayrollEntry[] }[] {
  const shifts = listShiftPayrollForStaff(staffId);
  const groups = new Map<string, ShiftPayrollEntry[]>();
  for (const s of shifts) {
    const key = s.date.slice(0, 7); // YYYY-MM
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }
  return Array.from(groups.entries()).map(([key, list]) => ({
    monthLabel: new Date(key + "-01").toLocaleDateString("ru-RU", { month: "long", year: "numeric" }),
    total: list.reduce((sum, s) => sum + s.salary, 0),
    shifts: list,
  }));
}

export function listShiftPayrollByMonth(): { monthLabel: string; total: number; shifts: ShiftPayrollEntry[] }[] {
  return listShiftPayrollByMonthForStaff(getStaffProfile().id);
}

export function listPayoutsForStaff(staffId: string): PayoutRecord[] {
  return payoutsStore
    .get()
    .filter((p) => p.staffId === staffId)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function listPayouts(): PayoutRecord[] {
  return listPayoutsForStaff(getStaffProfile().id);
}

export function listAdjustmentsForStaff(staffId: string): Adjustment[] {
  return adjustmentsStore
    .get()
    .filter((a) => a.staffId === staffId)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function listAdjustments(): Adjustment[] {
  return listAdjustmentsForStaff(getStaffProfile().id);
}

export function addAdjustment(type: AdjustmentType, amount: number, reason: string, staffId: string = getStaffProfile().id) {
  const entry: Adjustment = { id: uid(), staffId, type, amount, reason, date: new Date().toISOString() };
  adjustmentsStore.update((list) => [entry, ...list]);
  if (isSupabaseConfigured && supabase) {
    supabase
      .from("adjustments")
      .insert({
        id: entry.id,
        staff_id: staffId,
        type,
        amount,
        reason,
        date: entry.date.slice(0, 10), // колонка date, не timestamptz
      })
      .then(({ error }) => error && logSyncError("addAdjustment", error));
  }
}

export interface PayrollSummary {
  earned: number; // сумма ЗП по сменам + премии − штрафы
  fines: number;
  bonuses: number;
  paid: number;
  due: number;
}

export function computePayrollSummaryForStaff(staffId: string): PayrollSummary {
  const shifts = listShiftPayrollForStaff(staffId);
  const adjustments = listAdjustmentsForStaff(staffId);
  const payouts = listPayoutsForStaff(staffId);
  const fromShifts = shifts.reduce((sum, s) => sum + s.salary, 0);
  const paid = payouts.reduce((sum, p) => sum + p.amount, 0);
  const fines = adjustments.filter((a) => a.type === "fine").reduce((sum, a) => sum + a.amount, 0);
  const bonuses = adjustments.filter((a) => a.type === "bonus").reduce((sum, a) => sum + a.amount, 0);
  const earned = fromShifts + bonuses - fines;
  return { earned, fines, bonuses, paid, due: earned - paid };
}

export function computePayrollSummary(): PayrollSummary {
  return computePayrollSummaryForStaff(getStaffProfile().id);
}

// --- Зарплатные периоды (см. обсуждение с Никитой 11.10.2026) ---
//
// В заведении два периода в месяц: 11–24 число включительно (выплата
// 30-го числа того же месяца) и 25 число – 10 число следующего месяца
// включительно (выплата 15-го числа следующего месяца). "К выплате" на
// экранах теперь показывает оба периода отдельно, а не одну общую сумму —
// легко спутать, за что уже выплачено, когда они смешаны. "Заработано за
// месяц" (ниже) — отдельная метрика по календарному месяцу, не путать с
// зарплатным периодом: он не совпадает с границами месяца.

export interface PayrollPeriod {
  start: string; // ISO-дата YYYY-MM-DD, включительно
  end: string; // ISO-дата YYYY-MM-DD, включительно
  payoutDate: string; // ISO-дата YYYY-MM-DD, когда выплачивается
  label: string; // "11–24 октября" / "25 сентября – 10 октября"
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** month — 1-based (как из monthDayFromIso); Date сам нормализует переполнение/уход в соседний месяц или год. */
function ymd(year: number, month: number, day: number): string {
  const d = new Date(year, month - 1, day);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function monthDayFromIso(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return { year, month, day };
}

function formatPeriodLabel(start: string, end: string): string {
  const s = new Date(`${start}T12:00:00`);
  const e = new Date(`${end}T12:00:00`);
  const endLabel = e.toLocaleDateString("ru-RU", { day: "numeric", month: "long" }); // ICU сам даёт родительный падеж при наличии дня, например "24 октября"
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
    return `${s.getDate()}–${endLabel}`; // "11–24 октября"
  }
  const startLabel = s.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  return `${startLabel} – ${endLabel}`; // "25 сентября – 10 октября"
}

export function getPayrollPeriodForDate(dateIso: string): PayrollPeriod {
  const { year, month, day } = monthDayFromIso(dateIso);
  if (day >= 11 && day <= 24) {
    const start = ymd(year, month, 11);
    const end = ymd(year, month, 24);
    const payoutDate = ymd(year, month, 30);
    return { start, end, payoutDate, label: formatPeriodLabel(start, end) };
  }
  if (day >= 25) {
    const start = ymd(year, month, 25);
    const end = ymd(year, month + 1, 10);
    const payoutDate = ymd(year, month + 1, 15);
    return { start, end, payoutDate, label: formatPeriodLabel(start, end) };
  }
  // day <= 10 — хвост периода, начавшегося 25-го числа предыдущего месяца
  const start = ymd(year, month - 1, 25);
  const end = ymd(year, month, 10);
  const payoutDate = ymd(year, month, 15);
  return { start, end, payoutDate, label: formatPeriodLabel(start, end) };
}

/** Период, непосредственно предшествующий данному (день перед его началом). */
function previousPayrollPeriod(period: PayrollPeriod): PayrollPeriod {
  const { year, month, day } = monthDayFromIso(period.start);
  const prevDayIso = ymd(year, month, day - 1);
  return getPayrollPeriodForDate(prevDayIso);
}

/**
 * Два периода, актуальных "сейчас": только что закрывшийся (скоро будет
 * выплачен) и текущий (ещё копится). Например, 11.10.2026 это период
 * 25.09–10.10 (выплата 15.10) и период 11–24.10 (выплата 30.10).
 */
export function getActivePayrollPeriods(referenceDate: Date = new Date()): [PayrollPeriod, PayrollPeriod] {
  const iso = `${referenceDate.getFullYear()}-${pad2(referenceDate.getMonth() + 1)}-${pad2(referenceDate.getDate())}`;
  const current = getPayrollPeriodForDate(iso);
  return [previousPayrollPeriod(current), current];
}

export interface PayrollPeriodSummary {
  period: PayrollPeriod;
  earned: number;
  paid: number;
  due: number;
}

export function computePayrollPeriodSummary(staffId: string, period: PayrollPeriod): PayrollPeriodSummary {
  const inRange = (iso: string) => {
    const d = iso.slice(0, 10);
    return d >= period.start && d <= period.end;
  };
  const shifts = listShiftPayrollForStaff(staffId).filter((s) => inRange(s.date));
  const adjustments = listAdjustmentsForStaff(staffId).filter((a) => inRange(a.date));
  // Выплата считается "за этот период", если её дата попадает в сам период
  // или между концом периода и днём выплаты включительно.
  const payouts = listPayoutsForStaff(staffId).filter((p) => {
    const d = p.date.slice(0, 10);
    return d >= period.start && d <= period.payoutDate;
  });
  const fromShifts = shifts.reduce((sum, s) => sum + s.salary, 0);
  const fines = adjustments.filter((a) => a.type === "fine").reduce((sum, a) => sum + a.amount, 0);
  const bonuses = adjustments.filter((a) => a.type === "bonus").reduce((sum, a) => sum + a.amount, 0);
  const earned = fromShifts + bonuses - fines;
  const paid = payouts.reduce((sum, p) => sum + p.amount, 0);
  return { period, earned, paid, due: earned - paid };
}

/** "К выплате", разбитое на два актуальных периода — см. getActivePayrollPeriods. */
export function listActivePayrollPeriodSummariesForStaff(staffId: string, referenceDate: Date = new Date()): PayrollPeriodSummary[] {
  return getActivePayrollPeriods(referenceDate).map((period) => computePayrollPeriodSummary(staffId, period));
}

export function listActivePayrollPeriodSummaries(referenceDate: Date = new Date()): PayrollPeriodSummary[] {
  return listActivePayrollPeriodSummariesForStaff(getStaffProfile().id, referenceDate);
}

/** Заработано за текущий календарный месяц — отдельно от зарплатных периодов выше. */
export function computeEarnedThisCalendarMonthForStaff(staffId: string, referenceDate: Date = new Date()): number {
  const key = `${referenceDate.getFullYear()}-${pad2(referenceDate.getMonth() + 1)}`;
  const inMonth = (iso: string) => iso.slice(0, 7) === key;
  const shifts = listShiftPayrollForStaff(staffId).filter((s) => inMonth(s.date));
  const adjustments = listAdjustmentsForStaff(staffId).filter((a) => inMonth(a.date));
  const fromShifts = shifts.reduce((sum, s) => sum + s.salary, 0);
  const fines = adjustments.filter((a) => a.type === "fine").reduce((sum, a) => sum + a.amount, 0);
  const bonuses = adjustments.filter((a) => a.type === "bonus").reduce((sum, a) => sum + a.amount, 0);
  return fromShifts + bonuses - fines;
}

export function computeEarnedThisCalendarMonth(referenceDate: Date = new Date()): number {
  return computeEarnedThisCalendarMonthForStaff(getStaffProfile().id, referenceDate);
}

/** Средняя ЗП за смену по всем записанным сменам — для раздела "Сотрудники" у руководителя. */
export function computeAverageSalaryPerShift(staffId: string): number {
  const shifts = listShiftPayrollForStaff(staffId);
  if (!shifts.length) return 0;
  return Math.round(shifts.reduce((sum, s) => sum + s.salary, 0) / shifts.length);
}

// --- График (составляет руководитель) и разрешение расхождений с Quick Resto ---
//
// График — источник истины для начисления ЗП: кто в какой день отвечает за
// бар/кальяны. На следующий день бот (apps/bot/src/quickresto.ts) сверяет
// график с тем, кто реально работал по Quick Resto, и либо начисляет
// автоматически, либо откладывает начисление в payroll_issues и уведомляет
// руководителя — тогда он разрешает расхождение здесь, вручную.

/** Все назначения в графике (для руководителя — построение графика). */
export function listSchedule(): ScheduleEntry[] {
  return [...scheduleStore.get()].sort((a, b) => a.date.localeCompare(b.date));
}

/** График конкретного сотрудника (личный кабинет — "мои смены"). */
export function listScheduleForStaff(staffId: string): ScheduleEntry[] {
  return listSchedule().filter((e) => e.staffId === staffId);
}

export function listMySchedule(): ScheduleEntry[] {
  return listScheduleForStaff(getStaffProfile().id);
}

/** Назначить сотрудника на роль в конкретный день (руководитель). Одна роль в день — один сотрудник, повторная запись переставляет назначение. */
export function setScheduleEntry(staffId: string, role: StaffRole, date: string, startTime = "18:00", endTime = "02:00") {
  const dateKey = date.slice(0, 10);
  const entry: ScheduleEntry = { id: uid(), staffId, role, date, startTime, endTime };
  scheduleStore.update((list) => [...list.filter((e) => !(e.date.slice(0, 10) === dateKey && e.role === role)), entry]);
  if (isSupabaseConfigured && supabase) {
    supabase
      .from("schedule_entries")
      .upsert(
        { staff_id: staffId, role, date: dateKey, start_time: startTime, end_time: endTime },
        { onConflict: "date,role" },
      )
      .then(({ error }) => error && logSyncError("setScheduleEntry", error));
  }
}

export function removeScheduleEntry(id: string) {
  scheduleStore.update((list) => list.filter((e) => e.id !== id));
  if (isSupabaseConfigured && supabase) {
    supabase
      .from("schedule_entries")
      .delete()
      .eq("id", id)
      .then(({ error }) => error && logSyncError("removeScheduleEntry", error));
  }
}

/** Нерешённые расхождения графика с Quick Resto — ждут ручного начисления. */
export function listPayrollIssues(): PayrollIssue[] {
  return [...payrollIssuesStore.get()].filter((i) => !i.resolved).sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Руководитель вручную решает, кому в итоге начислить выручку по этой роли/дню
 * (обычно — кто-то из actualStaffIds, реально работавший по Quick Resto, но
 * можно выбрать и любого другого сотрудника). Пишет shift_payroll по модели
 * ЗП выбранного сотрудника и закрывает issue.
 */
export function resolvePayrollIssue(issueId: string, staffId: string) {
  const issue = payrollIssuesStore.get().find((i) => i.id === issueId);
  if (!issue) return;
  const staff = getStaffProfileById(staffId);
  const salary = staff ? computeShiftSalary(staff.salaryModel, issue.revenue) : 0;

  payrollIssuesStore.update((list) => list.map((i) => (i.id === issueId ? { ...i, resolved: true } : i)));
  shiftPayrollStore.update((list) => [
    { id: uid(), staffId, date: issue.date, revenue: issue.revenue, salary, role: issue.role },
    ...list,
  ]);

  if (isSupabaseConfigured && supabase) {
    supabase
      .from("shift_payroll")
      .insert({ staff_id: staffId, role: issue.role, date: issue.date.slice(0, 10), revenue: issue.revenue, salary })
      .then(({ error }) => error && logSyncError("resolvePayrollIssue:insert", error));
    supabase
      .from("payroll_issues")
      .update({ resolved: true, resolved_staff_id: staffId, resolved_at: new Date().toISOString() })
      .eq("id", issueId)
      .then(({ error }) => error && logSyncError("resolvePayrollIssue:resolve", error));
  }
}

/**
 * Переназначить уже начисленную смену другому сотруднику — для случая
 * "в графике была замена, а бот успел начислить не тому" (см. обсуждение с
 * Никитой 11.10.2026): перенос ЗП на нужного человека задним числом, без
 * ручного SQL в Supabase. Выручка смены не трогается — только сотрудник и
 * сумма (пересчитывается по salary_model нового сотрудника).
 */
export function reassignShiftPayroll(entryId: string, newStaffId: string) {
  const entry = shiftPayrollStore.get().find((e) => e.id === entryId);
  if (!entry) return;
  const newStaff = getStaffProfileById(newStaffId);
  const salary = newStaff ? computeShiftSalary(newStaff.salaryModel, entry.revenue) : entry.salary;

  shiftPayrollStore.update((list) => list.map((e) => (e.id === entryId ? { ...e, staffId: newStaffId, salary } : e)));

  if (isSupabaseConfigured && supabase) {
    supabase
      .from("shift_payroll")
      .update({ staff_id: newStaffId, salary })
      .eq("id", entryId)
      .then(({ error }) => error && logSyncError("reassignShiftPayroll", error));
  }
}

export function listKnowledgeArticles(): KnowledgeArticle[] {
  return knowledgeStore.get();
}

export function getKnowledgeArticle(id: string): KnowledgeArticle | undefined {
  return knowledgeStore.get().find((a) => a.id === id);
}

export function groupKnowledgeByCategory(): { category: string; articles: KnowledgeArticle[] }[] {
  const byCategory = new Map<string, KnowledgeArticle[]>();
  for (const article of knowledgeStore.get()) {
    const list = byCategory.get(article.category) ?? [];
    list.push(article);
    byCategory.set(article.category, list);
  }
  return Array.from(byCategory.entries()).map(([category, articles]) => ({ category, articles }));
}
