import { useParams } from "react-router-dom";
import GuestFlow from "./GuestFlow";

// Гостевой экран открывается по QR-коду со стола: t.me/<бот>/app?startapp=table_<token>
// (или напрямую по ссылке /table/<token> в обычном браузере). Сейчас номер
// стола демонстрационно зашит в токен вида "table-7" (см. getOrCreateTableId в repo.ts).
function tableNumberFromToken(token: string): number {
  const match = token.match(/\d+/);
  return match ? Number(match[0]) : 1;
}

export default function TableGuestScreen() {
  const { token = "table-1" } = useParams();
  return (
    <div className="app">
      <GuestFlow tableNumber={tableNumberFromToken(token)} />
    </div>
  );
}
