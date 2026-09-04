import { Bot, InlineKeyboard } from "grammy";
import { env } from "./env";
import { watchServiceCalls } from "./notify";

const bot = new Bot(env.BOT_TOKEN);

bot.command("start", async (ctx) => {
  const keyboard = new InlineKeyboard().webApp("Открыть Roof Lounge", env.MINI_APP_URL);
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

  await bot.start();
}

main().catch((err) => {
  console.error("Бот не смог запуститься:", err);
  process.exit(1);
});
