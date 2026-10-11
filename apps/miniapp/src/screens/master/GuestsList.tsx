import { useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/data/useStore";
import { computeTasteProfile, guestsStore, listMixesForGuest } from "@/data/repo";

export default function GuestsList() {
  const guests = useStore(guestsStore);
  const [query, setQuery] = useState("");

  const filtered = guests.filter((g) => g.displayName.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="screen">
      <h1>Гости</h1>
      <input
        type="text"
        placeholder="Поиск гостя по имени"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 16 }}
      />

      {filtered.length === 0 && <div className="list-empty">Никого не нашли</div>}

      {filtered.map((guest) => {
        const mixCount = listMixesForGuest(guest.id).length;
        const taste = computeTasteProfile(guest.id);
        return (
          <div key={guest.id} className="card">
            <Link to={`/employee/guests/${guest.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div className="card-row" style={{ marginBottom: taste.topCategories.length ? 6 : 0 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{guest.displayName}</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {mixCount ? `${mixCount} микс${mixCount === 1 ? "" : "ов"} в истории` : "ещё не было миксов"}
                  </div>
                </div>
                <div className="chip-row" style={{ margin: 0 }}>
                  {guest.badges?.map((b) => (
                    <span key={b} className="chip accent">
                      {b}
                    </span>
                  ))}
                </div>
              </div>
            </Link>
            <Link
              to={`/employee/guests/${guest.id}`}
              className="btn secondary"
              style={{ display: "block", textAlign: "center", padding: "8px 0", fontSize: 13, textDecoration: "none" }}
            >
              {taste.topCategories.length ? `👃 Вкусовой профиль: ${taste.topCategories.join(" · ")}` : "👃 Вкусовой профиль"}
            </Link>
          </div>
        );
      })}
    </div>
  );
}
