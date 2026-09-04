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
};
