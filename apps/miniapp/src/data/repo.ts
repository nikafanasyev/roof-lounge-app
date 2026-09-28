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
import { computeShiftSalary } from "@/lib/payroll";

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
    // Модель ЗП и роль на смене — из Supabase, если уже проставлены (бот или
    // руководитель), иначе оставляем заготовку из seed.ts (не пустое поле).
    salaryModel: (row.salary_model as SalaryModel | null) ?? prev.salaryModel,
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

async function loadGuests() {
  const { data, error } = await supabase!.from("guests").select("*");
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
    (data ?? [])
      // Без salary_model это ещё не "сотрудник" для карточки в разделе
      // "Сотрудники" — просто кто-то, кто когда-то вошёл по ПИН/Telegram
      // (бот создаёт строку staff уже при первом входе на терминал).
      .filter((r) => r.salary_model)
      .map((r) => ({
        id: r.id,
        name: r.name,
        photoUrl: r.photo_url ?? undefined,
        phone: r.phone ?? undefined,
        email: r.email ?? undefined,
        medicalBookNumber: r.medical_book_number ?? undefined,
        medicalBookExpiry: r.medical_book_expiry ?? undefined,
        hiredAt: r.hired_at ?? r.created_at,
        salaryModel: r.salary_model as SalaryModel,
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

export function createServiceCall(tableNumber: number, type: ServiceCallType): ServiceCall {
  const call: ServiceCall = {
    id: uid(),
    tableNumber,
    type,
    status: "open",
    createdAt: new Date().toISOString(),
  };
  serviceCallsStore.update((calls) => [call, ...calls]);

  if (isSupabaseConfigured && supabase) {
    getOrCreateTableId(tableNumber).then((tableId) => {
      if (!tableId) return;
      supabase!
        .from("service_calls")
        .insert({ id: call.id, table_id: tableId, type: call.type, status: call.status, created_at: call.createdAt })
        .then(({ error }) => error && logSyncError("createServiceCall", error));
    });
  }

  return call;
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
