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
      <button
        className="muted"
        style={{ background: "none", border: "none", padding: 0, marginBottom: 12, cursor: "pointer" }}
        onClick={() => navigate(-1)}
      >
        ← Назад
      </button>

      <div className="card" style={{ textAlign: "center", fontSize: 72, padding: "36px 16px" }}>
        {mix.coverEmoji}
      </div>

      <h1>{mix.title}</h1>

      <div className="chip-row">
        <span className="chip">Крепость {mix.strength}/5</span>
        {mix.bowlType && <span className="chip">Чаша: {mix.bowlType}</span>}
        {mix.density && <span className="chip">Плотность: {mix.density}</span>}
      </div>

      <div className="card">
        <div className="eyebrow">Автор</div>
        <div style={{ fontWeight: 700 }}>{mix.masterName}</div>
      </div>

      {mix.description && <p>{mix.description}</p>}

      <div className="chip-row">
        {mix.tags.map((t) => (
          <span key={t} className="chip accent">
            {t}
          </span>
        ))}
      </div>

      {mix.masterNote && (
        <>
          <div className="eyebrow">Заметка мастера</div>
          <div className="card muted">{mix.masterNote}</div>
        </>
      )}

      <div className="eyebrow">Состав</div>
      {mix.items.map((item) => {
        const flavor = getFlavor(item.flavorId);
        if (!flavor) return null;
        return (
          <div key={item.flavorId} className="card card-row">
            <div>
              <div style={{ fontWeight: 700 }}>{flavor.name.toUpperCase()}</div>
              <div className="muted" style={{ fontSize: 13 }}>
                {flavor.brand} · №{flavor.code}
              </div>
            </div>
            <strong>{item.sharePercent}%</strong>
          </div>
        );
      })}

      <div className="card">
        <div className="eyebrow">Оценка гостя {guest ? `(${guest.displayName})` : ""}</div>
        <Stars value={mix.rating ?? 0} onRate={(v) => rateMix(mix.id, v)} />
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          В прод-версии гость ставит оценку сам в своём мини-аппе — здесь можно проставить за него, чтобы посмотреть, как это повлияет на вкусовой профиль.
        </div>
      </div>

      {guest && (
        <Link to={`/employee/guests/${guest.id}`} className="btn secondary" style={{ display: "block", textAlign: "center", textDecoration: "none", marginTop: 12 }}>
          К профилю гостя
        </Link>
      )}
    </div>
  );
}
