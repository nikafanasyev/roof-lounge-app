import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useStore } from "@/data/useStore";
import { mixesStore, computeTasteProfile, getFlavor, getGuest, removeMix } from "@/data/repo";
import { Stars } from "@/components/Stars";

export default function GuestProfile() {
  const { guestId = "" } = useParams();
  const navigate = useNavigate();
  useStore(mixesStore); // перерисовываемся при изменениях миксов
  const guest = getGuest(guestId);
  const [tab, setTab] = useState<"profile" | "history">("profile");

  if (!guest) {
    return (
      <div className="screen">
        <div className="list-empty">Гость не найден</div>
      </div>
    );
  }

  const profile = computeTasteProfile(guestId);
  const history = Object.values(mixesStore.get())
    .filter((m) => m.guestId === guestId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="screen">
      <Link to="/employee/guests" className="muted" style={{ textDecoration: "none", fontSize: 14 }}>
        ← Все гости
      </Link>

      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{guest.displayName}</div>
        <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
          ID {guest.id.slice(0, 6)}
        </div>
        <div className="chip-row" style={{ margin: 0 }}>
          {guest.badges?.map((b) => (
            <span key={b} className="chip accent">
              {b}
            </span>
          ))}
        </div>
      </div>

      <div className="tabs">
        <button className={`tab-btn ${tab === "profile" ? "active" : ""}`} onClick={() => setTab("profile")}>
          Профиль
        </button>
        <button className={`tab-btn ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")}>
          История · {history.length}
        </button>
      </div>

      {tab === "profile" && (
        <>
          <div className="eyebrow">Вкусовой профиль</div>
          {profile.topCategories.length === 0 ? (
            <div className="card muted">Профиль появится, когда для гостя соберут первый микс</div>
          ) : (
            <div className="card">
              <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>
                {profile.topCategories.join(" · ")}
              </div>
              <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
                Крепость {profile.averageStrength ? `${profile.averageStrength.toFixed(1)}/5` : "—"}
              </div>
              <div className="eyebrow">Любит</div>
              {Object.entries(profile.categoryShare)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, share]) => (
                  <div key={cat} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                      <span>{cat}</span>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${Math.round(share * 100)}%` }} />
                    </div>
                  </div>
                ))}
            </div>
          )}

          {profile.favoriteMixes.length > 0 && (
            <>
              <div className="eyebrow">Любимые миксы</div>
              {profile.favoriteMixes.map((m) => (
                <Link key={m.id} to={`/employee/mix/${m.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <div className="card card-row">
                    <span>
                      {m.coverEmoji} {m.title}
                    </span>
                    <Stars value={m.rating ?? 0} />
                  </div>
                </Link>
              ))}
            </>
          )}
        </>
      )}

      {tab === "history" && (
        <>
          {history.length === 0 && <div className="list-empty">Миксов пока нет</div>}
          {history.map((mix) => (
            <div key={mix.id} className="card">
              <Link to={`/employee/mix/${mix.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>
                  {mix.coverEmoji} {mix.title}
                </div>
                <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
                  {mix.items.map((it) => getFlavor(it.flavorId)?.name).join(" · ")}
                </div>
              </Link>
              <div className="card-row">
                {mix.rating ? <Stars value={mix.rating} /> : <span className="muted" style={{ fontSize: 13 }}>гость ещё не оценил</span>}
                <span className="chip">крепость {mix.strength}/5</span>
              </div>
              <div style={{ textAlign: "right", marginTop: 8 }}>
                <button
                  className="btn danger-ghost"
                  style={{ padding: "6px 12px", fontSize: 13 }}
                  onClick={() => removeMix(mix.id)}
                >
                  убрать
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      <div style={{ position: "sticky", bottom: 12, marginTop: 20 }}>
        <button className="btn primary" onClick={() => navigate(`/employee/guests/${guestId}/mix`)}>
          Собрать микс →
        </button>
      </div>
    </div>
  );
}
