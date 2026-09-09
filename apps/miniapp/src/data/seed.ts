import type {
  Adjustment,
  ChecklistItem,
  Flavor,
  Guest,
  KnowledgeArticle,
  Mix,
  PayoutRecord,
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

// Чек-листы бармена — из "ЧЕК-ЛИСТ ДЛЯ БАРМЕНА" (открытие/закрытие смены).
export const BAR_OPEN_CHECKLIST: ChecklistItem[] = [
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

export const BAR_CLOSE_CHECKLIST: ChecklistItem[] = [
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

// Чек-листы кальянного департамента — из "Регламент работы кальянного
// департамента ROOF" (общие для КМ и ПКМ пункты начала/закрытия смены;
// разделение обязанностей внутри смены между КМ/ПКМ — не чек-лист, а зона
// ответственности, в чек-лист не выносится).
export const HOOKAH_OPEN_CHECKLIST: ChecklistItem[] = [
  { id: "hookah-o-1", label: "Плита включена", done: false },
  { id: "hookah-o-2", label: "Кальянная станция/калауды чистые, по необходимости — исправить", done: false },
  { id: "hookah-o-3", label: "Проверить количество углей/мундштуков и т.п.", done: false },
  { id: "hookah-o-4", label: "Распаковать угли в достаточном количестве", done: false },
  { id: "hookah-o-5", label: "Мундштуки на столах заполнены", done: false },
  { id: "hookah-o-6", label: "Распаковать табаки по контейнерам (в случае необходимости)", done: false },
  { id: "hookah-o-7", label: "Проверить количество фруктов (минимальный остаток — 2 грейпфрута)", done: false },
  { id: "hookah-o-8", label: "Опустошить ведро с использованными углями по необходимости", done: false },
];

export const HOOKAH_CLOSE_CHECKLIST: ChecklistItem[] = [
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

export const seedShift: Shift = {
  // Настоящий UUID, а не "sh1" — эта запись при подключённом Supabase уходит
  // в таблицу shifts (колонка id — uuid) и используется как shift_id в
  // shift_photo_uploads; строковый плейсхолдер там не проходил валидацию
  // и синхронизация молча падала (см. logSyncError).
  id: crypto.randomUUID(),
  status: "closed",
  bar: {
    openChecklist: BAR_OPEN_CHECKLIST.map((i) => ({ ...i })),
    closeChecklist: BAR_CLOSE_CHECKLIST.map((i) => ({ ...i })),
  },
  hookah: {
    openChecklist: HOOKAH_OPEN_CHECKLIST.map((i) => ({ ...i })),
    closeChecklist: HOOKAH_CLOSE_CHECKLIST.map((i) => ({ ...i })),
  },
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
  phone: undefined, // заполнится из Telegram, когда подключим шаринг контакта
  email: undefined, // заполняет руководитель
  medicalBookNumber: undefined, // заполняет руководитель
  medicalBookExpiry: undefined, // заполняет руководитель
  hiredAt: new Date(Date.now() - 86400000 * 240).toISOString(),
  salaryModel: { type: "percent", value: 5 },
};

export const seedShiftPayroll: ShiftPayrollEntry[] = [
  { id: "sp1", date: new Date(Date.now() - 86400000 * 1).toISOString(), revenue: 84000, salary: 4200 },
  { id: "sp2", date: new Date(Date.now() - 86400000 * 3).toISOString(), revenue: 61000, salary: 3050 },
  { id: "sp3", date: new Date(Date.now() - 86400000 * 6).toISOString(), revenue: 97000, salary: 4850 },
  { id: "sp4", date: new Date(Date.now() - 86400000 * 9).toISOString(), revenue: 52000, salary: 2600 },
  { id: "sp5", date: new Date(Date.now() - 86400000 * 33).toISOString(), revenue: 71000, salary: 3550 },
];

export const seedPayouts: PayoutRecord[] = [
  { id: "po1", date: new Date(Date.now() - 86400000 * 15).toISOString(), amount: 28230, note: "За первую половину месяца" },
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
