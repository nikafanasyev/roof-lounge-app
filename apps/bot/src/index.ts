import { Bot, InlineKeyboard, InputFile } from "grammy";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env";
import { watchLoyaltyCardRequests, watchPayrollRecalcRequests, watchServiceCalls, watchShiftPhotos, watchStaffArchived, watchStaffInvites } from "./notify";
import { startShiftNotifier } from "./shiftNotify";
import { buildExpensesWorkbook, buildSalaryWorkbook, payrollPeriodForDate } from "./reports";
import { createLoyaltyCardInQuickResto, fetchRevenueSplitForDate, manuallyAccrueDate, manuallySyncCashSplit, scheduleDailyCashSplitSync, scheduleDailyCrmCustomerSync, scheduleDailyPayrollJob, watchQuickRestoShifts, type ProcessScheduledDateResult } from "./quickresto";

const bot = new Bot(env.BOT_TOKEN);

// Группа стала супергруппой — у чата новый ID, старый перестаёт работать и
// Telegram отвечает 400 "group chat was upgraded to a supergroup chat" с
// parameters.migrate_to_chat_id. Подхватываем новый ID на лету: повторяем
// запрос и подменяем ID в настройках на время работы бота. Чтобы пережить
// перезапуск, всё равно обновите STAFF_CHAT_ID (и др.) на Railway — новый ID
// пишется в логи.
bot.api.config.use(async (prev, method, payload, signal) => {
  const res = await prev(method, payload, signal);
  const newId = (res as { parameters?: { migrate_to_chat_id?: number } }).parameters?.migrate_to_chat_id;
  const oldId = (payload as { chat_id?: string | number }).chat_id;
  if (!res.ok && newId && oldId !== undefined) {
    for (const key of ["STAFF_CHAT_ID", "SHIFT_PHOTOS_CHAT_ID", "QR_CHAT_ID", "SHIFT_CHAT_ID"] as const) {
      if (String(env[key]) === String(oldId)) env[key] = String(newId);
    }
    console.warn(`Чат ${oldId} стал супергруппой, новый ID: ${newId} — обновите переменную окружения на Railway.`);
    return prev(method, { ...(payload as object), chat_id: newId } as typeof payload, signal);
  }
  return res;
});

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

// Ручная синхронизация нал/безнал за месяц (ежедневная авто-синхронизация
// трогает только текущий). Формат: /cashsplit 2026-10 (без аргумента —
// текущий месяц). Данные попадают в monthly_cash_split и на "Сводку".
bot.command("cashsplit", async (ctx) => {
  if (!env.QR_LOGIN || !env.QR_PASSWORD || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    await ctx.reply("Интеграция с Quick Resto/Supabase не настроена.");
    return;
  }
  const arg = ctx.match?.toString().trim();
  const now = new Date();
  const monthKey = arg || `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) {
    await ctx.reply("Формат: /cashsplit ГГГГ-ММ, например /cashsplit 2026-10");
    return;
  }
  try {
    const { cash, cashless } = await manuallySyncCashSplit(monthKey);
    await ctx.reply(
      `Нал/безнал за ${monthKey}:\n` +
        `Наличные: ${Math.round(cash).toLocaleString("ru-RU")} ₽\n` +
        `Безналичные: ${Math.round(cashless).toLocaleString("ru-RU")} ₽`,
    );
  } catch (err) {
    console.error("Quick Resto: /cashsplit ошибка:", err);
    await ctx.reply("Не удалось получить данные из Quick Resto — см. логи бота.");
  }
});

// Превращает результат processScheduledDate/manuallyAccrueDate в человеко-
// читаемое русское сообщение — раньше /accrue и кнопка пересчёта в миниаппе
// всегда отвечали обобщённым "Готово", даже если на самом деле ничего не
// начислилось (см. разбор с Никитой 13.10.2026: 11.10 и 12.10 "Готово"
// пришло, а начисления не было). Теперь каждая ветка processScheduledDate
// возвращает статус, и здесь он разворачивается в точный текст с причиной.
function describeAccrueResult(result: ProcessScheduledDateResult, dateLabel: string): { ok: boolean; text: string } {
  switch (result.status) {
    case "no_schedule":
      return { ok: false, text: `На ${dateLabel} график не выставлен — сначала внесите его в «Руководитель» → «График», затем повторите.` };
    case "already_handled":
      return { ok: true, text: `За ${dateLabel} уже всё начислено ранее — повторное начисление не требуется (см. «Руководитель» → «Зарплата»).` };
    case "read_error":
      return { ok: false, text: `Не удалось прочитать график на ${dateLabel} из базы: ${result.error}` };
    case "revenue_fetch_failed":
      return { ok: false, text: `Не удалось получить выручку из Quick Resto за ${dateLabel}: ${result.error}` };
    case "employees_fetch_failed":
      return { ok: false, text: `Не удалось получить список сотрудников из Quick Resto для сверки за ${dateLabel}: ${result.error}` };
    case "write_failed":
      return { ok: false, text: `Начисление за ${dateLabel} не записалось в базу: ${result.errors.join("; ")}` };
    case "deferred":
      return { ok: true, text: `За ${dateLabel} начисление отложено на сверку (${result.roles.join(", ")}) — см. «Руководитель» → «Проблемы».` };
    case "accrued":
      return { ok: true, text: `Начислено за ${dateLabel} (${result.roles.join(", ")}) — см. «Руководитель» → «Зарплата».` };
  }
}

// Ручной бэкфилл начисления ЗП за дату, если график внесли задним числом
// больше чем на 7 дней назад — дальше этого окна ежедневное задание
// (scheduleDailyPayrollJob) само уже не пересматривает. Для свежих дат (до
// недели) бэкфилл не нужен — следующий же ночной прогон подхватит сам.
bot.command("accrue", async (ctx) => {
  if (!env.QR_LOGIN || !env.QR_PASSWORD || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    await ctx.reply("Интеграция с Quick Resto/Supabase не настроена.");
    return;
  }
  // /accrue ДД.ММ.ГГГГ — одна дата; /accrue ДД.ММ.ГГГГ ДД.ММ.ГГГГ — диапазон
  // включительно (не больше 62 дней за раз), например весь месяц после
  // того, как руководитель внёс график задним числом.
  const dates = (ctx.match?.toString().match(/\d{1,2}\.\d{1,2}\.\d{4}/g) ?? []).map((d) => {
    const [dd, mm, yyyy] = d.split(".");
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  });
  if (dates.length < 1 || dates.length > 2) {
    await ctx.reply("Формат: /accrue ДД.ММ.ГГГГ или /accrue ДД.ММ.ГГГГ ДД.ММ.ГГГГ (диапазон), например /accrue 01.11.2026 11.11.2026 — начислит ЗП по уже внесённому графику.");
    return;
  }
  const startIso = dates[0];
  const endIso = dates[1] ?? dates[0];
  const days: string[] = [];
  for (let t = Date.parse(startIso); t <= Date.parse(endIso); t += 86400_000) days.push(new Date(t).toISOString().slice(0, 10));
  if (!days.length || days.length > 62) {
    await ctx.reply("Диапазон пустой или длиннее 62 дней — укажите даты по возрастанию и не больше двух месяцев за раз.");
    return;
  }
  await ctx.reply(days.length === 1 ? `Начисляю ЗП за ${startIso.split("-").reverse().join(".")}...` : `Начисляю ЗП за ${days.length} дн. (${startIso} — ${endIso})...`);
  const lines: string[] = [];
  for (const dateIso of days) {
    const dateLabel = dateIso.split("-").reverse().join(".");
    try {
      const result = await manuallyAccrueDate(
        dateIso,
        async () => {}, // onIssue — актуально только при reconcile:true, здесь не используется
        async () => {}, // onMissingSchedule — статус no_schedule ниже даёт то же самое сообщение
      );
      const { ok, text } = describeAccrueResult(result, dateLabel);
      // В диапазоне не шумим про уже начисленное и пустой график — только итог.
      if (days.length === 1 || (ok && result.status === "accrued") || (!ok && result.status !== "no_schedule")) lines.push(text);
    } catch (err) {
      console.error("Quick Resto: /accrue ошибка:", err);
      lines.push(`Не удалось начислить за ${dateLabel} — см. логи бота. (${String(err)})`);
    }
  }
  await ctx.reply(lines.length ? lines.join("\n") : "Новых начислений нет: за эти дни всё уже начислено или график не внесён.");
});

// --- Excel-отчёты в личку (см. reports.ts, supabase/migrations/0021_report_requests.sql) ---

async function isReportAdmin(telegramId: number): Promise<boolean> {
  const ids = env.REPORT_ADMIN_IDS.split(",").map((x) => x.trim()).filter(Boolean);
  if (ids.includes(String(telegramId))) return true;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return false;
  const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabaseAdmin.from("staff").select("role").eq("telegram_id", telegramId).maybeSingle();
  if (error) console.error("isReportAdmin: ошибка чтения staff:", error.message);
  return data?.role === "manager";
}

const todayMsk = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

/** Начало последнего ЗАКРЫВШЕГОСЯ зарплатного периода (за ним — ближайшая выплата). */
function lastClosedPeriodStart(): string {
  const current = payrollPeriodForDate(todayMsk());
  const prevDay = new Date(Date.parse(current.start) - 86400_000).toISOString().slice(0, 10);
  return payrollPeriodForDate(prevDay).start;
}

async function sendReport(kind: "salary" | "expenses", param: string, chatId: number) {
  const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { buffer, filename, caption } = kind === "salary" ? await buildSalaryWorkbook(supabaseAdmin, param) : await buildExpensesWorkbook(supabaseAdmin, param);
  await bot.api.sendDocument(chatId, new InputFile(buffer, filename), { caption });
}

bot.command("salary", async (ctx) => {
  if (!ctx.from || !(await isReportAdmin(ctx.from.id))) {
    await ctx.reply(`Нет доступа: отчёты доступны только руководителям. Ваш Telegram ID: ${ctx.from?.id ?? "?"}. Он должен быть в REPORT_ADMIN_IDS или у строки в staff должна быть role = manager.`);
    return;
  }
  const arg = ctx.match?.toString().trim();
  let start = lastClosedPeriodStart();
  if (arg) {
    const m = arg.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!m) {
      await ctx.reply("Формат: /salary — прошлый закрытый период, или /salary ДД.ММ.ГГГГ — период, в который попадает дата.");
      return;
    }
    start = payrollPeriodForDate(`${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`).start;
  }
  try {
    await sendReport("salary", start, ctx.from.id);
  } catch (err) {
    console.error("/salary ошибка:", err);
    await ctx.reply(`Не удалось собрать ведомость: ${String(err)}`);
  }
});

bot.command("expenses", async (ctx) => {
  if (!ctx.from || !(await isReportAdmin(ctx.from.id))) {
    await ctx.reply(`Нет доступа: отчёты доступны только руководителям. Ваш Telegram ID: ${ctx.from?.id ?? "?"}. Он должен быть в REPORT_ADMIN_IDS или у строки в staff должна быть role = manager.`);
    return;
  }
  const arg = ctx.match?.toString().trim() || todayMsk().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(arg)) {
    await ctx.reply("Формат: /expenses ГГГГ-ММ, например /expenses 2026-11 (без аргумента — текущий месяц).");
    return;
  }
  try {
    await sendReport("expenses", arg, ctx.from.id);
  } catch (err) {
    console.error("/expenses ошибка:", err);
    await ctx.reply(`Не удалось собрать отчёт: ${String(err)}`);
  }
});

// Запросы из мини-аппа (кнопка "Отправить мне в Telegram") — опрос таблицы.
if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
  const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const busy = new Set<string>();
  const pollReports = async () => {
    const { data } = await supabaseAdmin.from("report_requests").select("id, kind, param, requested_by_telegram_id").eq("status", "pending").order("created_at").limit(5);
    for (const r of data ?? []) {
      if (busy.has(r.id)) continue;
      busy.add(r.id);
      try {
        if (!(await isReportAdmin(Number(r.requested_by_telegram_id)))) throw new Error("нет доступа");
        await sendReport(r.kind as "salary" | "expenses", r.param, Number(r.requested_by_telegram_id));
        await supabaseAdmin.from("report_requests").update({ status: "done", handled_at: new Date().toISOString() }).eq("id", r.id);
      } catch (err) {
        console.error("report_requests ошибка:", err);
        await supabaseAdmin.from("report_requests").update({ status: "failed", result: String(err), handled_at: new Date().toISOString() }).eq("id", r.id);
      } finally {
        busy.delete(r.id);
      }
    }
  };
  setInterval(() => void pollReports().catch((e) => console.error("pollReports:", e)), 5000);
}

bot.catch((err) => {
  console.error("Необработанная ошибка бота:", err);
});

/** Личное сообщение каждому руководителю из REPORT_ADMIN_IDS (ссылки-приглашения и т.п.). */
async function notifyManagers(text: string) {
  const ids = Array.from(new Set(env.REPORT_ADMIN_IDS.split(",").map((x) => x.trim()).filter(Boolean)));
  for (const id of ids) {
    try {
      await bot.api.sendMessage(id, text);
    } catch (err) {
      console.error(`Не удалось отправить личное сообщение ${id}:`, err);
    }
  }
}

async function main() {
  startShiftNotifier(bot);

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
  //
  // Результат (готовая ссылка или текст ошибки) никуда не шлём отдельным
  // сообщением — просто пишем в staff_invites, а раздел "Сотрудники" в
  // приложении сам подхватывает это через Realtime и показывает ссылку (с
  // кнопкой "Скопировать") прямо под формой приглашения — см. обсуждение с
  // Никитой 09.11.2026.
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    watchStaffInvites(async (invite) => {
      try {
        // Без группового чата (решение Никиты 12.11.2026): приглашение — это
        // ссылка на самого бота, сотрудник открывает её, жмёт /start и
        // попадает в приложение. Добавлять в рабочую группу — вручную.
        const me = await bot.api.getMe();
        const link = { invite_link: `https://t.me/${me.username}?start=staff` };
        await invite.markSent(link.invite_link);
        await notifyManagers(`Ссылка для ${invite.fullName} — перешлите сотруднику, он откроет бота и нажмёт Start:\n${link.invite_link}`);
      } catch (err) {
        console.error("Quick Resto: не удалось создать инвайт-ссылку:", err);
        await invite.markFailed(String(err));
        await notifyManagers(`Не удалось создать ссылку-приглашение для ${invite.fullName}: ${String(err)}`);
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

  // Кнопка "Начислить ЗП за дату" в мини-аппе (см. supabase/migrations/0013_payroll_recalc.sql
  // и notify.ts watchPayrollRecalcRequests) — тот же manuallyAccrueDate, что
  // и команда /accrue, просто запущенный по запросу из интерфейса, а не из
  // Telegram.
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && env.QR_LOGIN && env.QR_PASSWORD) {
    const notifyChatId = env.QR_CHAT_ID || env.SHIFT_PHOTOS_CHAT_ID || env.STAFF_CHAT_ID;
    watchPayrollRecalcRequests(async (req) => {
      const dateLabel = new Date(`${req.date}T00:00:00`).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
      try {
        const result = await manuallyAccrueDate(
          req.date,
          async () => {}, // onIssue — актуально только при reconcile:true
          async () => {}, // onMissingSchedule — статус no_schedule ниже даёт то же самое сообщение
        );
        const { ok, text } = describeAccrueResult(result, dateLabel);
        await req.markDone(text);
        if (notifyChatId) await bot.api.sendMessage(notifyChatId, `${ok ? "✅" : "⚠️"} Пересчёт ЗП за ${dateLabel}: ${text}`);
      } catch (err) {
        console.error("Quick Resto: не удалось выполнить пересчёт ЗП по запросу из миниаппа:", err);
        await req.markFailed(String(err));
        if (notifyChatId) await bot.api.sendMessage(notifyChatId, `⚠️ Не удалось пересчитать ЗП за ${dateLabel} — см. логи бота. (${String(err)})`);
      }
    });
    console.log("Слушаю payroll_recalc_requests через Supabase Realtime — пересчёт ЗП из миниаппа включён.");
  }

  // "Создать карту лояльности" в мини-аппе (см. supabase/migrations/0016_loyalty_card_requests.sql
  // и notify.ts watchLoyaltyCardRequests) — создаёт клиента в Quick Resto,
  // привязывает телефон и QR-идентификатор, пишет id/ключ обратно в guests.
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && env.QR_LOGIN && env.QR_PASSWORD) {
    const notifyChatId = env.QR_CHAT_ID || env.SHIFT_PHOTOS_CHAT_ID || env.STAFF_CHAT_ID;
    const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    watchLoyaltyCardRequests(async (req) => {
      const { data: guest, error } = await supabaseAdmin
        .from("guests")
        .select("display_name, last_name, first_name, middle_name, birth_date, gender, phone, quickresto_customer_id")
        .eq("id", req.guestId)
        .maybeSingle();
      if (error || !guest) {
        await req.markFailed(`Гость не найден: ${error?.message ?? req.guestId}`);
        return;
      }
      // Гости из CRM Quick Resto приходят с одним display_name (без
      // раздельных ФИО/телефона/пола) — берём имя оттуда. Если карточка уже
      // есть в кассе (quickresto_customer_id), создавать клиента не нужно,
      // только добавить QR-код.
      const parts = (guest.display_name ?? "").trim().split(/\s+/).filter(Boolean);
      const lastName = guest.last_name || parts[parts.length > 1 ? parts.length - 1 : 0] || "";
      const firstName = guest.first_name || (parts.length > 1 ? parts[0] : "") || lastName;
      if (!guest.quickresto_customer_id && !lastName) {
        await req.markFailed("У гостя нет имени — карту в Quick Resto не создать.");
        return;
      }
      try {
        const { customerId, qrKey } = await createLoyaltyCardInQuickResto({
          lastName,
          firstName,
          middleName: guest.middle_name ?? undefined,
          birthDate: guest.birth_date ?? undefined,
          gender: (guest.gender as "male" | "female" | null) ?? undefined,
          phone: guest.phone ?? undefined,
          existingCustomerId: guest.quickresto_customer_id ?? undefined,
        });
        await supabaseAdmin
          .from("guests")
          .update({ quickresto_customer_id: customerId, quickresto_qr_key: qrKey })
          .eq("id", req.guestId);
        await req.markDone(`Создано, id клиента в Quick Resto: ${customerId}`);
        if (notifyChatId) {
          await bot.api.sendMessage(notifyChatId, `✅ Карта лояльности создана в Quick Resto для ${guest.display_name}.`);
        }
      } catch (err) {
        console.error("Quick Resto: не удалось создать карту лояльности по запросу из миниаппа:", err);
        await req.markFailed(String(err));
        if (notifyChatId) {
          await bot.api.sendMessage(
            notifyChatId,
            `⚠️ Не удалось создать карту лояльности в Quick Resto для ${guest.display_name} — см. логи бота. (${String(err)})`,
          );
        }
      }
    });
    console.log("Слушаю loyalty_card_requests через Supabase Realtime — создание карт лояльности в Quick Resto включено.");
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
        const roleLabel = ({ hookah: "Кальяны", bar: "Бар", kitchen: "Кухня", cleaning: "Клининг" } as Record<string, string>)[issue.role] ?? issue.role;
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

    // Синхронизация нал/безнал по текущему месяцу (отчёт
    // finances.reports.financial), ежедневно в 7:00 МСК.
    scheduleDailyCashSplitSync();
  } else {
    console.log("QR_LOGIN / QR_PASSWORD (или SUPABASE_*) не заданы — интеграция с Quick Resto выключена.");
  }

  // Кнопка "Открыть Roof Lounge" в ответе на /start — обычное сообщение в
  // чате, и при активном боте (много уведомлений: вызовы официанта, фото
  // смен и т.д.) она быстро "улетает наверх" и теряется в истории (см.
  // обсуждение с Никитой 09.11.2026). Меню-кнопка рядом с полем ввода
  // (setChatMenuButton) не прокручивается вместе с сообщениями — она
  // закреплена всегда, открывает тот же мини-апп. Ставим её разом для всех
  // пользователей бота (без chat_id — дефолт для всех личных чатов).
  await bot.api.setChatMenuButton({
    menu_button: { type: "web_app", text: "Roof Lounge", web_app: { url: env.MINI_APP_URL } },
  });

  await bot.start();
}

main().catch((err) => {
  console.error("Бот не смог запуститься:", err);
  process.exit(1);
});
