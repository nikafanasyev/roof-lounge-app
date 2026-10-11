import { useState } from "react";
import { saveGuestTasteProfile } from "@/data/repo";
import AromaPicker from "@/components/AromaPicker";
import { AROMA_DIRECTION_LABELS } from "@/types";
import type { AromaDirection, Guest } from "@/types";

const DIRECTIONS = Object.keys(AROMA_DIRECTION_LABELS) as AromaDirection[];
const MIN_LIKED = 3;

type Step = "directions" | "liked" | "disliked";

/** Вкусовой квиз при первой регистрации гостя (см. GuestFlow.tsx) — три шага подряд. */
export default function GuestTasteProfile({ guest, onDone }: { guest: Guest; onDone: (patch: Partial<Guest>) => void }) {
  const [step, setStep] = useState<Step>("directions");
  const [directions, setDirections] = useState<AromaDirection[]>(guest.tasteDirections ?? []);
  const [liked, setLiked] = useState<string[]>(guest.likedAromaIds ?? []);
  const [disliked, setDisliked] = useState<string[]>(guest.dislikedAromaIds ?? []);
  const [saving, setSaving] = useState(false);

  function toggleDirection(d: AromaDirection) {
    setDirections((list) => (list.includes(d) ? list.filter((x) => x !== d) : [...list, d]));
  }
  function toggleLiked(id: string) {
    setLiked((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }
  function toggleDisliked(id: string) {
    setDisliked((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }

  async function finish() {
    setSaving(true);
    await saveGuestTasteProfile(guest.id, { tasteDirections: directions, likedAromaIds: liked, dislikedAromaIds: disliked });
    setSaving(false);
    onDone({ tasteDirections: directions, likedAromaIds: liked, dislikedAromaIds: disliked });
  }

  if (step === "directions") {
    return (
      <div className="screen" style={{ paddingTop: 24 }}>
        <div className="eyebrow">Шаг 1 из 3</div>
        <h1>Какие направления ароматов нравятся?</h1>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
          {DIRECTIONS.map((d) => {
            const active = directions.includes(d);
            return (
              <button
                key={d}
                type="button"
                className={`chip${active ? " accent" : ""}`}
                style={{ cursor: "pointer", border: active ? "1px solid var(--accent)" : "1px solid var(--border)" }}
                onClick={() => toggleDirection(d)}
              >
                {AROMA_DIRECTION_LABELS[d]}
              </button>
            );
          })}
        </div>
        <button className="btn primary" style={{ marginTop: 24, width: "100%" }} onClick={() => setStep("liked")}>
          Далее
        </button>
      </div>
    );
  }

  if (step === "liked") {
    return (
      <div className="screen" style={{ paddingTop: 24 }}>
        <div className="eyebrow">Шаг 2 из 3</div>
        <h1>Любимые ароматы</h1>
        <p className="muted" style={{ marginTop: -8 }}>
          Выберите минимум {MIN_LIKED}
        </p>
        <AromaPicker selectedIds={liked} onToggle={toggleLiked} excludeIds={disliked} />
        <button
          className="btn primary"
          style={{ marginTop: 24, width: "100%" }}
          disabled={liked.length < MIN_LIKED}
          onClick={() => setStep("disliked")}
        >
          Далее {liked.length < MIN_LIKED ? `(${liked.length}/${MIN_LIKED})` : ""}
        </button>
      </div>
    );
  }

  return (
    <div className="screen" style={{ paddingTop: 24 }}>
      <div className="eyebrow">Шаг 3 из 3</div>
      <h1>Какие ароматы не нравятся?</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        Необязательно, но поможет мастеру
      </p>
      <AromaPicker selectedIds={disliked} onToggle={toggleDisliked} excludeIds={liked} />
      <button className="btn primary" style={{ marginTop: 24, width: "100%" }} disabled={saving} onClick={finish}>
        {saving ? "Сохраняем…" : "Готово"}
      </button>
    </div>
  );
}
