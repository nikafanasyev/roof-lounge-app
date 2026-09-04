import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

interface ServiceCallEvent {
  type: "waiter" | "bill" | "help";
  table_number: number;
}

/**
 * Подписывается на новые записи в service_calls через Supabase Realtime
 * и вызывает onCall с уже подставленным номером стола.
 *
 * В таблице service_calls (см. supabase/migrations/0001_init.sql) хранится
 * table_id, а не номер стола напрямую — здесь держим маленький кэш
 * restaurant_tables, чтобы не ходить в БД на каждое уведомление.
 */
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

  supabase
    .channel("service_calls_inserts")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "service_calls" },
      async (payload) => {
        const row = payload.new as { type: ServiceCallEvent["type"]; table_id: string };
        const tableNumber = tableNumberById.get(row.table_id) ?? 0;
        await onCall({ type: row.type, table_number: tableNumber });
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log("Подписка на service_calls активна.");
      }
    });
}
