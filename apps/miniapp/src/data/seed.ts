import type {
  Adjustment,
  Flavor,
  Guest,
  KnowledgeArticle,
  Mix,
  Problem,
  ScheduleEntry,
  Shift,
  ShiftPayrollEntry,
  StaffProfile,
  Task,
  ServiceCall,
} from "@/types";

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

// --- Личный кабинет сотрудника ---

export const seedStaffProfile: StaffProfile = {
  id: "s1",
  name: "Никита Афанасьев",
  phone: "",
  email: "",
  medicalBookNumber: "",
  medicalBookExpiry: undefined,
  hiredAt: new Date(Date.now() - 86400000 * 240).toISOString(),
  salaryModel: "Оклад за смену + % от выручки — уточнить точную формулу у управляющего",
};

export const seedShiftPayroll: ShiftPayrollEntry[] = [
  { id: "sp1", date: new Date(Date.now() - 86400000 * 1).toISOString(), revenue: 84000, salary: 4200, paid: false },
  { id: "sp2", date: new Date(Date.now() - 86400000 * 3).toISOString(), revenue: 61000, salary: 3050, paid: false },
  { id: "sp3", date: new Date(Date.now() - 86400000 * 6).toISOString(), revenue: 97000, salary: 4850, paid: true },
  { id: "sp4", date: new Date(Date.now() - 86400000 * 9).toISOString(), revenue: 52000, salary: 2600, paid: true },
];

export const seedAdjustments: Adjustment[] = [
  { id: "a1", type: "bonus", amount: 1500, reason: "Лучший отзыв недели от гостя", date: new Date(Date.now() - 86400000 * 6).toISOString() },
  { id: "a2", type: "fine", amount: 500, reason: "Опоздание на смену на 20 минут", date: new Date(Date.now() - 86400000 * 9).toISOString() },
];

export const seedKnowledgeArticles: KnowledgeArticle[] = [
  { id: "k1", category: "Смена", title: "Чек-листы открытия и закрытия смены", body: "Полный порядок действий при открытии и закрытии смены — заполняется управляющим." },
  { id: "k2", category: "Смена", title: "Касса", body: "Правила работы с кассой, инкассация, сверка — заполняется управляющим." },
  { id: "k3", category: "Зал", title: "Где что лежит", body: "Расположение расходников, инвентаря, документов — заполняется управляющим." },
  { id: "k4", category: "Меню", title: "Тех карты", body: "Технологические карты позиций меню — заполняется управляющим." },
  { id: "k5", category: "Меню", title: "Позиции меню и стоимость", body: "Актуальный прайс-лист — заполняется управляющим." },
  { id: "k6", category: "HR", title: "Штрафная сетка", body: "Список нарушений и соответствующих штрафов — заполняется управляющим." },
  { id: "k7", category: "Техника", title: "Свет и вода", body: "Порядок действий при отключении электричества/воды, где рубильники/краны — заполняется управляющим." },
  { id: "k8", category: "Техника", title: "Приточно-вытяжная система", body: "Управление вентиляцией зала — заполняется управляющим." },
  { id: "k9", category: "Безопасность", title: "ЧС и как реагировать", body: "Порядок действий при чрезвычайной ситуации — заполняется управляющим." },
  { id: "k10", category: "Безопасность", title: "Охрана", body: "Контакты и порядок вызова охраны — заполняется управляющим." },
  { id: "k11", category: "Безопасность", title: "Важные номера", body: "Список важных телефонов (управляющий, техник, охрана, экстренные службы) — заполняется управляющим." },
  { id: "k12", category: "Зал", title: "Генеральная уборка", body: "Регламент и график генеральной уборки — заполняется управляющим." },
];

export const seedSchedule: ScheduleEntry[] = [
  { id: "sc1", date: new Date(Date.now() + 86400000 * 1).toISOString(), startTime: "18:00", endTime: "02:00", roleLabel: "Мастер" },
  { id: "sc2", date: new Date(Date.now() + 86400000 * 3).toISOString(), startTime: "18:00", endTime: "02:00", roleLabel: "Мастер" },
  { id: "sc3", date: new Date(Date.now() - 86400000 * 1).toISOString(), startTime: "18:00", endTime: "02:00", roleLabel: "Мастер" },
];
