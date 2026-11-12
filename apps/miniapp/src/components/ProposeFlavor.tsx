import { useState } from "react";
import { proposeFlavor } from "@/data/repo";

/** Если нужного вкуса нет в каталоге — мастер отправляет заявку руководству. */
export default function ProposeFlavor({ initialQuery }: { initialQuery: string }) {
  const [open, setOpen] = useState(false);
  const [brand, setBrand] = useState("");
  const [name, setName] = useState(initialQuery);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit() {
    setBusy(true);
    const err = await proposeFlavor(brand, name, note);
    setBusy(false);
    if (err) return setMsg({ ok: false, text: err });
    setMsg({ ok: true, text: "Отправлено руководству на согласование. Вкус появится в каталоге после одобрения." });
    setOpen(false);
    setBrand("");
    setNote("");
  }

  if (msg?.ok) return <div className="card" style={{ marginTop: 12 }}>✅ {msg.text}</div>;

  return (
    <div style={{ marginTop: 12 }}>
      {!open ? (
        <button type="button" className="btn secondary" style={{ width: "100%" }} onClick={() => { setName(initialQuery); setOpen(true); }}>
          ＋ Предложить новый вкус
        </button>
      ) : (
        <div className="card" style={{ display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 700 }}>Новый вкус на согласование</div>
          <input type="text" placeholder="Бренд (например, Black Burn)" value={brand} onChange={(e) => setBrand(e.target.value)} />
          <input type="text" placeholder="Название вкуса" value={name} onChange={(e) => setName(e.target.value)} />
          <input type="text" placeholder="Комментарий (необязательно)" value={note} onChange={(e) => setNote(e.target.value)} />
          {msg && <div style={{ color: "var(--danger, #e5484d)", fontSize: 13 }}>{msg.text}</div>}
          <button type="button" className="btn" disabled={busy || !brand.trim() || !name.trim()} onClick={submit}>
            Отправить руководству
          </button>
          <button type="button" className="btn secondary" onClick={() => setOpen(false)}>
            Отмена
          </button>
        </div>
      )}
    </div>
  );
}
