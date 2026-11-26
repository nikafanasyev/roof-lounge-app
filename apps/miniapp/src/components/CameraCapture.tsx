import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { findDuplicatePhoto, rememberPhoto } from "@/data/repo";
import { dHash, readExifDate, staleReason } from "@/lib/photoGuard";

// Фото смены — только живой камерой внутри приложения (getUserMedia): кадр берётся
// прямо с видеопотока, поэтому выбрать снимок из галереи нельзя. На Android
// Telegram игнорирует атрибут capture и открывает Google Фото — через него
// старые фото проходили (фидбек Никиты 26.11.2026). Системный выбор файла
// остаётся только запасным путём, если камеру в приложении открыть не удалось,
// и там действует строгая проверка свежести (на Android — обязательно EXIF).
// На кадр вшивается штамп даты/времени; наружу отдаются превью и Blob.

interface Props {
  previewUrl?: string;
  onCapture: (previewUrl: string, blob: Blob) => void;
  label?: string;
}

const isAndroid = () => /android/i.test(navigator.userAgent);

/** Штамп даты/времени в правом нижнем углу. */
function drawStamp(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const stamp = new Date().toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
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
}

/** Живая камера на весь экран: «Снять» берёт кадр с видеопотока. */
function LiveCamera({ onShot, onClose, onUnavailable }: { onShot: (canvas: HTMLCanvasElement) => void; onClose: () => void; onUnavailable: (msg: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  // Колбэк в ref — чтобы перерисовка родителя не перезапускала камеру.
  const unavailableRef = useRef(onUnavailable);
  unavailableRef.current = onUnavailable;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setReady(true);
      } catch {
        if (!cancelled) unavailableRef.current("Не удалось открыть камеру в приложении. Разрешите Telegram доступ к камере в настройках телефона и попробуйте ещё раз.");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function shoot() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")?.drawImage(v, 0, 0);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onShot(canvas);
  }

  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 1100, overflow: "hidden" }}>
      {/* Видео — на весь экран, кнопки поверх него внизу: раньше видео растягивалось
          по высоте и выталкивало кнопку «Снять» за экран (Android, фидбек 26.11.2026). */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", background: "#000" }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          gap: 12,
          padding: 16,
          paddingBottom: "calc(28px + env(safe-area-inset-bottom))",
          background: "linear-gradient(transparent, rgba(0,0,0,0.75) 40%)",
        }}
      >
        <button className="btn secondary" style={{ flex: 1 }} onClick={onClose}>
          Отмена
        </button>
        <button className="btn primary" style={{ flex: 2 }} disabled={!ready} onClick={shoot}>
          {ready ? "📸 Снять" : "Открываем камеру…"}
        </button>
      </div>
    </div>,
    document.body,
  );
}

export default function CameraCapture({ previewUrl, onCapture, label = "Сделать фото" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [live, setLive] = useState(false);
  const [fallback, setFallback] = useState(false);

  /** Общая обработка кадра: проверка повтора, штамп, Blob. */
  async function finish(source: HTMLImageElement | HTMLCanvasElement) {
    const hash = dHash(source);
    const dup = await findDuplicatePhoto(hash);
    if (dup) {
      setBusy(false);
      const when = new Date(dup.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      setError(`Это фото уже отправлялось ${when}${dup.staffName ? ` (${dup.staffName})` : ""}. Сделайте новый снимок.`);
      return;
    }
    rememberPhoto(hash);
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    canvas.getContext("2d")?.drawImage(source, 0, 0);
    drawStamp(canvas);
    canvas.toBlob(
      (blob) => {
        setBusy(false);
        if (blob) onCapture(URL.createObjectURL(blob), blob);
      },
      "image/jpeg",
      0.85,
    );
  }

  function start() {
    setError("");
    if (typeof navigator.mediaDevices?.getUserMedia === "function" && !fallback) setLive(true);
    else inputRef.current?.click();
  }

  // Запасной путь: системный выбор файла (только если живую камеру открыть нельзя).
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    let exif: Date | null = null;
    try {
      exif = readExifDate(await file.arrayBuffer());
    } catch {
      exif = null;
    }
    // Google Фото на Android отдаёт копию со свежим временем файла — без EXIF свежесть не проверить.
    if (!exif && isAndroid()) {
      setBusy(false);
      setError("Нужен снимок камерой прямо сейчас. Разрешите Telegram доступ к камере в настройках телефона — тогда фото будет делаться внутри приложения.");
      return;
    }
    const stale = staleReason(file, exif);
    if (stale) {
      setBusy(false);
      setError(stale);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => void finish(img);
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: "none" }} />
      {live && (
        <LiveCamera
          onClose={() => setLive(false)}
          onUnavailable={(msg) => {
            setLive(false);
            setFallback(true);
            setError(msg);
          }}
          onShot={(canvas) => {
            setLive(false);
            setBusy(true);
            void finish(canvas);
          }}
        />
      )}
      {error && <div style={{ color: "var(--danger, #e5484d)", fontSize: 13, margin: "0 0 8px" }}>{error}</div>}
      {previewUrl ? (
        <div className="card" style={{ padding: 8 }}>
          <img src={previewUrl} alt="" style={{ width: "100%", borderRadius: 8, display: "block" }} />
          <button className="btn secondary" style={{ width: "100%", marginTop: 8 }} onClick={start} disabled={busy}>
            Переснять
          </button>
        </div>
      ) : (
        <button className="btn secondary" style={{ width: "100%" }} onClick={start} disabled={busy}>
          {busy ? "Обработка…" : `📸 ${label}`}
        </button>
      )}
    </div>
  );
}
