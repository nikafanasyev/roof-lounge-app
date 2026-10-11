import { useEffect, useState } from "react";
import { getGuestByIdRemote } from "@/data/repo";
import type { Guest } from "@/types";
import GuestAuth from "./GuestAuth";
import GuestTasteProfile from "./GuestTasteProfile";
import GuestHome from "./GuestHome";

// Личность гостя хранится в localStorage на его устройстве — не привязана к
// Telegram (см. обсуждение с Никитой 11.10.2026: вход по телефону, без SMS).
const STORAGE_KEY = "roof_guest_id";

type GuestTab = "home" | "taste";

function hasTasteProfile(guest: Guest): boolean {
  return (guest.likedAromaIds?.length ?? 0) > 0;
}

/**
 * Оркестратор гостевого сценария: авторизация по телефону -> (при первой
 * регистрации, или если профиль почему-то не заполнен) вкусовой квиз ->
 * главный экран гостя с нижним сайдбаром (Главная / Вкусовой профиль), см.
 * обсуждение с Никитой 11.10.2026 — профиль вынесен отдельной вкладкой, а
 * не кнопкой внутри главного экрана.
 */
export default function GuestFlow({ tableNumber }: { tableNumber: number }) {
  const [guest, setGuest] = useState<Guest | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<GuestTab>("home");

  useEffect(() => {
    const storedId = localStorage.getItem(STORAGE_KEY);
    if (!storedId) {
      setLoading(false);
      return;
    }
    getGuestByIdRemote(storedId).then((g) => {
      setGuest(g);
      setLoading(false);
      if (!g) localStorage.removeItem(STORAGE_KEY); // профиль не нашёлся — начинаем заново
    });
  }, []);

  function handleAuthed(g: Guest, _isNew: boolean) {
    localStorage.setItem(STORAGE_KEY, g.id);
    setGuest(g);
  }

  function handleTasteProfileDone(patch: Partial<Guest>) {
    setGuest((g) => (g ? { ...g, ...patch } : g));
    setTab("home");
  }

  if (loading) {
    return <div className="screen" style={{ paddingTop: 32 }} />;
  }

  if (!guest) {
    return <GuestAuth onAuthed={handleAuthed} />;
  }

  // Квиз на весь экран (без нижнего сайдбара), пока профиль не заполнен ни
  // разу — это ещё онбординг, не обычный просмотр/редактирование.
  if (!hasTasteProfile(guest)) {
    return <GuestTasteProfile guest={guest} onDone={handleTasteProfileDone} />;
  }

  return (
    <>
      {tab === "home" ? (
        <GuestHome guest={guest} tableNumber={tableNumber} />
      ) : (
        <GuestTasteProfile guest={guest} onDone={handleTasteProfileDone} />
      )}
      <nav className="bottom-nav">
        <button className={tab === "home" ? "active" : ""} onClick={() => setTab("home")}>
          <span className="icon">🏠</span>Главная
        </button>
        <button className={tab === "taste" ? "active" : ""} onClick={() => setTab("taste")}>
          <span className="icon">👃</span>Вкусовой профиль
        </button>
      </nav>
    </>
  );
}
