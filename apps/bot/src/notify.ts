import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

interface ServiceCallEvent {
  type: "waiter" | "bill" | "help";
  table_number: number;
}

interface ShiftPhotoEvent {
  kind: "open" | "close";
  staffName: string | null;
  /** Скачивает байты фото из Storage. Вызывающий сам решает, что с ними делать. */
  downloadPhoto: () => Promise<Buffer | null>;
}

/**
 * Подписывается на новые записи в service_calls через Supabase Realtime
 * и вызывает onCall с уже подставленным номером стола.
 *
 * В таблице service_calls (см. supabase/migrations/0001_init.sql) хранится
 * table_id, а не номер стола напрямую — здесь держим маленький кэш
 * restaurant_tables, чтобы не ходить в БД на каждое уведомление.
 */
// Supabase Realtime иногда молча роняет websocket-соединение (например, после
// сетевого сбоя или рестарта контейнера) — без явной ошибки, просто канал
// переходит в CLOSED/TIMED_OUT/CHANNEL_ERROR и больше никогда не пришлёт
// событие. .subscribe() без обработки этих статусов выглядит "живым" в логах
// (одна строка про SUBSCRIBED при старте) и после такого обрыва тихо
// перестаёт работать. Поэтому логируем каждый статус и переподписываемся
// заново при разрыве, вместо того чтобы полагаться на то, что соединение
// сама себя восстановит.
function resubscribable(label: string, createChannel: () => ReturnType<ReturnType<typeof createClient>["channel"]>) {
  let attempt = 0;
  function connect() {
    const channel = createChannel();
    // Once we've decided to reconnect for THIS channel instance, ignore any
    // further status callbacks it fires — calling channel.unsubscribe()
    // synchronously from inside this callback re-triggers a CLOSED event on
    // the same tick, which re-enters this same callback and recurses until
    // the stack overflows. `settled` stops that re-entrancy, and the actual
    // unsubscribe/reconnect happens later, outside this call stack.
    let settled = false;
    channel.subscribe((status: string) => {
      if (settled) return;
      if (status === "SUBSCRIBED") {
        attempt = 0;
        console.log(`Подписка на ${label} активна.`);
        return;
      }
      if (status === "CLOSED" || status === "TIMED_OUT" || status === "CHANNEL_ERROR") {
        settled = true;
        attempt += 1;
        const delayMs = Math.min(30_000, 1_000 * 2 ** attempt);
        console.error(`Подписка на ${label} прервалась (${status}), переподключаюсь через ${delayMs}мс.`);
        setTimeout(() => {
          try {
            channel.unsubscribe();
          } catch (err) {
            console.error(`Не удалось отписаться от старого канала ${label}:`, err);
          }
          connect();
        }, delayMs);
      }
    });
  }
  connect();
}

export function watchServiceCalls(onCall: (event: ServiceCallEvent) => void | Promise<void>) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const tableNumberById = new Map<string, number>();

  async function refreshTablesCache() {
    const { data, error } = await supabase.from("restaurant_tables").select("id, number");
    if (error) {
      console.error("Не удалось получить список столов:", error.message);
      return;
    }
    tableNumberById.clear();
    for (const row of data ?? []) {
      tableNumberById.set(row.id as string, row.number as number);
    }
  }

  refreshTablesCache();
  // Столы меняются редко — обновляем кэш раз в 5 минут, не на каждый вызов.
  setInterval(refreshTablesCache, 5 * 60_000);

  resubscribable("service_calls", () =>
    supabase.channel(`service_calls_inserts_${Date.now()}`).on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "service_calls" },
      async (payload) => {
        const row = payload.new as { type: ServiceCallEvent["type"]; table_id: string };
        const tableNumber = tableNumberById.get(row.table_id) ?? 0;
        await onCall({ type: row.type, table_number: tableNumber });
      },
    ),
  );
}

/**
 * Подписывается на новые записи в shift_photo_uploads (миниапп кладёт туда
 * строку сразу после загрузки фото в Storage-бакет shift-photos — см.
 * supabase/migrations/0002_shift_photos.sql). Мы намеренно НЕ храним фото:
 * onEvent должен переслать его (например, в Telegram), а после этого — вне
 * зависимости от результата — файл и запись удаляются, чтобы фото нигде не
 * оседало постоянно.
 */
export function watchShiftPhotos(onEvent: (event: ShiftPhotoEvent) => void | Promise<void>) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  resubscribable("shift_photo_uploads", () =>
    supabase.channel(`shift_photo_uploads_inserts_${Date.now()}`).on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "shift_photo_uploads" },
      async (payload) => {
        const row = payload.new as { id: string; kind: "open" | "close"; storage_path: string; staff_name: string | null };
        try {
          await onEvent({
            kind: row.kind,
            staffName: row.staff_name,
            downloadPhoto: async () => {
              const { data, error } = await supabase.storage.from("shift-photos").download(row.storage_path);
              if (error || !data) {
                console.error("Не удалось скачать фото смены:", error?.message);
                return null;
              }
              return Buffer.from(await data.arrayBuffer());
            },
          });
        } catch (err) {
          console.error("Ошибка при обработке фото смены:", err);
        } finally {
          // Удаляем в любом случае — фото не должно оставаться ни в Storage, ни в таблице.
          await supabase.storage.from("shift-photos").remove([row.storage_path]);
          await supabase.from("shift_photo_uploads").delete().eq("id", row.id);
        }
      },
    ),
  );
}
