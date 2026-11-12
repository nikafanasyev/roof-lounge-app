import { useState } from "react";
import { requestReportToTelegram, getReportRequestStatus } from "@/data/repo";

/**
 * "Отправить мне в Telegram" — кладёт запрос в report_requests, бот собирает
 * Excel и присылает документом в личку (см. apps/bot/src/reports.ts).
 */
export function SendReportButton({ kind, param, label = "Отправить мне в Telegram" }: { kind: "salary" | "expenses"; param: string; label?: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleClick() {
    setState("sending");
    setMessage("");
    const id = await requestReportToTelegram(kind, param);
    if (!id) {
      setState("error");
      setMessage("Не удалось отправить запрос — откройте приложение из Telegram.");
      return;
    }
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      const st = await getReportRequestStatus(id);
      if (st?.status === "done") {
        setState("sent");
        setMessage("Готово — файл пришёл вам в личные сообщения от бота.");
        return;
      }
      if (st?.status === "failed") {
        setState("error");
        setMessage(`Не получилось: ${st.result ?? "неизвестная ошибка"}`);
        return;
      }
    }
    setState("error");
    setMessage("Бот пока не ответил. Проверьте, что он запущен, и попробуйте ещё раз.");
  }

  return (
    <div>
      <button className="btn secondary" style={{ width: "100%" }} disabled={state === "sending"} onClick={handleClick}>
        {state === "sending" ? "Формирую и отправляю…" : label}
      </button>
      {message && (
        <div className="muted" style={{ marginTop: 8, fontSize: 12, color: state === "error" ? "var(--danger)" : "var(--good)" }}>
          {message}
        </div>
      )}
    </div>
  );
}
