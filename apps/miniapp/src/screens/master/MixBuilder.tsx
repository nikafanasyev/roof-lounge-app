import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useStore } from "@/data/useStore";
import { flavorsStore, computeStrengthFromItems, createMix, getGuest } from "@/data/repo";
import type { Flavor, MixItem } from "@/types";

const MAX_ITEMS = 5;
const BOWL_TYPES = ["классика", "фунтик", "самса"];
const DENSITY_OPTIONS = ["лёгкое касание", "средняя набивка", "плотная набивка"];

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
  const [density, setDensity] = useState(DENSITY_OPTIONS[1]);
  const [masterNote, setMasterNote] = useState("");
  const [description, setDescription] = useState("");

  const filteredFlavors = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return flavors;
    return flavors.filter((f) => f.brand.toLowerCase().includes(q) || f.name.toLowerCase().includes(q));
  }, [flavors, query]);

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

  return (
    <div className="screen">
      <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>
        для {guest.displayName}
      </div>

      {step === "pick" && (
        <>
          <h1>Бренды</h1>
          <input
            type="text"
            placeholder="Поиск по бренду или вкусу"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ marginBottom: 12 }}
          />
          <div className="eyebrow">Вкусы</div>
          {filteredFlavors.map((f) => {
            const isSelected = !!selected.find((s) => s.id === f.id);
            return (
              <div key={f.id} className="card card-row" onClick={() => toggleFlavor(f)} style={{ cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span className="chip">{f.code}</span>
                  <div>
                    <div style={{ fontWeight: 700 }}>{f.name.toUpperCase()}</div>
                    <div className="muted" style={{ fontSize: 13 }}>
                      {f.brand}
                    </div>
                  </div>
                </div>
                <span style={{ fontSize: 18, color: isSelected ? "var(--accent-2)" : "var(--muted)" }}>
                  {isSelected ? "✓" : "+"}
                </span>
              </div>
            );
          })}

          <div style={{ position: "sticky", bottom: 12, marginTop: 20 }}>
            <button className="btn primary" disabled={selected.length === 0} onClick={goToShares}>
              К миксу ({selected.length})
            </button>
          </div>
        </>
      )}

      {step === "shares" && (
        <>
          <button className="muted" style={{ background: "none", border: "none", padding: 0, marginBottom: 8, cursor: "pointer" }} onClick={() => setStep("pick")}>
            ← Вкусы
          </button>
          <h1>Доли</h1>
          <div className="card-row" style={{ marginBottom: 12 }}>
            <span>
              Сумма: <strong style={{ color: totalShare === 100 ? "var(--good)" : "var(--warn)" }}>{totalShare}%</strong> / 100
            </span>
            <span className="muted">Крепость: {previewStrength}/5</span>
          </div>

          {selected.map((f) => (
            <div key={f.id} className="card">
              <div style={{ fontWeight: 700, marginBottom: 2 }}>{f.name.toUpperCase()}</div>
              <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
                {f.brand} · {f.code}
              </div>
              <div className="share-row">
                <div className="stepper">
                  <button onClick={() => adjustShare(f.id, -5)}>−</button>
                </div>
                <strong style={{ minWidth: 44, textAlign: "center" }}>{shares[f.id] ?? 0}%</strong>
                <div className="stepper">
                  <button onClick={() => adjustShare(f.id, 5)}>+</button>
                </div>
              </div>
            </div>
          ))}

          <div className="btn-row" style={{ marginBottom: 20 }}>
            <button className="btn secondary" style={{ flex: 1 }} onClick={() => setStep("pick")}>
              + Вкус
            </button>
            <button className="btn secondary" style={{ flex: 1 }} onClick={equalize}>
              = Поровну
            </button>
          </div>

          <button className="btn primary" disabled={totalShare !== 100} onClick={() => setStep("details")}>
            Сборка →
          </button>
        </>
      )}

      {step === "details" && (
        <>
          <button className="muted" style={{ background: "none", border: "none", padding: 0, marginBottom: 8, cursor: "pointer" }} onClick={() => setStep("shares")}>
            ← Доли
          </button>
          <h1>Оформление микса</h1>

          <div className="eyebrow">Название</div>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: Бергамотовый бриз" style={{ marginBottom: 12 }} />

          <div className="eyebrow">Обложка (эмодзи вместо фото)</div>
          <input type="text" value={coverEmoji} onChange={(e) => setCoverEmoji(e.target.value.slice(0, 2))} style={{ marginBottom: 12, width: 80 }} />

          <div className="eyebrow">Чаша</div>
          <select value={bowlType} onChange={(e) => setBowlType(e.target.value)} style={{ marginBottom: 12 }}>
            {BOWL_TYPES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>

          <div className="eyebrow">Плотность</div>
          <select value={density} onChange={(e) => setDensity(e.target.value)} style={{ marginBottom: 12 }}>
            {DENSITY_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <div className="eyebrow">Заметка мастера (гостю не видна)</div>
          <textarea value={masterNote} onChange={(e) => setMasterNote(e.target.value)} placeholder="Например: холодный чай 15, но 5% щавеля" style={{ marginBottom: 12 }} />

          <div className="eyebrow">Описание для гостя</div>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Пара предложений о вкусе" style={{ marginBottom: 20 }} />

          <button className="btn primary" onClick={handleAssemble}>
            Готово
          </button>
        </>
      )}
    </div>
  );
}
