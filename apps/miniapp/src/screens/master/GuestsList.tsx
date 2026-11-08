import { useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/data/useStore";
import { guestsStore, listMixesForGuest } from "@/data/repo";
import type { Guest } from "@/types";

// После подключения реальной базы Quick Resto (~2500+ клиентов) список без
// ограничения рендерил ВСЕХ разом — заметно тормозило и по сути было
// бесполезно пролистывать руками. См. обсуждение с Никитой. Решение: без
// поискового запроса показываем не подсказку в пустоту, а RECENT_LIMIT
// гостей, отсортированных по последнему визиту (обычно это и есть те, кого
// ищут чаще всего) — а по запросу не более MAX_RESULTS совпадений по имени.
const MAX_RESULTS = 50;
const RECENT_LIMIT = 20;

function guestWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "гость";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "гостя";
  return "гостей";
}

function GuestRow({ guest }: { guest: Guest }) {
  const mixCount = listMixesForGuest(guest.id).length;
  return (
    <Link to={`/employee/guests/${guest.id}`} style={{ textDecoration: "none", color: "inherit" }}>
      <div className="card card-row">
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
  );
}

export default function GuestsList() {
  const guests = useStore(guestsStore);
  const [query, setQuery] = useState("");
  const trimmed = query.trim().toLowerCase();

  const matches = trimmed ? guests.filter((g) => g.displayName.toLowerCase().includes(trimmed)) : [];
  const shown = matches.slice(0, MAX_RESULTS);

  const recent = [...guests]
    .filter((g) => g.lastVisitAt)
    .sort((a, b) => (b.lastVisitAt! < a.lastVisitAt! ? -1 : 1))
    .slice(0, RECENT_LIMIT);

  return (
    <div className="screen">
      <div className="card-row" style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Гости</h1>
        <Link to="/employee/guests/new" className="btn primary" style={{ textDecoration: "none" }}>
          + Создать карту
        </Link>
      </div>
      <input
        type="text"
        placeholder="Поиск гостя по имени"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 16 }}
      />

      {!trimmed && (
        <>
          <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
            Недавние гости · всего в базе {guests.length.toLocaleString("ru-RU")} {guestWord(guests.length)}, для остальных —
            поиск по имени выше.
          </div>
          {recent.length === 0 && <div className="list-empty">Пока ни у кого не было визита — начните вводить имя для поиска.</div>}
          {recent.map((guest) => (
            <GuestRow key={guest.id} guest={guest} />
          ))}
        </>
      )}

      {trimmed && matches.length === 0 && <div className="list-empty">Никого не нашли</div>}

      {trimmed && shown.map((guest) => <GuestRow key={guest.id} guest={guest} />)}

      {trimmed && matches.length > MAX_RESULTS && (
        <div className="muted" style={{ fontSize: 13, textAlign: "center", marginTop: 8 }}>
          Показаны первые {MAX_RESULTS} из {matches.length} — уточните имя, чтобы сузить список.
        </div>
      )}
    </div>
  );
}
