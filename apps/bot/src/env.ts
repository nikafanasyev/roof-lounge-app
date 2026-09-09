function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Не задана переменная окружения ${name}. См. README для списка нужных переменных.`);
  }
  return value;
}

export const env = {
  BOT_TOKEN: required("BOT_TOKEN"),
  MINI_APP_URL: required("MINI_APP_URL"), // публичный URL задеплоенного apps/miniapp
  SUPABASE_URL: process.env.SUPABASE_URL ?? "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  STAFF_CHAT_ID: process.env.STAFF_CHAT_ID ?? "", // куда падают уведомления о QR-вызовах
  // Куда пересылать фото открытия/закрытия смены. Если не задано — падают в STAFF_CHAT_ID.
  SHIFT_PHOTOS_CHAT_ID: process.env.SHIFT_PHOTOS_CHAT_ID ?? "",

  // Интеграция с Quick Resto (статус смены заведения по ПИН-входу сотрудников
  // на терминале) — см. apps/bot/src/quickresto.ts и
  // claude/quickresto-shift-integration.md в проекте. Если QR_LOGIN/QR_PASSWORD
  // не заданы — интеграция просто не запускается.
  QR_HOST: process.env.QR_HOST ?? "hu554.quickresto.ru",
  QR_LOGIN: process.env.QR_LOGIN ?? "",
  QR_PASSWORD: process.env.QR_PASSWORD ?? "",
  // Опрашиваем только в часы работы заведения, чтобы не дёргать Quick Resto
  // впустую днём. Диапазон переходит через полночь (10..8) — с запасом на
  // продления вечера до 6-7 утра, а не жёстко до 4:00.
  QR_POLL_START_HOUR: Number(process.env.QR_POLL_START_HOUR ?? 10),
  QR_POLL_END_HOUR: Number(process.env.QR_POLL_END_HOUR ?? 8),
  QR_POLL_INTERVAL_MS: Number(process.env.QR_POLL_INTERVAL_MS ?? 90_000),
};
