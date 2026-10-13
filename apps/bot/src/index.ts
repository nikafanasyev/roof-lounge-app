import { Bot, InlineKeyboard, InputFile } from "grammy";
import { env } from "./env";
import { watchServiceCalls, watchShiftPhotos, watchStaffArchived, watchStaffInvites } from "./notify";
import { fetchRevenueSplitForDate, manuallyAccrueDate, scheduleDailyCrmCustomerSync, scheduleDailyPayrollJob, watchQuickRestoShifts } from "./quickresto";

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

// Ручной бэкфилл начисления ЗП за дату, если график внесли задним числом
// больше чем на 7 дней назад — дальше этого окна ежедневное задание
// (scheduleDailyPayrollJob) само уже не пересматривает. Для свежих дат (до
// недели) бэкфилл не нужен — следующий же ночной прогон подхватит сам.
bot.command("accrue", async (ctx) => {
  if (!env.QR_LOGIN || !env.QR_PASSWORD || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    await ctx.reply("Интеграция с Quick Resto/Supabase не настроена.");
    return;
  }
  const arg = ctx.match?.toString().trim();
  const parsed = arg?.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!parsed) {
    await ctx.reply("Формат: /accrue ДД.ММ.ГГГГ, например /accrue 02.09.2026 — начислит ЗП за эту дату по уже внесённому графику.");
    return;
  }
  const [, dd, mm, yyyy] = parsed;
  const dateIso = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  await ctx.reply(`Начисляю ЗП за ${dd}.${mm}.${yyyy}...`);
  try {
    await manuallyAccrueDate(
      dateIso,
      async () => {}, // onIssue — актуально только при reconcile:true, здесь не используется
      async (missingDateIso) => {
        await ctx.reply(`На ${missingDateIso} по-прежнему нет графика — сначала внесите его в «Руководитель» → «График», затем повторите /accrue.`);
      },
    );
    await ctx.reply("Готово — если график на эту дату был, ЗП начислена (см. «Руководитель» → «Зарплата»).");
  } catch (err) {
    console.error("Quick Resto: /accrue ошибка:", err);
    await ctx.reply("Не удалось начислить — см. логи бота.");
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

  // Приглашение сотрудника в рабочие чаты (кнопка "Пригласить" в разделе
  // "Сотрудники" у руководителя — см. supabase/migrations/0012_salary_screen.sql
  // и watchStaffInvites в notify.ts). Сейчас единственный рабочий чат —
  // STAFF_CHAT_ID; когда заведут отдельные чаты под бар/кальяны/кухню, сюда
  // нужно будет добавить создание нескольких ссылок. Боту нужны права
  // администратора с "Приглашение пользователей" в этом чате — без них
  // createChatInviteLink вернёт ошибку, и заявка уйдёт в status=failed.
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && env.STAFF_CHAT_ID) {
    watchStaffInvites(async (invite) => {
      try {
        const link = await bot.api.createChatInviteLink(env.STAFF_CHAT_ID, {
          name: invite.fullName.slice(0, 32),
          member_limit: 1,
        });
        await invite.markSent(link.invite_link);
        const contactLine = [invite.phone ? `тел. ${invite.phone}` : null, invite.telegramId ? `Telegram ID ${invite.telegramId}` : null]
          .filter(Boolean)
          .join(" · ");
        await bot.api.sendMessage(
          env.STAFF_CHAT_ID,
          `👋 Приглашение для нового сотрудника
${invite.fullName}${contactLine ? `
${contactLine}` : ""}

` +
            `Ссылка (на одного человека, перешлите сотруднику лично — бот не может написать ему первым, пока тот не нажал /start боту):
${link.invite_link}`,
        );
      } catch (err) {
        console.error("Quick Resto: не удалось создать инвайт-ссылку:", err);
        await invite.markFailed(String(err));
        await bot.api.sendMessage(
          env.STAFF_CHAT_ID,
          `⚠️ Не удалось создать ссылку-приглашение для ${invite.fullName} — проверьте, что бот админ чата с правом "Приглашение пользователей по ссылке".`,
        );
      }
    });
    console.log("Слушаю staff_invites через Supabase Realtime — приглашения сотрудников включены.");
  }

  // Архивация сотрудника (кнопка "Удалить" в карточке сотрудника) — выводим
  // его из рабочего чата (кик = бан + немедленный разбан, чтобы человек мог
  // при желании вступить заново по новой ссылке, а не был забанен навсегда).
  // ПИН-код на терминале Quick Resto бот отключить не может (нет такого API
  // в текущей интеграции, см. quickresto.ts) — это остаётся ручным шагом.
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && env.STAFF_CHAT_ID) {
    watchStaffArchived(async (archived) => {
      let kicked = false;
      if (archived.telegramId) {
        try {
          await bot.api.banChatMember(env.STAFF_CHAT_ID, archived.telegramId);
          await bot.api.unbanChatMember(env.STAFF_CHAT_ID, archived.telegramId, { only_if_banned: true });
          kicked = true;
        } catch (err) {
          console.error(`Quick Resto: не удалось вывести ${archived.name} из чата:`, err);
        }
      }
      await bot.api.sendMessage(
        env.STAFF_CHAT_ID,
        `🗂 Сотрудник ${archived.name} удалён из раздела «Сотрудники».
` +
          `${kicked ? "Из рабочего чата выведен автоматически." : "Из рабочего чата НЕ выведен (нет Telegram ID или не хватило прав у бота) — сделайте это вручную."}
` +
          `Не забудьте отключить его ПИН-код на терминале Quick Resto — бот это сделать не может.`,
      );
    });
    console.log("Слушаю архивацию сотрудников через Supabase Realtime — автоматический вывод из чата включён.");
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

    // Ежедневное начисление ЗП по графику (11.10.2026, см.
    // claude/quickresto-shift-integration.md). Сверка "кто реально зашёл по
    // ПИН-коду на терминале" (reconcile: true) пока ВЫКЛЮЧЕНА — у сотрудников
    // ещё нет личных ПИНов, поэтому "кто реально работал" по Quick Resto
    // нельзя надёжно сопоставить с конкретным сотрудником. Сейчас начисляем
    // просто всем, кто стоит в графике (руководитель составляет его заранее в
    // разделе «Руководитель» → «График») — ровно то же самое, что раньше
    // делали вручную SQL-бэкфиллом, теперь ежедневно и автоматически.
    scheduleDailyPayrollJob(
      async (issue) => {
        // onIssue срабатывает только при reconcile: true — сейчас не используется.
        const roleLabel = issue.role === "hookah" ? "Кальяны" : "Бар";
        const dateLabel = new Date(`${issue.date}T00:00:00`).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
        const actual = issue.actualStaffNames.length ? issue.actualStaffNames.join(", ") : "никто (по данным Quick Resto)";
        const text =
          `⚠️ ЗП не начислена автоматически\n${dateLabel} · ${roleLabel}\n` +
          `По графику: ${issue.expectedStaffName}\n` +
          `По Quick Resto реально работал: ${actual}\n\n` +
          `Проверьте и начислите вручную: «Руководитель» → «График» → «Начислить вручную».`;
        if (qrChatId) await bot.api.sendMessage(qrChatId, text);
      },
      async (missingDateIso) => {
        // Раньше в этом случае бот молча ничего не делал — ни начисления, ни
        // уведомления (см. обсуждение с Никитой 13.10.2026). Как только
        // график на эту дату внесут задним числом, следующий ночной прогон
        // (смотрит последние 7 дней) сам всё начислит — отдельно нажимать
        // ничего не нужно, если не прошло больше недели.
        const [y, m, d] = missingDateIso.split("-");
        const dateLabel = new Date(`${missingDateIso}T00:00:00`).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
        const text =
          `⚠️ График на ${dateLabel} не выставлен — ЗП за этот день не начислена.\n\n` +
          `Внесите график задним числом: «Руководитель» → «График» → выберите ${dateLabel} → назначьте бар/кальяны. ` +
          `В течение недели бот подхватит и начислит сам; если дата старше недели — после внесения графика пришлите боту «/accrue ${d}.${m}.${y}».`;
        if (qrChatId) await bot.api.sendMessage(qrChatId, text);
      },
      { reconcile: false },
    );

    // Перенос базы клиентов Quick Resto (ФИО + номер карты, без телефона —
    // см. claude/quickresto-shift-integration.md) в наш guests, ежедневно.
    scheduleDailyCrmCustomerSync();
  } else {
    console.log("QR_LOGIN / QR_PASSWORD (или SUPABASE_*) не заданы — интеграция с Quick Resto выключена.");
  }

  await bot.start();
}

main().catch((err) => {
  console.error("Бот не смог запуститься:", err);
  process.exit(1);
});
