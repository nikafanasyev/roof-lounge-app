import { useEffect, useState } from "react";
import { useStore } from "@/data/useStore";
import { serviceCallsStore } from "@/data/repo";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { tableLabel } from "@/lib/tables";

// Столы зала: 5-1 хранится как 51 (см. lib/tables.ts).
const BOARD_TABLES = [1, 2, 3, 4, 5, 51, 6, 7, 8, 9, 10];
// Через сколько минут подсвечиваем «пора менять уголь» и «срочно».
const COAL_WARN_MIN = 20;
const COAL_URGENT_MIN = 30;

interface TableState {
  seatedAt?: string;
}

interface Hookah {
  id: string;
  table: number;
  startedAt: string;
  coalChangedAt: string;
  finishedAt?: string;
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "h-" + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function fmt(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Борд кальянов: столы, у каждого стола может быть несколько кальянов со своими таймерами (кальян и уголь). Состояние общее для всех устройств. */
export default function Board() {
  const calls = useStore(serviceCallsStore);
  const [tables, setTables] = useState<Record<number, TableState>>({});
  const [hookahs, setHookahs] = useState<Hookah[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const client = supabase;
    let cancelled = false;
    async function load() {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const [t, h] = await Promise.all([
        client.from("board_tables").select("*"),
        client.from("board_hookahs").select("*").gte("started_at", since).order("started_at"),
      ]);
      if (cancelled || t.error || h.error) return;
      const nextTables: Record<number, TableState> = {};
      for (const r of t.data ?? []) {
        nextTables[r.table_number] = { seatedAt: r.seated ? r.seated_at ?? new Date().toISOString() : undefined };
      }
      setTables(nextTables);
      setHookahs(
        (h.data ?? []).map((r) => ({
          id: r.id,
          table: r.table_number,
          startedAt: r.started_at,
          coalChangedAt: r.coal_changed_at,
          finishedAt: r.finished_at ?? undefined,
        })),
      );
    }
    load();
    const channel = client
      .channel("board-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "board_tables" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "board_hookahs" }, () => load())
      .subscribe();
    const poll = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(poll);
      client.removeChannel(channel);
    };
  }, []);

  function saveTable(n: number, seatedAt?: string) {
    setTables((t) => ({ ...t, [n]: { seatedAt } }));
    if (!isSupabaseConfigured || !supabase) return;
    supabase
      .from("board_tables")
      .upsert({ table_number: n, seated: !!seatedAt, seated_at: seatedAt ?? null, updated_at: new Date().toISOString() })
      .then(({ error }) => error && console.error("board table", error));
  }

  function addHookah(n: number) {
    const t = new Date().toISOString();
    const h: Hookah = { id: newId(), table: n, startedAt: t, coalChangedAt: t };
    if (!tables[n]?.seatedAt) saveTable(n, t);
    setHookahs((l) => [...l, h]);
    if (!isSupabaseConfigured || !supabase) return;
    supabase
      .from("board_hookahs")
      .insert({ id: h.id, table_number: n, started_at: t, coal_changed_at: t })
      .then(({ error }) => error && console.error("board hookah add", error));
  }

  function patchHookah(id: string, patch: Partial<Hookah>) {
    setHookahs((l) => l.map((h) => (h.id === id ? { ...h, ...patch } : h)));
    if (!isSupabaseConfigured || !supabase) return;
    const row: Record<string, string> = {};
    if (patch.coalChangedAt) row.coal_changed_at = patch.coalChangedAt;
    if (patch.finishedAt) row.finished_at = patch.finishedAt;
    supabase
      .from("board_hookahs")
      .update(row)
      .eq("id", id)
      .then(({ error }) => error && console.error("board hookah update", error));
  }

  function freeTable(n: number) {
    const t = new Date().toISOString();
    hookahs.filter((h) => h.table === n && !h.finishedAt).forEach((h) => patchHookah(h.id, { finishedAt: t }));
    saveTable(n, undefined);
  }

  const openCallTables = new Set(calls.filter((c) => c.status === "open").map((c) => c.tableNumber));

  return (
    <div className="screen">
      <h1>Борд кальянов</h1>
      <div className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
        Прототип. Уголь: подсветка через {COAL_WARN_MIN} мин, «срочно» через {COAL_URGENT_MIN} мин.
      </div>

      {BOARD_TABLES.map((n) => {
        const seatedAt = tables[n]?.seatedAt;
        const tableHookahs = hookahs.filter((h) => h.table === n && (!seatedAt || h.startedAt >= seatedAt));
        const sessionHookahs = seatedAt ? tableHookahs : [];
        const active = hookahs.filter((h) => h.table === n && !h.finishedAt);
        const hasCall = openCallTables.has(n);
        const worst = active.reduce((m, h) => Math.max(m, (now - new Date(h.coalChangedAt).getTime()) / 60000), 0);
        const border = worst >= COAL_URGENT_MIN ? "var(--danger)" : worst >= COAL_WARN_MIN ? "var(--warn)" : undefined;
        const status = active.length > 0 ? `кальянов: ${active.length}` : seatedAt ? "гости за столом" : "свободен";

        return (
          <div key={n} className="card" style={{ borderColor: border, borderWidth: border ? 2 : undefined }}>
            <div className="card-row">
              <div style={{ fontWeight: 700, fontSize: 18 }}>Стол {tableLabel(n)}</div>
              <div className="chip-row" style={{ margin: 0 }}>
                {hasCall && <span className="chip accent">🔔 вызов</span>}
                <span className="chip">{status}</span>
              </div>
            </div>

            {active.map((h) => {
              const index = sessionHookahs.findIndex((x) => x.id === h.id) + 1;
              const hookahMs = now - new Date(h.startedAt).getTime();
              const coalMs = now - new Date(h.coalChangedAt).getTime();
              const coalMin = coalMs / 60000;
              const urgent = coalMin >= COAL_URGENT_MIN;
              const warn = coalMin >= COAL_WARN_MIN;
              return (
                <div key={h.id} style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                  <div className="card-row">
                    <div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        Кальян {index > 0 ? index : ""}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 20 }}>{fmt(hookahMs)}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {urgent ? "Уголь: срочно!" : warn ? "Пора менять уголь" : "Уголь"}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 20, color: urgent ? "var(--danger)" : warn ? "var(--warn)" : undefined }}>
                        {fmt(coalMs)}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <button className="btn" onClick={() => patchHookah(h.id, { coalChangedAt: new Date().toISOString() })}>
                      Заменил уголь
                    </button>
                    <button className="btn secondary" onClick={() => patchHookah(h.id, { finishedAt: new Date().toISOString() })}>
                      Кальян закончили
                    </button>
                  </div>
                </div>
              );
            })}

            {sessionHookahs.length > 0 && (
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                За этот визит кальянов: {sessionHookahs.length}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {!seatedAt && active.length === 0 && (
                <button className="btn secondary" onClick={() => saveTable(n, new Date().toISOString())}>
                  Посадили гостей
                </button>
              )}
              <button className="btn" onClick={() => addHookah(n)}>
                {sessionHookahs.length === 0 ? "Старт кальяна" : "+ Ещё кальян"}
              </button>
              {(seatedAt || active.length > 0) && (
                <button className="btn secondary" onClick={() => freeTable(n)}>
                  Освободить стол
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
