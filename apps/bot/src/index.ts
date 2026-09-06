import { Bot, InlineKeyboard, InputFile } from "grammy";
import { env } from "./env";
import { watchServiceCalls, watchShiftPhotos } from "./notify";

const bot = new Bot(env.BOT_TOKEN);

bot.command("start", async (ctx) => {
  // Кнопка типа web_app (открытие мини-аппа прямо в Telegram) разрешена Telegram
  // только в личных сообщениях с ботом — в группах API отвечает BUTTON_TYPE_INVALID.
  // Поэтому в группах даём обычную ссылку в личку с ботом, а мини-апп открываем
  // кнопкой web_app только один на один.
  const isPrivate = ctx.chat.type === "private";
  const keyboard = isPrivate
    ? new InlineKeyboard().webApp("Открыть Roof Lounge", env.MINI_APP_URL)
    : new InlineKeyboard().url("Написать боту в личку", `https://t.me/${ctx.me.username}?start=open`);
  await ctx.reply(
    "Добро пожаловать в Roof Lounge.\n\nЗдесь — сервис за столом и рабочие инструменты для персонала. Заказ и оплата — в основном боте заведения.",
    { reply_markup: keyboard },
  );
});

// Технический пинг, чтобы быстро проверить, что бот жив после деплоя.
bot.command("ping", (ctx) => ctx.reply("pong"));

bot.catch((err) => {
  console.error("Необработанная ошибка бота:", err);
});

async function main() {
  // Уведомления персоналу о QR-вызовах (см. README, раздел про Supabase Realtime).
  // Без настроенных SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY просто не запускается —
  // бот при этом продолжает отвечать на /start.
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && env.STAFF_CHAT_ID) {
    watchServiceCalls(async (call) => {
      const labels: Record<string, string> = {
        waiter: "🙋 Позвать сотрудника",
        bill: "🧾 Попросить счёт",
        help: "🆘 Нужна помощь",
      };
      await bot.api.sendMessage(
        env.STAFF_CHAT_ID,
        `${labels[call.type] ?? call.type}\nСтол №${call.table_number}`,
      );
    });
    console.log("Слушаю service_calls через Supabase Realtime — уведомления персоналу включены.");
  } else {
    console.log("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / STAFF_CHAT_ID не заданы — уведомления о вызовах выключены.");
  }

  // Фото открытия/закрытия смены: пересылаем руководителю (или в отдельный чат,
  // если задан SHIFT_PHOTOS_CHAT_ID) и сразу стираем из Storage — не храним.
  const shiftPhotosChatId = env.SHIFT_PHOTOS_CHAT_ID || env.STAFF_CHAT_ID;
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && shiftPhotosChatId) {
    watchShiftPhotos(async (event) => {
      const buffer = await event.downloadPhoto();
      if (!buffer) return;
      const label = event.kind === "open" ? "Открытие смены" : "Закрытие смены";
      await bot.api.sendPhoto(shiftPhotosChatId, new InputFile(buffer, "shift.jpg"), {
        caption: `${label}${event.staffName ? ` — ${event.staffName}` : ""}`,
      });
    });
    console.log("Слушаю shift_photo_uploads через Supabase Realtime — пересылка фото смен включена.");
  } else {
    console.log("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / STAFF_CHAT_ID (или SHIFT_PHOTOS_CHAT_ID) не заданы — пересылка фото смен выключена.");
  }

  await bot.start();
}

main().catch((err) => {
  console.error("Бот не смог запуститься:", err);
  process.exit(1);
});
