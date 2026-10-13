// Тонкая обёртка над Telegram WebApp SDK.
// Вне Telegram (обычный браузер при разработке) деградирует до заглушки,
// чтобы можно было верстать и тестировать экраны без реального клиента.

interface TelegramWebApp {
  ready: () => void;
  expand: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  initDataUnsafe?: {
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
    };
  };
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy") => void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

export function initTelegram() {
  const webApp = window.Telegram?.WebApp;
  if (!webApp) return;
  webApp.ready();
  webApp.expand();
  webApp.setHeaderColor?.("#11161d");
  webApp.setBackgroundColor?.("#11161d");
}

export function getTelegramUser() {
  return window.Telegram?.WebApp?.initDataUnsafe?.user ?? null;
}

export function haptic(style: "light" | "medium" | "heavy" = "light") {
  window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(style);
}


// Список telegram_id руководителей — задаётся переменной окружения
// VITE_MANAGER_TELEGRAM_IDS (через запятую, напр. "123456789,987654321") в
// настройках деплоя мини-аппа на Vercel. У кого id в списке — тот видит и
// кабинет "Сотрудник", и "Руководитель" с ручным переключателем (как сейчас,
// удобно для тебя как суперпользователя); у всех остальных переключатель
// скрыт — сразу открывается кабинет "Сотрудник".
const MANAGER_TELEGRAM_IDS = new Set(
  (import.meta.env.VITE_MANAGER_TELEGRAM_IDS ?? "")
    .split(",")
    .map((id: string) => id.trim())
    .filter(Boolean),
);

export function isCurrentUserManager(): boolean {
  const tgUser = getTelegramUser();
  // Вне Telegram (разработка, прямая ссылка в браузере без initData) — считаем
  // руководителем, чтобы не мешать тестировать оба экрана.
  if (!tgUser) return true;
  return MANAGER_TELEGRAM_IDS.has(String(tgUser.id));
}

/**
 * Открыто ли приложение внутри настоящего Telegram-клиента (есть initData),
 * в отличие от прямой ссылки в обычном браузере. См. обсуждение с Никитой
 * 13.10.2026: в браузере — видно оба кабинета с переключателем (для теста),
 * в Telegram — у каждого аккаунта закреплён ровно один кабинет, без
 * переключателя (App.tsx RoleShell использует это вместе с
 * isCurrentUserManager, чтобы решить, показывать ли переключатель).
 */
export function isInsideTelegramClient(): boolean {
  return getTelegramUser() !== null;
}
