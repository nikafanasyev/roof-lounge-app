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
}

export type ShiftStatus = "closed" | "open";

export interface Shift {
  id: string;
  status: ShiftStatus;
  openedBy?: string;
  openedAt?: string;
  openChecklist: ChecklistItem[];
  closedBy?: string;
  closedAt?: string;
  closeChecklist: ChecklistItem[];
  handoverNote?: string;
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

export interface StaffProfile {
  id: string;
  name: string;
  photoUrl?: string;
  phone?: string;
  email?: string;
  medicalBookNumber?: string;
  medicalBookExpiry?: string; // ISO-дата окончания действия медкнижки
  hiredAt: string; // ISO-дата трудоустройства, отсюда считается выслуга лет
  salaryModel: string; // текстовое описание модели ЗП, например "оклад 2500/смена + 5% от выручки"
}

export interface ShiftPayrollEntry {
  id: string;
  date: string; // ISO-дата смены
  revenue: number; // выручка за смену, ₽
  salary: number; // начислено сотруднику за смену, ₽
  paid: boolean;
}

export type AdjustmentType = "fine" | "bonus";

export interface Adjustment {
  id: string;
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
