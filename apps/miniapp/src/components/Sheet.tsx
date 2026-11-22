import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Нижняя «шторка» поверх экрана. Рендерится через портал в body: внутри .screen
 * (там есть анимация/transform) position: fixed считался от контейнера, и окно
 * уезжало за пределы экрана — оставалась пустая полоса (фидбек Никиты 22.11.2026).
 */
export default function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return createPortal(
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: "90dvh",
          overflowY: "auto",
          background: "var(--surface, #1c1f26)",
          color: "var(--ink, #fff)",
          border: "1px solid var(--border)",
          borderRadius: "16px 16px 0 0",
          padding: 16,
          paddingBottom: "calc(24px + env(safe-area-inset-bottom))",
          boxSizing: "border-box",
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
