// Доменные типы Roof Lounge mini-app.
// Форма объектов рассчитана на прямой маппинг в таблицы Supabase (см. supabase/migrations).

export type Role = "master" | "staff" | "manager";

export interface Guest {
  id: string;
  displayName: string;
  avatarUrl?: string;
  badges?: string[]; // например ["VIP"], аналог бейджей "Boss"/"100%" в референсе
  tableTelegramId?: string; // для связки с Telegram, без телефона
}

export interface Flavor {
  id: string;
  brand: string;
  name: string;
  code: string; // номер позиции, как "077"
  categories: string[]; // теги вкуса, например ["Фруктовый", "Цитрусовый"] — основа для taste_profile
}

export interface MixItem {
  flavorId: string;
  sharePercent: number;
}

export interface Mix {
  id: string;
  guestId: string;
  masterId: string;
  masterName: string;
  title: string;
  coverEmoji: string; // вместо фото для прототипа
  items: MixItem[];
  strength: number; // 1-5, считается из состава
  bowlType?: string;
  density?: string;
  masterNote?: string; // приватная техническая заметка
  description?: string; // художественное описание для гостя
  tags: string[];
  createdAt: string;
  rating?: number; // 1-5, если гость оценил
}

export interface StaffMember {
  id: string;
  name: string;
  role: Role;
}

export type ServiceCallType = "waiter" | "bill" | "help";
export type ServiceCallStatus = "open" | "resolved";

export interface ServiceCall {
  id: string;
  tableNumber: number;
  type: ServiceCallType;
  status: ServiceCallStatus;
  createdAt: string;
  resolvedAt?: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
  section?: string; // заголовок группы пунктов внутри чек-листа, например "Открытие рабочей зоны"
}

export type ShiftStatus = "closed" | "open";

// Смена одна на заведение (венью-статус приходит из Quick Resto), но с двумя
// одновременными "универсалами" на смене у каждого — свой чек-лист:
// один отвечает за бар, второй за кальянную зону. См.
// claude/quickresto-shift-integration.md и роли ниже.
export type StaffRole = "bar" | "hookah";

export interface RoleChecklists {
  openChecklist: ChecklistItem[];
  closeChecklist: ChecklistItem[];
  openedBy?: string;
  openedAt?: string;
  closedBy?: string;
  closedAt?: string;
}

export interface Shift {
  id: string;
  status: ShiftStatus;
  openedBy?: string;
  openedAt?: string;
  closedBy?: string;
  closedAt?: string;
  bar: RoleChecklists;
  hookah: RoleChecklists;
  handoverNote?: string;
  // Фото открытия/закрытия смены НЕ хранится в этой записи — оно загружается
  // в Storage, бот пересылает его руководителю в Telegram и сразу удаляет
  // (см. data/repo.ts uploadAndNotifyShiftPhoto и supabase/migrations/0002).
}

export type ProblemCategory =
  | "hall"
  | "equipment"
  | "plumbing"
  | "electric"
  | "register"
  | "furniture"
  | "other";

export type ProblemStatus = "open" | "in_progress" | "done";

export interface Problem {
  id: string;
  category: ProblemCategory;
  description: string;
  reportedBy: string;
  createdAt: string;
  status: ProblemStatus;
  assignee?: string;
}

export interface Task {
  id: string;
  title: string;
  dueDate?: string;
  assignee?: string;
  done: boolean;
}

export interface WaitlistEntry {
  id: string;
  guestName: string;
  partySize: number;
  createdAt: string;
}

// --- Личный кабинет сотрудника ---

// Модель ЗП у каждого сотрудника своя и назначается руководителем:
// фиксированная ставка за смену, процент от выручки смены, либо
// комбинация — фиксированная часть + процент от выручки (например,
// "1000 + 15%").
export type SalaryModelType = "fixed" | "percent" | "fixed_plus_percent";

export type SalaryModel =
  | { type: "fixed"; value: number } // ₽ за смену
  | { type: "percent"; value: number } // % от выручки смены
  | { type: "fixed_plus_percent"; base: number; percent: number }; // ₽ за смену + % от выручки

export interface StaffProfile {
  id: string;
  name: string;
  photoUrl?: string;
  // Телефон приходит из Telegram (шаринг контакта), почта и медкнижка —
  // заполняются руководителем. Сотрудник эти поля не редактирует.
  phone?: string;
  email?: string;
  medicalBookNumber?: string;
  medicalBookExpiry?: string; // ISO-дата, до какого числа действует медкнижка
  hiredAt: string; // ISO-дата трудоустройства, отсюда считается выслуга лет
  salaryModel: SalaryModel;
  role?: StaffRole; // основная зона ответственности на смене (бар/кальяны), для карточки в разделе "Сотрудники" у руководителя
}

export interface ShiftPayrollEntry {
  id: string;
  staffId: string; // на чей счёт эта смена — раньше зарплата считалась только "для себя", теперь на сотрудника
  date: string; // ISO-дата смены
  revenue: number; // выручка за смену, ₽
  salary: number; // начислено сотруднику за смену, ₽
  role?: StaffRole; // за какую зону отвечал в эту смену (для отображения в разделе "Сотрудники")
}

// Выплаты происходят не по сменам, а за период (например раз в две недели) —
// отдельная запись на каждую фактическую выплату.
export interface PayoutRecord {
  id: string;
  staffId: string;
  date: string; // ISO-дата выплаты
  amount: number;
  note?: string; // например "за первую половину августа"
}

export type AdjustmentType = "fine" | "bonus";

export interface Adjustment {
  id: string;
  staffId: string;
  type: AdjustmentType;
  amount: number; // ₽, всегда положительное число
  reason: string;
  date: string; // ISO-дата
}

export interface ScheduleEntry {
  id: string;
  date: string; // ISO-дата
  startTime: string; // "18:00"
  endTime: string; // "02:00"
  roleLabel: string; // например "Мастер", "Официант"
}

export interface KnowledgeArticle {
  id: string;
  category: string;
  title: string;
  body: string; // краткий текст-заглушка, наполняется реальным контентом позже
}
