import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

// Уведомление руководству о новых предложениях вкусов (flavor_proposals).
// Раз в 15 сек берём pending-заявки без notified_at и шлём в личку.
export function startFlavorProposalNotifier(notify: (text: string) => Promise<void>) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return;
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  let busy = false;
  async function tick() {
    if (busy) return;
    busy = true;
    try {
      const { data, error } = await supabase
        .from("flavor_proposals")
        .select("id, brand, name, note, proposed_by_name")
        .eq("status", "pending")
        .is("notified_at", null)
        .limit(20);
      if (error || !data) return;
      for (const p of data) {
        await supabase.from("flavor_proposals").update({ notified_at: new Date().toISOString() }).eq("id", p.id);
        await notify(
          `🍃 Новый вкус на согласование\n${p.brand} — ${p.name}\nот: ${p.proposed_by_name ?? "сотрудника"}${p.note ? `\n${p.note}` : ""}\n\nОткрой мини-апп → Новые вкусы, чтобы одобрить.`,
        );
      }
    } catch (err) {
      console.error("flavorNotify:", err);
    } finally {
      busy = false;
    }
  }
  setInterval(tick, 15_000);
  void tick();
}
