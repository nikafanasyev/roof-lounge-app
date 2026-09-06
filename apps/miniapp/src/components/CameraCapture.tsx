import { useRef, useState } from "react";

// Открывает камеру устройства (атрибут capture — на мобильных сразу запускает
// системную камеру, а не выбор файла) и вшивает дату/время съёмки прямо в
// пиксели фото (штамп в углу), чтобы его нельзя было просто подменить старым
// снимком из галереи. Отдаёт наружу и превью (object URL, только для показа
// в интерфейсе), и сам Blob — вызывающий код отправляет его дальше и нигде
// не сохраняет постоянно (см. data/repo.ts uploadAndNotifyShiftPhoto).

interface Props {
  previewUrl?: string;
  onCapture: (previewUrl: string, blob: Blob) => void;
  label?: string;
}

export default function CameraCapture({ previewUrl, onCapture, label = "Сделать фото" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // чтобы можно было пересъёмкой выбрать тот же файл повторно
    if (!file) return;
    setBusy(true);

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setBusy(false);
          return;
        }
        ctx.drawImage(img, 0, 0);

        const stamp = new Date().toLocaleString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
        const fontSize = Math.max(16, Math.round(canvas.width / 26));
        ctx.font = `700 ${fontSize}px sans-serif`;
        const paddingX = fontSize * 0.6;
        const paddingY = fontSize * 0.45;
        const textWidth = ctx.measureText(stamp).width;
        const boxWidth = textWidth + paddingX * 2;
        const boxHeight = fontSize + paddingY * 2;
        const margin = Math.round(canvas.width * 0.03);

        ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
        ctx.fillRect(canvas.width - boxWidth - margin, canvas.height - boxHeight - margin, boxWidth, boxHeight);
        ctx.fillStyle = "#ffffff";
        ctx.textBaseline = "middle";
        ctx.fillText(stamp, canvas.width - boxWidth - margin + paddingX, canvas.height - margin - boxHeight / 2);

        canvas.toBlob(
          (blob) => {
            setBusy(false);
            if (!blob) return;
            onCapture(URL.createObjectURL(blob), blob);
          },
          "image/jpeg",
          0.85,
        );
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        style={{ display: "none" }}
      />
      {previewUrl ? (
        <div className="card" style={{ padding: 8 }}>
          <img src={previewUrl} alt="" style={{ width: "100%", borderRadius: 8, display: "block" }} />
          <button
            className="btn secondary"
            style={{ width: "100%", marginTop: 8 }}
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            Переснять
          </button>
        </div>
      ) : (
        <button className="btn secondary" style={{ width: "100%" }} onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? "Обработка…" : `📸 ${label}`}
        </button>
      )}
    </div>
  );
}
