import type { Bot } from "grammy";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

// Уведомления об открытии/закрытии смены в отдельный чат (SHIFT_CHAT_ID; если
// не задан — SHIFT_PHOTOS_CHAT_ID, затем STAFF_CHAT_ID). Источник — строка
// `shifts`: мини-апп пишет туда {bar,hookah}_opened_at/_closed_at и общий
// closed_at при действиях сотрудников. Опрашиваем раз в 10 сек и сравниваем с
// прошлым состоянием, поэтому события не теряются при переподключении
// Realtime. При старте бота берём текущее состояние за базовое и ничего не шлём.

type ShiftRow = {
  id: string;
  opened_at: string | null;
  closed_at: string | null;
  opened_by: string | null;
  closed_by: string | null;
  bar_opened_at: string | null;
  bar_opened_by: string | null;
  bar_closed_at: string | null;
  bar_closed_by: string | null;
  hookah_opened_at: string | null;
  hookah_opened_by: string | null;
  hookah_closed_at: string | null;
  hookah_closed_by: string | null;
  handover_note: string | null;
};

const ZONES = [
  { key: "bar", label: "Бар" },
  { key: "hookah", label: "Кальяны" },
] as const;

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });

async function staffName(supabase: SupabaseClient, id: string | null): Promise<string> {
  if (!id) return "кто-то из сотрудников";
  const { data } = await supabase.from("staff").select("name").eq("id", id).maybeSingle();
  return (data?.name as string | undefined) ?? "сотрудник";
}

export function startShiftNotifier(bot: Bot) {
  const chatId = () => env.SHIFT_CHAT_ID || env.SHIFT_PHOTOS_CHAT_ID || env.STAFF_CHAT_ID;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !chatId()) {
    console.log("Уведомления об открытии/закрытии смены выключены (нет SHIFT_CHAT_ID/STAFF_CHAT_ID или Supabase).");
    return;
  }
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  let prev: ShiftRow | null | undefined; // undefined — ещё не читали (базовое состояние)

  async function tick() {
    const { data, error } = await supabase.from("shifts").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) {
      console.error("shiftNotifier: ошибка чтения shifts:", error.message);
      return;
    }
    const cur = (data as ShiftRow | null) ?? null;
    if (prev === undefined) {
      prev = cur; // первый проход — только запоминаем
      return;
    }
    if (!cur) {
      prev = cur;
      return;
    }
    const base: ShiftRow | null = prev && prev.id === cur.id ? prev : null; // новая смена — сравниваем с пустым
    const lines: string[] = [];

    for (const z of ZONES) {
      const oAt = cur[`${z.key}_opened_at`];
      const cAt = cur[`${z.key}_closed_at`];
      if (oAt && (!base || base[`${z.key}_opened_at`] !== oAt)) {
        lines.push(`🟢 Открыта зона «${z.label}» — ${await staffName(supabase, cur[`${z.key}_opened_by`])}, ${fmtTime(oAt)}`);
      }
      if (cAt && (!base || base[`${z.key}_closed_at`] !== cAt)) {
        lines.push(`🔴 Закрыта зона «${z.label}» — ${await staffName(supabase, cur[`${z.key}_closed_by`])}, ${fmtTime(cAt)}`);
      }
    }
    if (cur.closed_at && (!base || base.closed_at !== cur.closed_at)) {
      let text = `⚫ Смена закрыта, ${fmtTime(cur.closed_at)}`;
      if (cur.handover_note) text += `\nПередача смены: ${cur.handover_note}`;
      lines.push(text);
    }

    prev = cur;
    if (lines.length) {
      try {
        await bot.api.sendMessage(chatId(), lines.join("\n"));
      } catch (err) {
        console.error("shiftNotifier: не удалось отправить сообщение:", err);
      }
    }
  }

  void tick();
  setInterval(() => void tick().catch((e) => console.error("shiftNotifier:", e)), 10_000);
  console.log("Уведомления об открытии/закрытии смены включены.");
}
