import { useState } from "react";

/**
 * Имя/ФИО с явной кнопкой "Сохранить" — показывается обычным текстом, по
 * "Изменить" превращается в поле; сохранить можно только когда текст
 * изменился и не пустой (просьба Никиты 12.11.2026: ФИО должен менять и
 * сотрудник, и руководитель, а при правках — кнопка "Сохранить").
 */
export function NameEditor({
  name,
  onSave,
  fontSize = 18,
}: {
  name: string;
  onSave: (next: string) => Promise<{ error?: string } | void>;
  fontSize?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = value.trim().replace(/\s+/g, " ");
  const changed = trimmed !== name && trimmed.length > 0;

  async function handleSave() {
    if (!changed) return;
    setBusy(true);
    setError(null);
    try {
      const result = await onSave(trimmed);
      if (result && result.error) {
        setError("Не получилось сохранить — попробуйте ещё раз");
        return;
      }
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div>
        <div style={{ fontWeight: 700, fontSize }}>{name}</div>
        <button
          className="btn ghost"
          style={{ padding: "6px 12px", fontSize: 12, marginTop: 6 }}
          onClick={() => {
            setValue(name);
            setEditing(true);
          }}
        >
          Изменить ФИО
        </button>
      </div>
    );
  }

  return (
    <div style={{ minWidth: 0 }}>
      <div className="eyebrow">ФИО</div>
      <input
        type="text"
        value={value}
        autoFocus
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        placeholder="Фамилия Имя Отчество"
      />
      {error && <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 6 }}>{error}</div>}
      <div className="btn-row" style={{ marginTop: 10 }}>
        <button className="btn primary" style={{ padding: "10px 14px", fontSize: 14 }} disabled={!changed || busy} onClick={handleSave}>
          {busy ? "Сохраняю…" : "Сохранить"}
        </button>
        <button
          className="btn secondary"
          style={{ padding: "10px 14px", fontSize: 14 }}
          disabled={busy}
          onClick={() => {
            setEditing(false);
            setError(null);
          }}
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
