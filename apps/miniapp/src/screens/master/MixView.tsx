import { Link, useNavigate, useParams } from "react-router-dom";
import { useStore } from "@/data/useStore";
import { mixesStore, getFlavor, getGuest, rateMix } from "@/data/repo";
import { Stars } from "@/components/Stars";

export default function MixView() {
  const { mixId = "" } = useParams();
  const navigate = useNavigate();
  const mixes = useStore(mixesStore);
  const mix = mixes.find((m) => m.id === mixId);

  if (!mix) {
    return (
      <div className="screen">
        <div className="list-empty">Микс не найден</div>
      </div>
    );
  }

  const guest = getGuest(mix.guestId);

  return (
    <div className="screen">
      <button className="mx-back" onClick={() => navigate(-1)}>
        ← Назад
      </button>

      <div className="mx-hero">
        <div className="mx-hero-emoji">{mix.coverEmoji}</div>
        <h1>{mix.title}</h1>
        <div className="muted" style={{ fontSize: 13 }}>
          собрал {mix.masterName}
        </div>
        {mix.tags.length > 0 && (
          <div className="chip-row" style={{ marginTop: 12 }}>
            {mix.tags.map((t) => (
              <span key={t} className="chip accent">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mx-stats">
        <div>
          <small>Крепость</small>
          <b>{mix.strength} / 5</b>
        </div>
        <div>
          <small>Чаша</small>
          <b>{mix.bowlType ?? "—"}</b>
        </div>
        <div>
          <small>Плотность</small>
          <b>{mix.density ?? "—"}</b>
        </div>
      </div>

      {mix.description && (
        <>
          <div className="mx-section">Вкус</div>
          <p className="mx-text">{mix.description}</p>
        </>
      )}

      <div className="mx-section">Состав</div>
      {mix.items.map((item) => {
        const flavor = getFlavor(item.flavorId);
        if (!flavor) return null;
        return (
          <div key={item.flavorId} className="mx-comp">
            <div className="mx-share-top">
              <div>
                <div className="mx-flavor-name">{flavor.name}</div>
                <div className="mx-flavor-meta">{flavor.brand}</div>
              </div>
              <div className="mx-share-pct">{item.sharePercent}%</div>
            </div>
            <div className="mx-bar" style={{ marginBottom: 0 }}>
              <div style={{ width: `${item.sharePercent}%` }} />
            </div>
          </div>
        );
      })}

      {mix.masterNote && (
        <>
          <div className="mx-section">Заметка мастера</div>
          <div className="mx-comp muted" style={{ lineHeight: 1.5 }}>
            {mix.masterNote}
          </div>
        </>
      )}

      <div className="mx-section">Оценка гостя{guest ? ` · ${guest.displayName}` : ""}</div>
      <div className="mx-comp">
        <Stars value={mix.rating ?? 0} onRate={(v) => rateMix(mix.id, v)} />
      </div>

      {guest && (
        <Link
          to={`/employee/guests/${guest.id}`}
          className="btn secondary"
          style={{ display: "block", textAlign: "center", textDecoration: "none", marginTop: 16 }}
        >
          К профилю гостя
        </Link>
      )}
    </div>
  );
}
