import { useParams } from "react-router-dom";
import { getStartTableNumber } from "@/lib/telegram";
import { parseTable } from "@/lib/tables";
import GuestFlow from "./GuestFlow";

// Гостевой экран открывается по QR-коду со стола: t.me/<бот>/app?startapp=table_<N>
// (номер приходит в start_param) или по ссылке /table/<token> в обычном браузере.
// Если номер стола не удалось определить (гость открыл приложение кнопкой бота),
// null — гость выберет стол сам на главном экране.
function tableNumberFromToken(token: string | undefined): number | null {
  const m = token?.match(/^table[_-]?(.+)$/i);
  return m ? parseTable(m[1]) : null;
}

export default function TableGuestScreen() {
  const { token } = useParams();
  const tableNumber = tableNumberFromToken(token) ?? getStartTableNumber();
  return (
    <div className="app">
      <GuestFlow tableNumber={tableNumber} />
    </div>
  );
}
