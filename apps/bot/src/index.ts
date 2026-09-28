import { Bot, InlineKeyboard, InputFile } from "grammy";
import { env } from "./env";
import { watchServiceCalls, watchShiftPhotos } from "./notify";
import { fetchRevenueSplitForDate, scheduleDailyPayrollJob, watchQuickRestoShifts } from "./quickresto";

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

// Выручка за конкретный бизнес-день (11:00-11:00 МСК) — тот же отчёт Quick
// Resto, что и /revenue в roofinfobot, портирован на переиспользуемый
// логин/куки этого бота (см. quickresto.ts). Показывает и кальянную, и общую
// выручку — общая нужна вручную посчитать ЗП по текущей формуле (8,5% от
// общей выручки каждому, см. DEFAULT_SALARY_MODEL) за дни до включения
// автоматического начисления. Формат: /revenue 02.09.2026.
bot.command("revenue", async (ctx) => {
  if (!env.QR_LOGIN || !env.QR_PASSWORD) {
    await ctx.reply("Интеграция с Quick Resto не настроена (нет QR_LOGIN/QR_PASSWORD).");
    return;
  }
  const arg = ctx.match?.toString().trim();
  const parsed = arg?.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!parsed) {
    await ctx.reply("Формат: /revenue ДД.ММ.ГГГГ, например /revenue 02.09.2026");
    return;
  }
  const [, dd, mm, yyyy] = parsed;
  const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), 8, 0, 0));
  try {
    const { hookah, barKitchen, total } = await fetchRevenueSplitForDate(date);
    const salaryPerPerson = Math.round(total * 0.085);
    await ctx.reply(
      `Выручка за ${dd}.${mm}.${yyyy}:\n` +
        `Кальяны: ${Math.round(hookah).toLocaleString("ru-RU")} ₽\n` +
        `Бар/кухня: ${Math.round(barKitchen).toLocaleString("ru-RU")} ₽\n` +
        `Итого: ${Math.round(total).toLocaleString("ru-RU")} ₽\n\n` +
        `8,5% каждому на смене: ${salaryPerPerson.toLocaleString("ru-RU")} ₽`,
    );
  } catch (err) {
    console.error("Quick Resto: /revenue ошибка:", err);
    await ctx.reply("Не удалось получить выручку из Quick Resto — см. логи бота.");
  }
});

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
      const kindLabel = event.kind === "open" ? "Открытие смены" : "Закрытие смены";
      const roleLabel = event.role === "bar" ? "Бар" : "Кальяны";
      await bot.api.sendPhoto(shiftPhotosChatId, new InputFile(buffer, "shift.jpg"), {
        caption: `${kindLabel} — ${roleLabel}${event.staffName ? ` · ${event.staffName}` : ""}`,
      });
    });
    console.log("Слушаю shift_photo_uploads через Supabase Realtime — пересылка фото смен включена.");
  } else {
    console.log("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / STAFF_CHAT_ID (или SHIFT_PHOTOS_CHAT_ID) не заданы — пересылка фото смен выключена.");
  }

  // Статус смены заведения из Quick Resto (ПИН-код на терминале) — заменяет
  // ручное открытие/закрытие смены в мини-аппе, см. README и
  // claude/quickresto-shift-integration.md в проекте.
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && env.QR_LOGIN && env.QR_PASSWORD) {
    const qrChatId = env.QR_CHAT_ID || env.SHIFT_PHOTOS_CHAT_ID || env.STAFF_CHAT_ID;
    watchQuickRestoShifts(async (event) => {
      const label = event.type === "opened" ? "Смена открыта" : "Смена закрыта";
      // Railway крутит контейнер в UTC — без явной таймзоны время в
      // уведомлении отличалось бы от московского на 3 часа.
      const time = event.at.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
      console.log(`Quick Resto: ${label.toLowerCase()} — ${event.employee.name}, ${time}`);
      if (qrChatId) {
        await bot.api.sendMessage(qrChatId, `${label} (Quick Resto)\n${event.employee.name}, ${time}`);
      }
    });
    console.log("Слушаю статус смены через Quick Resto (ПИН на терминале).");

    // Сверка графика с Quick Resto (scheduleDailyPayrollJob) пока ВЫКЛЮЧЕНА —
    // в бэклоге до тех пор, пока у сотрудников нет личных ПИН-кодов доступа на
    // терминале Quick Resto (сейчас, судя по всему, вход общий/не персональный,
    // поэтому "кто реально работал" по Quick Resto ещё нельзя надёжно
    // сопоставить с конкретным сотрудником). Пока обкатываем ручное
    // составление графика (раздел "Руководитель" → "График") без
    // автоматического начисления поверх него — см. claude/quickresto-shift-integration.md.
    //
    // Когда личные ПИНы появятся — раскомментировать:
    // scheduleDailyPayrollJob(async (issue) => {
    //   const roleLabel = issue.role === "hookah" ? "Кальяны" : "Бар";
    //   const dateLabel = new Date(`${issue.date}T00:00:00`).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
    //   const actual = issue.actualStaffNames.length ? issue.actualStaffNames.join(", ") : "никто (по данным Quick Resto)";
    //   const text =
    //     `⚠️ ЗП не начислена автоматически\n${dateLabel} · ${roleLabel}\n` +
    //     `По графику: ${issue.expectedStaffName}\n` +
    //     `По Quick Resto реально работал: ${actual}\n\n` +
    //     `Проверьте и начислите вручную: «Руководитель» → «График» → «Начислить вручную».`;
    //   if (qrChatId) await bot.api.sendMessage(qrChatId, text);
    // });
  } else {
    console.log("QR_LOGIN / QR_PASSWORD (или SUPABASE_*) не заданы — интеграция с Quick Resto выключена.");
  }

  await bot.start();
}

main().catch((err) => {
  console.error("Бот не смог запуститься:", err);
  process.exit(1);
});
