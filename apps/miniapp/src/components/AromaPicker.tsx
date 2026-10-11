import { useMemo, useState } from "react";
import { addCustomAromaTag, randomAromaTags, searchAromaTags } from "@/data/repo";
import { AROMA_DIRECTION_LABELS } from "@/types";
import type { AromaDirection, AromaTag } from "@/types";

const DIRECTIONS = Object.keys(AROMA_DIRECTION_LABELS) as AromaDirection[];

/**
 * Список ароматов для вкусового квиза гостя (см. screens/guest/GuestTasteProfile.tsx):
 * случайные N чипов + поиск по всему справочнику + возможность добавить
 * свой аромат, если в списке нет (см. обсуждение с Никитой 11.10.2026).
 * Один и тот же компонент используется и для "любимых", и для "нелюбимых" —
 * excludeIds скрывает то, что уже выбрано в другом списке.
 */
export default function AromaPicker({
  selectedIds,
  onToggle,
  excludeIds = [],
  randomCount = 20,
}: {
  selectedIds: string[];
  onToggle: (id: string) => void;
  excludeIds?: string[];
  randomCount?: number;
}) {
  const [query, setQuery] = useState("");
  // Фиксируем случайную выборку один раз при монтировании — не перемешивать список на каждый клик по чипу.
  const [shown] = useState<AromaTag[]>(() => randomAromaTags(randomCount, excludeIds));
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDirection, setNewDirection] = useState<AromaDirection>("fruit");
  const [adding, setAdding] = useState(false);
  const [extra, setExtra] = useState<AromaTag[]>([]); // добавленные вручную в этой сессии — сразу видны чипом

  const searchResults = query.trim() ? searchAromaTags(query).filter((t) => !excludeIds.includes(t.id)) : shown;
  const visible = useMemo(() => {
    const byId = new Map(searchResults.map((t) => [t.id, t] as const));
    for (const t of extra) byId.set(t.id, t);
    return [...byId.values()];
  }, [searchResults, extra]);

  async function handleAdd() {
    if (!newName.trim()) return;
    setAdding(true);
    const tag = await addCustomAromaTag(newName, newDirection);
    setAdding(false);
    if (tag) {
      setExtra((e) => [...e, tag]);
      onToggle(tag.id);
      setNewName("");
      setAddOpen(false);
    }
  }

  return (
    <div>
      <input
        placeholder="Поиск аромата…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 10 }}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {visible.map((t) => {
          const active = selectedIds.includes(t.id);
          return (
            <button
              key={t.id}
              type="button"
              className={`chip${active ? " accent" : ""}`}
              style={{ cursor: "pointer", border: active ? "1px solid var(--accent)" : "1px solid var(--border)" }}
              onClick={() => onToggle(t.id)}
            >
              {t.name}
            </button>
          );
        })}
      </div>
      {query.trim() && visible.length === 0 && (
        <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
          Не нашли — можно добавить свой
        </div>
      )}

      {!addOpen ? (
        <button
          type="button"
          className="btn ghost"
          style={{ marginTop: 10 }}
          onClick={() => {
            setAddOpen(true);
            setNewName(query.trim());
          }}
        >
          + свой аромат
        </button>
      ) : (
        <div className="card" style={{ marginTop: 10 }}>
          <input
            placeholder="Название аромата"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={{ marginBottom: 8 }}
          />
          <select value={newDirection} onChange={(e) => setNewDirection(e.target.value as AromaDirection)} style={{ marginBottom: 8 }}>
            {DIRECTIONS.map((d) => (
              <option key={d} value={d}>
                {AROMA_DIRECTION_LABELS[d]}
              </option>
            ))}
          </select>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn primary" style={{ flex: 1 }} disabled={!newName.trim() || adding} onClick={handleAdd}>
              {adding ? "Добавляем…" : "Добавить"}
            </button>
            <button type="button" className="btn secondary" style={{ flex: 1 }} onClick={() => setAddOpen(false)}>
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
