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
// Ограничение текущей версии: ещё нет реальной Telegram-авторизации персонала
// (см. README, п. 4), поэтому все операции "от лица сотрудника" в Supabase
// записываются на один служебный профиль DEMO_STAFF_ID. Когда появится
// авторизация — заменить на staff.id из сессии.

import type {
  ChecklistItem,
  Flavor,
  Guest,
  Mix,
  MixItem,
  Problem,
  ProblemCategory,
  ServiceCall,
  ServiceCallType,
  Shift,
  Task,
} from "@/types";
import {
  seedFlavors,
  seedGuests,
  seedMixes,
  seedProblems,
  seedServiceCalls,
  seedShift,
  seedTasks,
} from "./seed";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

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

const uid = () => crypto.randomUUID();

// --- Синхронизация с Supabase (см. заголовок файла) ---

const DEMO_STAFF_ID = "00000000-0000-4000-8000-000000000001";
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
    await ensureDemoStaff();
    await loadTables();
    await Promise.all([loadFlavors(), loadGuests(), loadMixes(), loadServiceCalls(), loadShift(), loadProblems(), loadTasks()]);
    subscribeRealtime();
  } catch (error) {
    logSyncError("initData", error);
  }
}

async function ensureDemoStaff() {
  staffNameById.set(DEMO_STAFF_ID, DEMO_STAFF_NAME);
  const { error } = await supabase!
    .from("staff")
    .upsert({ id: DEMO_STAFF_ID, telegram_id: DEMO_STAFF_TELEGRAM_ID, name: DEMO_STAFF_NAME, role: "master" }, { onConflict: "id" });
  if (error) logSyncError("ensureDemoStaff", error);
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
  shiftStore.set({
    id: data.id,
    status: data.closed_at ? "closed" : data.opened_at ? "open" : "closed",
    openedBy: data.opened_by ? staffNameById.get(data.opened_by) ?? DEMO_STAFF_NAME : undefined,
    openedAt: data.opened_at ?? undefined,
    openChecklist: data.open_checklist?.length ? data.open_checklist : shiftStore.get().openChecklist,
    closedBy: data.closed_by ? staffNameById.get(data.closed_by) ?? DEMO_STAFF_NAME : undefined,
    closedAt: data.closed_at ?? undefined,
    closeChecklist: data.close_checklist?.length ? data.close_checklist : shiftStore.get().closeChecklist,
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
        master_id: DEMO_STAFF_ID,
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
      .update({ status: "resolved", resolved_at: resolvedAt, resolved_by: DEMO_STAFF_ID })
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

function syncShift(shift: Shift) {
  if (!isSupabaseConfigured || !supabase) return;
  supabase
    .from("shifts")
    .upsert({
      id: shift.id,
      opened_by: shift.openedBy ? DEMO_STAFF_ID : null,
      opened_at: shift.openedAt ?? null,
      open_checklist: shift.openChecklist,
      closed_by: shift.closedBy ? DEMO_STAFF_ID : null,
      closed_at: shift.closedAt ?? null,
      close_checklist: shift.closeChecklist,
      handover_note: shift.handoverNote ?? null,
    })
    .then(({ error }) => error && logSyncError("syncShift", error));
}

export function toggleOpenChecklistItem(itemId: string) {
  shiftStore.update((shift) => ({
    ...shift,
    openChecklist: shift.openChecklist.map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)),
  }));
  syncShift(shiftStore.get());
}

export function toggleCloseChecklistItem(itemId: string) {
  shiftStore.update((shift) => ({
    ...shift,
    closeChecklist: shift.closeChecklist.map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)),
  }));
  syncShift(shiftStore.get());
}

export function openShift(openedBy: string) {
  shiftStore.update((shift) => ({ ...shift, status: "open", openedBy, openedAt: new Date().toISOString() }));
  syncShift(shiftStore.get());
}

export function closeShift(closedBy: string, handoverNote?: string) {
  shiftStore.update((shift) => ({
    ...shift,
    status: "closed",
    closedBy,
    closedAt: new Date().toISOString(),
    handoverNote,
  }));
  syncShift(shiftStore.get());
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
        reported_by: DEMO_STAFF_ID,
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
        created_by: DEMO_STAFF_ID,
      })
      .then(({ error }) => error && logSyncError("addTask", error));
  }
}
