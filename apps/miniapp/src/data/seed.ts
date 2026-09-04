import type { Flavor, Guest, Mix, Problem, Shift, Task, ServiceCall } from "@/types";

// Примерные данные для демонстрации UI. Отмечены как пример — не реальные гости Roof Lounge.
// При подключении Supabase этот файл не используется, только data/repo.ts.

export const seedFlavors: Flavor[] = [
  { id: "f1", brand: "Darkside", name: "Bergamonstr", code: "077", categories: ["Цитрусовый", "Свежий"] },
  { id: "f2", brand: "Black Burn", name: "Peach Killer", code: "069", categories: ["Фруктовый"] },
  { id: "f3", brand: "Морфеус", name: "Лайм", code: "106", categories: ["Цитрусовый", "Свежий"] },
  { id: "f4", brand: "Северный Professional", name: "Зелёный", code: "144", categories: ["Чайный"] },
  { id: "f5", brand: "Сарма", name: "Холодный чай", code: "053", categories: ["Чайный", "Напитки"] },
  { id: "f6", brand: "Trofimoff's", name: "Wild Strawberry", code: "019", categories: ["Ягодный", "Фруктовый"] },
  { id: "f7", brand: "Chabacco", name: "Mangifera", code: "031", categories: ["Тропический", "Фруктовый"] },
  { id: "f8", brand: "Must Have", name: "Mad Pear", code: "058", categories: ["Фруктовый"] },
];

export const seedGuests: Guest[] = [
  { id: "g1", displayName: "Антон Мостяев", badges: ["VIP"] },
  { id: "g2", displayName: "Павел Оплочко", badges: ["Постоянный"] },
  { id: "g3", displayName: "Дарья Кузнецова" },
];

export const seedMixes: Mix[] = [
  {
    id: "m1",
    guestId: "g1",
    masterId: "s1",
    masterName: "Никита Афанасьев",
    title: "Бергамотовый бриз",
    coverEmoji: "🍋",
    items: [
      { flavorId: "f1", sharePercent: 60 },
      { flavorId: "f3", sharePercent: 40 },
    ],
    strength: 3,
    bowlType: "классика",
    density: "лёгкое касание",
    masterNote: "Бергамот чуть перебивает — в след. раз 50/50",
    description: "Свежая цитрусовая нота с прохладным послевкусием лайма.",
    tags: ["Цитрусовый", "Свежий"],
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    rating: 5,
  },
  {
    id: "m2",
    guestId: "g1",
    masterId: "s1",
    masterName: "Никита Афанасьев",
    title: "Тропический сад",
    coverEmoji: "🥭",
    items: [
      { flavorId: "f7", sharePercent: 50 },
      { flavorId: "f8", sharePercent: 50 },
    ],
    strength: 2,
    bowlType: "классика",
    density: "плотная набивка",
    description: "Манго и груша — сладкий тропический микс без резкости.",
    tags: ["Тропический", "Фруктовый"],
    createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
    rating: 4,
  },
  {
    id: "m3",
    guestId: "g2",
    masterId: "s1",
    masterName: "Никита Афанасьев",
    title: "Ягодный компот",
    coverEmoji: "🍓",
    items: [
      { flavorId: "f5", sharePercent: 30 },
      { flavorId: "f6", sharePercent: 70 },
    ],
    strength: 3,
    bowlType: "компот",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    tags: ["Ягодный", "Чайный"],
  },
];

export const seedServiceCalls: ServiceCall[] = [
  { id: "c1", tableNumber: 7, type: "bill", status: "open", createdAt: new Date(Date.now() - 4 * 60000).toISOString() },
  { id: "c2", tableNumber: 3, type: "waiter", status: "resolved", createdAt: new Date(Date.now() - 40 * 60000).toISOString(), resolvedAt: new Date(Date.now() - 37 * 60000).toISOString() },
];

export const seedShift: Shift = {
  id: "sh1",
  status: "closed",
  openChecklist: [
    { id: "oc1", label: "Зал готов к приёму гостей", done: false },
    { id: "oc2", label: "Оборудование проверено", done: false },
    { id: "oc3", label: "Касса и терминалы работают", done: false },
    { id: "oc4", label: "Санузлы убраны", done: false },
    { id: "oc5", label: "Расходники на месте", done: false },
  ],
  closeChecklist: [
    { id: "cc1", label: "Зал приведён в порядок", done: false },
    { id: "cc2", label: "Касса сверена", done: false },
    { id: "cc3", label: "Фото контрольных зон сделано", done: false },
  ],
};

export const seedProblems: Problem[] = [
  {
    id: "p1",
    category: "electric",
    description: "Стол №4 — не работает розетка",
    reportedBy: "Сергей",
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    status: "open",
  },
];

export const seedTasks: Task[] = [
  { id: "t1", title: "Заменить лампу на балконе", dueDate: "Пятница", assignee: "Дмитрий", done: false },
  { id: "t2", title: "Пересчитать склад расходников", done: true },
];
