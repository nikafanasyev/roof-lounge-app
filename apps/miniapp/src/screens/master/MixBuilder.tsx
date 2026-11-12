import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useStore } from "@/data/useStore";
import { flavorsStore, computeStrengthFromItems, createMix, getGuest } from "@/data/repo";
import { flavorMatches } from "@/lib/flavorSearch";
import ProposeFlavor from "@/components/ProposeFlavor";
import type { Flavor, MixItem } from "@/types";

const MAX_ITEMS = 5;
const DEFAULT_VISIBLE_FLAVORS = 7; // без поиска показываем короткий список, а не все 300+ позиций
const BOWL_TYPES = ["классика", "вортекс", "киллер", "турка"];
const DENSITY_OPTIONS = ["лёгкое касание", "оверпак", "без касания"];

export default function MixBuilder() {
  const { guestId = "" } = useParams();
  const navigate = useNavigate();
  const guest = getGuest(guestId);
  const flavors = useStore(flavorsStore);

  const [step, setStep] = useState<"pick" | "shares" | "details">("pick");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Flavor[]>([]);
  const [shares, setShares] = useState<Record<string, number>>({});

  const [title, setTitle] = useState("");
  const [coverEmoji, setCoverEmoji] = useState("🍃");
  const [bowlType, setBowlType] = useState(BOWL_TYPES[0]);
  const [density, setDensity] = useState(DENSITY_OPTIONS[0]);
  const [masterNote, setMasterNote] = useState("");
  const [description, setDescription] = useState("");

  const filteredFlavors = useMemo(() => {
    const q = query.trim();
    if (!q) {
      const selectedIds = new Set(selected.map((s) => s.id));
      const rest = flavors.filter((f) => !selectedIds.has(f.id));
      return [...selected, ...rest.slice(0, Math.max(0, DEFAULT_VISIBLE_FLAVORS - selected.length))];
    }
    return flavors.filter((f) => flavorMatches(f.brand, f.name, q));
  }, [flavors, query, selected]);
  const isBrowsingAll = query.trim().length > 0;

  const totalShare = Object.values(shares).reduce((a, b) => a + b, 0);

  function toggleFlavor(flavor: Flavor) {
    const exists = selected.find((f) => f.id === flavor.id);
    if (exists) {
      setSelected(selected.filter((f) => f.id !== flavor.id));
      const next = { ...shares };
      delete next[flavor.id];
      setShares(next);
    } else {
      if (selected.length >= MAX_ITEMS) return;
      setSelected([...selected, flavor]);
    }
  }

  function goToShares() {
    if (selected.length === 0) return;
    const even = Math.floor(100 / selected.length);
    const remainder = 100 - even * selected.length;
    const next: Record<string, number> = {};
    selected.forEach((f, i) => {
      next[f.id] = even + (i === 0 ? remainder : 0);
    });
    setShares(next);
    setStep("shares");
  }

  function adjustShare(flavorId: string, delta: number) {
    setShares((prev) => ({ ...prev, [flavorId]: Math.max(0, Math.min(100, (prev[flavorId] ?? 0) + delta)) }));
  }

  function equalize() {
    const even = Math.floor(100 / selected.length);
    const remainder = 100 - even * selected.length;
    const next: Record<string, number> = {};
    selected.forEach((f, i) => {
      next[f.id] = even + (i === 0 ? remainder : 0);
    });
    setShares(next);
  }

  const items: MixItem[] = selected.map((f) => ({ flavorId: f.id, sharePercent: shares[f.id] ?? 0 }));
  const previewStrength = computeStrengthFromItems(items);

  function handleAssemble() {
    if (!guest) return;
    const mix = createMix({
      guestId: guest.id,
      masterId: "s1",
      masterName: "Никита Афанасьев",
      title: title.trim() || "Микс без названия",
      coverEmoji,
      items,
      bowlType,
      density,
      masterNote: masterNote.trim() || undefined,
      description: description.trim() || undefined,
      tags: Array.from(new Set(selected.flatMap((f) => f.categories))),
    });
    navigate(`/employee/mix/${mix.id}`);
  }

  if (!guest) {
    return (
      <div className="screen">
        <div className="list-empty">Гость не найден</div>
      </div>
    );
  }

  const BackBtn = ({ to, label }: { to: () => void; label: string }) => (
    <button className="mx-back" onClick={to}>
      {label}
    </button>
  );

  return (
    <div className="screen">
      {step === "pick" && (
        <>
          <BackBtn to={() => navigate("/employee/guests")} label="← Все гости" />
          <div className="mx-sub">для {guest.displayName}</div>
          <Link to={`/employee/guests/${guest.id}`} className="muted" style={{ fontSize: 13, display: "block", marginBottom: 16 }}>
            Вкусовой профиль гостя →
          </Link>
          <h1>Выбор вкусов</h1>
          <input
            type="text"
            placeholder="Поиск: бренд или вкус (можно по-английски)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          {selected.length > 0 && (
            <div className="mx-tray">
              <span className="muted" style={{ fontSize: 13 }}>
                Выбрано {selected.length}/{MAX_ITEMS}:
              </span>
              {selected.map((f) => (
                <div key={f.id} className="mx-tray-chip" onClick={() => toggleFlavor(f)}>
                  {f.name} <span>×</span>
                </div>
              ))}
            </div>
          )}

          <div className="mx-section">{isBrowsingAll ? `Найдено: ${filteredFlavors.length}` : "Вкусы"}</div>
          {!isBrowsingAll && (
            <div className="muted" style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
              Показаны несколько вкусов. Начните вводить бренд или название, чтобы найти нужный (всего {flavors.length}).
            </div>
          )}
          {isBrowsingAll && filteredFlavors.length === 0 && <div className="list-empty">Ничего не найдено</div>}
          {isBrowsingAll && <ProposeFlavor initialQuery={query.trim()} />}
          {filteredFlavors.map((f) => {
            const isSelected = !!selected.find((s) => s.id === f.id);
            return (
              <div key={f.id} className={`mx-flavor${isSelected ? " is-selected" : ""}`} onClick={() => toggleFlavor(f)}>
                <div className="mx-flavor-body">
                  <div className="mx-flavor-name">{f.name}</div>
                  <div className="mx-flavor-meta">
                    {f.brand}
                    {f.strength ? ` · ${f.strength}` : ""}
                  </div>
                  {f.categories.length > 0 && (
                    <div className="mx-flavor-tags">
                      {f.categories.map((c) => (
                        <span key={c}>{c}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="mx-mark">{isSelected ? "✓" : "+"}</div>
              </div>
            );
          })}

          <div className="mx-footer">
            <button className="btn primary" disabled={selected.length === 0} onClick={goToShares}>
              К долям{selected.length > 0 ? ` (${selected.length})` : ""}
            </button>
          </div>
        </>
      )}

      {step === "shares" && (
        <>
          <BackBtn to={() => setStep("pick")} label="← Вкусы" />
          <h1>Доли</h1>
          <div className="mx-summary">
            <div>
              <div className="muted" style={{ fontSize: 12 }}>Сумма</div>
              <strong style={{ color: totalShare === 100 ? "var(--good)" : "var(--warn)" }}>{totalShare}%</strong>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="muted" style={{ fontSize: 12 }}>Крепость {previewStrength}/5</div>
              <div className="mx-segments" style={{ justifyContent: "flex-end" }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <i key={n} className={n <= Math.round(previewStrength) ? "on" : ""} />
                ))}
              </div>
            </div>
          </div>

          {selected.map((f) => (
            <div key={f.id} className="mx-share">
              <div className="mx-share-top">
                <div>
                  <div className="mx-flavor-name">{f.name}</div>
                  <div className="mx-flavor-meta">
                    {f.brand}
                    {f.strength ? ` · ${f.strength}` : ""}
                  </div>
                </div>
                <div className="mx-share-pct">{shares[f.id] ?? 0}%</div>
              </div>
              <div className="mx-bar">
                <div style={{ width: `${shares[f.id] ?? 0}%` }} />
              </div>
              <div className="mx-step-row">
                <button onClick={() => adjustShare(f.id, -5)}>−5</button>
                <button onClick={() => adjustShare(f.id, 5)}>+5</button>
              </div>
            </div>
          ))}

          <div className="btn-row" style={{ margin: "16px 0 24px" }}>
            <button className="btn secondary" style={{ flex: 1 }} onClick={() => setStep("pick")}>
              + Вкус
            </button>
            <button className="btn secondary" style={{ flex: 1 }} onClick={equalize}>
              Поровну
            </button>
          </div>

          <button className="btn primary" disabled={totalShare !== 100} onClick={() => setStep("details")}>
            Дальше
          </button>
        </>
      )}

      {step === "details" && (
        <>
          <BackBtn to={() => setStep("shares")} label="← Доли" />
          <h1>Оформление микса</h1>

          <div className="mx-field">
            <div className="eyebrow">Название</div>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: Бергамотовый бриз" />
          </div>

          <div className="mx-field">
            <div className="eyebrow">Обложка (эмодзи)</div>
            <input type="text" value={coverEmoji} onChange={(e) => setCoverEmoji(e.target.value.slice(0, 2))} style={{ width: 80 }} />
          </div>

          <div className="mx-field">
            <div className="eyebrow">Чаша</div>
            <div className="mx-options">
              {BOWL_TYPES.map((b) => (
                <button key={b} className={`mx-option${bowlType === b ? " is-on" : ""}`} onClick={() => setBowlType(b)}>
                  {b}
                </button>
              ))}
            </div>
          </div>

          <div className="mx-field">
            <div className="eyebrow">Плотность</div>
            <div className="mx-options">
              {DENSITY_OPTIONS.map((d) => (
                <button key={d} className={`mx-option${density === d ? " is-on" : ""}`} onClick={() => setDensity(d)}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="mx-field">
            <div className="eyebrow">Заметка мастера (гостю не видна)</div>
            <textarea value={masterNote} onChange={(e) => setMasterNote(e.target.value)} placeholder="Например: холодный чай 15, но 5% щавеля" />
          </div>

          <div className="mx-field">
            <div className="eyebrow">Описание для гостя</div>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Пара предложений о вкусе" />
          </div>

          <button className="btn primary" onClick={handleAssemble}>
            Готово
          </button>
        </>
      )}
    </div>
  );
}
