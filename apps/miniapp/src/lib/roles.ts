import type { WorkRole } from "@/types";

/** Единые названия, порядок и цвета рабочих ролей — для графика, карточек, ведомостей. */
export const WORK_ROLES: WorkRole[] = ["hookah", "bar", "waiter", "kitchen", "cleaning"];

export const ROLE_LABELS: Record<WorkRole, string> = {
  hookah: "Кальяны",
  bar: "Бар",
  waiter: "Официант",
  kitchen: "Кухня",
  cleaning: "Клининг",
};

/** Цвет точки роли в календаре графика и легенде. */
export const ROLE_COLORS: Record<WorkRole, string> = {
  hookah: "var(--accent)",
  bar: "var(--good)",
  waiter: "#d1a34b",
  kitchen: "#5b8fd1",
  cleaning: "#a07ad1",
};

/** Подсказки для поля "Должность" (свободный текст, не enum). */
export const POSITION_SUGGESTIONS = ["Администратор", "Управляющий", "Старший смены", "Кальянный мастер", "Бармен", "Официант", "Повар", "Клинер"];
