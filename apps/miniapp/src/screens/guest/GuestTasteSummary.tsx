import { listAromaTags } from "@/data/repo";
import { AROMA_DIRECTION_LABELS } from "@/types";
import type { Guest } from "@/types";

function aromaNames(ids?: string[]): string[] {
  if (!ids || ids.length === 0) return [];
  const all = listAromaTags();
  return ids.map((id) => all.find((t) => t.id === id)?.name).filter((n): n is string => Boolean(n));
}

/**
 * Читаемый вид анкеты вкуса (не квиз) — показывается по умолчанию во вкладке
 * "Вкусовой профиль", чтобы гость сразу видел, что уже сохранено, а не
 * каждый раз попадал в пустой с виду квиз. "Изменить" открывает тот же квиз,
 * предзаполненный текущими ответами.
 */
export default function GuestTasteSummary({ guest, onEdit }: { guest: Guest; onEdit: () => void }) {
  const liked = aromaNames(guest.likedAromaIds);
  const disliked = aromaNames(guest.dislikedAromaIds);

  return (
    <div className="screen" style={{ paddingTop: 24 }}>
      <div className="card-row" style={{ marginBottom: 4 }}>
        <h1 style={{ marginBottom: 0 }}>Вкусовой профиль</h1>
        <button className="btn ghost" onClick={onEdit}>
          Изменить
        </button>
      </div>
      <div className="card">
        {(guest.tasteDirections?.length ?? 0) > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
              Направления
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {guest.tasteDirections!.map((d) => (
                <span key={d} className="chip">
                  {AROMA_DIRECTION_LABELS[d]}
                </span>
              ))}
            </div>
          </div>
        )}
        {liked.length > 0 && (
          <div style={{ marginBottom: disliked.length > 0 ? 10 : 0 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
              Любимые ароматы
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {liked.map((name) => (
                <span key={name} className="chip accent">
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}
        {disliked.length > 0 && (
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
              Не нравятся
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {disliked.map((name) => (
                <span key={name} className="chip">
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}
        {guest.tasteDirections?.length === 0 && liked.length === 0 && disliked.length === 0 && (
          <div className="muted" style={{ fontSize: 14 }}>
            Пока пусто — нажмите "Изменить", чтобы пройти вкусовой квиз.
          </div>
        )}
      </div>
    </div>
  );
}
