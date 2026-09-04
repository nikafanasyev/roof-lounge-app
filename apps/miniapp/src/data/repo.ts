// Единая точка доступа к данным приложения.
//
// Сейчас работает поверх in-memory моков (seed.ts) — этого достаточно, чтобы
// пройти все сценарии интерфейса уже сегодня, без Supabase-проекта.
// Когда появится Supabase-проект (см. README в корне репозитория), функции
// в этом файле нужно переписать на supabase-js с ТЕМИ ЖЕ сигнатурами —
// компоненты экранов их не заметят.

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

const uid = () => Math.random().toString(36).slice(2, 10);

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
}

export function removeMix(mixId: string) {
  mixesStore.update((mixes) => mixes.filter((m) => m.id !== mixId));
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
  return call;
}

export function resolveServiceCall(id: string) {
  serviceCallsStore.update((calls) =>
    calls.map((c) => (c.id === id ? { ...c, status: "resolved", resolvedAt: new Date().toISOString() } : c)),
  );
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

export function getShift(): Shift {
  return shiftStore.get();
}

export function toggleOpenChecklistItem(itemId: string) {
  shiftStore.update((shift) => ({
    ...shift,
    openChecklist: shift.openChecklist.map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)),
  }));
}

export function toggleCloseChecklistItem(itemId: string) {
  shiftStore.update((shift) => ({
    ...shift,
    closeChecklist: shift.closeChecklist.map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)),
  }));
}

export function openShift(openedBy: string) {
  shiftStore.update((shift) => ({ ...shift, status: "open", openedBy, openedAt: new Date().toISOString() }));
}

export function closeShift(closedBy: string, handoverNote?: string) {
  shiftStore.update((shift) => ({
    ...shift,
    status: "closed",
    closedBy,
    closedAt: new Date().toISOString(),
    handoverNote,
  }));
}

export function isChecklistComplete(items: ChecklistItem[]): boolean {
  return items.length > 0 && items.every((i) => i.done);
}

// --- Поломки и задачи ---

export function listProblems(): Problem[] {
  return [...problemsStore.get()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function reportProblem(input: { category: ProblemCategory; description: string; reportedBy: string }) {
  problemsStore.update((problems) => [
    { id: uid(), ...input, createdAt: new Date().toISOString(), status: "open" as const },
    ...problems,
  ]);
}

export function resolveProblem(id: string) {
  problemsStore.update((problems) => problems.map((p) => (p.id === id ? { ...p, status: "done" as const } : p)));
}

export function daysOpen(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
}

export function listTasks(): Task[] {
  return tasksStore.get();
}

export function toggleTask(id: string) {
  tasksStore.update((tasks) => tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
}

export function addTask(title: string, assignee?: string, dueDate?: string) {
  tasksStore.update((tasks) => [{ id: uid(), title, assignee, dueDate, done: false }, ...tasks]);
}
