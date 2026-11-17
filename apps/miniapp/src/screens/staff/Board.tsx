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
  seated: boolean;
  hookahStartedAt?: string;
  coalChangedAt?: string;
}

type Board = Record<number, TableState>;

function emptyState(): TableState {
  return { seated: false };
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

/** Борд кальянов: столы, таймер кальяна и таймер замены угля. Состояние общее для всех устройств (таблица board_tables). */
export default function Board() {
  const calls = useStore(serviceCallsStore);
  const [board, setBoard] = useState<Board>({});
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
      const { data, error } = await client.from("board_tables").select("*");
      if (error || cancelled) return;
      const next: Board = {};
      for (const r of data ?? []) {
        next[r.table_number] = {
          seated: !!r.seated,
          hookahStartedAt: r.hookah_started_at ?? undefined,
          coalChangedAt: r.coal_changed_at ?? undefined,
        };
      }
      setBoard(next);
    }
    load();
    const channel = client
      .channel("board-tables")
      .on("postgres_changes", { event: "*", schema: "public", table: "board_tables" }, () => load())
      .subscribe();
    const poll = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(poll);
      client.removeChannel(channel);
    };
  }, []);

  function save(n: number, next: TableState) {
    setBoard((b) => ({ ...b, [n]: next }));
    if (!isSupabaseConfigured || !supabase) return;
    supabase
      .from("board_tables")
      .upsert({
        table_number: n,
        seated: next.seated,
        hookah_started_at: next.hookahStartedAt ?? null,
        coal_changed_at: next.coalChangedAt ?? null,
        updated_at: new Date().toISOString(),
      })
      .then(({ error }) => error && console.error("board save", error));
  }

  const openCallTables = new Set(calls.filter((c) => c.status === "open").map((c) => c.tableNumber));

  return (
    <div className="screen">
      <h1>Борд кальянов</h1>
      <div className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
        Прототип. Уголь: подсветка через {COAL_WARN_MIN} мин, «срочно» через {COAL_URGENT_MIN} мин.
      </div>

      {BOARD_TABLES.map((n) => {
        const st = board[n] ?? emptyState();
        const running = !!st.hookahStartedAt;
        const hookahMs = running ? now - new Date(st.hookahStartedAt!).getTime() : 0;
        const coalMs = st.coalChangedAt ? now - new Date(st.coalChangedAt).getTime() : 0;
        const coalMin = coalMs / 60000;
        const urgent = running && coalMin >= COAL_URGENT_MIN;
        const warn = running && coalMin >= COAL_WARN_MIN;
        const hasCall = openCallTables.has(n);
        const border = urgent ? "var(--danger)" : warn ? "var(--warn)" : undefined;

        return (
          <div key={n} className="card" style={{ borderColor: border, borderWidth: border ? 2 : undefined }}>
            <div className="card-row">
              <div style={{ fontWeight: 700, fontSize: 18 }}>Стол {tableLabel(n)}</div>
              <div className="chip-row" style={{ margin: 0 }}>
                {hasCall && <span className="chip accent">🔔 вызов</span>}
                <span className="chip">{running ? "кальян идёт" : st.seated ? "гости за столом" : "свободен"}</span>
              </div>
            </div>

            {running && (
              <div className="card-row" style={{ marginTop: 8 }}>
                <div>
                  <div className="muted" style={{ fontSize: 12 }}>Кальян</div>
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
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {!st.seated && !running && (
                <button className="btn" onClick={() => save(n, { seated: true })}>
                  Посадили гостей
                </button>
              )}
              {st.seated && !running && (
                <button
                  className="btn"
                  onClick={() => {
                    const t = new Date().toISOString();
                    save(n, { seated: true, hookahStartedAt: t, coalChangedAt: t });
                  }}
                >
                  Старт кальяна
                </button>
              )}
              {running && (
                <button className="btn" onClick={() => save(n, { ...st, coalChangedAt: new Date().toISOString() })}>
                  Заменил уголь
                </button>
              )}
              {running && (
                <button
                  className="btn secondary"
                  onClick={() => {
                    const t = new Date().toISOString();
                    save(n, { seated: true, hookahStartedAt: t, coalChangedAt: t });
                  }}
                >
                  Новый кальян
                </button>
              )}
              {(st.seated || running) && (
                <button className="btn secondary" onClick={() => save(n, emptyState())}>
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
