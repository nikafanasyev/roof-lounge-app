import { useEffect, useState } from "react";
import { getGuestByIdRemote } from "@/data/repo";
import type { Guest } from "@/types";
import GuestAuth from "./GuestAuth";
import GuestTasteProfile from "./GuestTasteProfile";
import GuestHome from "./GuestHome";

// Личность гостя хранится в localStorage на его устройстве — не привязана к
// Telegram (см. обсуждение с Никитой 11.10.2026: вход по телефону, без SMS).
const STORAGE_KEY = "roof_guest_id";

function hasTasteProfile(guest: Guest): boolean {
  return (guest.likedAromaIds?.length ?? 0) > 0;
}

/**
 * Оркестратор гостевого сценария: авторизация по телефону -> (при первой
 * регистрации, или если профиль почему-то не заполнен) вкусовой квиз ->
 * главный экран гостя. Открывается по QR со стола, см. TableGuestScreen.tsx.
 */
export default function GuestFlow({ tableNumber }: { tableNumber: number }) {
  const [guest, setGuest] = useState<Guest | null>(null);
  const [loading, setLoading] = useState(true);

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

  function handleAuthed(g: Guest) {
    localStorage.setItem(STORAGE_KEY, g.id);
    setGuest(g);
  }

  function handleTasteProfileDone(patch: Partial<Guest>) {
    setGuest((g) => (g ? { ...g, ...patch } : g));
  }

  if (loading) {
    return <div className="screen" style={{ paddingTop: 32 }} />;
  }

  if (!guest) {
    return <GuestAuth onAuthed={handleAuthed} />;
  }

  // Квиз показываем, если его ещё не проходили (новый гость, или старый без
  // заполненного профиля) — не только сразу после регистрации.
  if (!hasTasteProfile(guest)) {
    return <GuestTasteProfile guest={guest} onDone={handleTasteProfileDone} />;
  }

  return <GuestHome guest={guest} tableNumber={tableNumber} />;
}
