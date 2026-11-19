import { useState } from "react";

// Лёгкая разметка для статей базы знаний — вместо одной "простыни" текста
// рендерим заголовки разделов и карточки по пунктам/позициям, в духе Notion:
//   # Раздел              -> заголовок-разделитель между блоками
//   ## Название пункта    -> отдельная карточка с заголовком
//   - текст / — текст     -> пункт списка (внутри текущей карточки, если она есть)
//   ![подпись](/kb/x.jpg) -> картинка (внутри текущей карточки)
//   обычная строка        -> абзац текста (внутри карточки или отдельно)
//   пустая строка         -> просто разделитель, самостоятельного смысла не несёт
//
// Формат специально простой (не полноценный markdown) — его достаточно для
// текста, который реально пишут в чек-листы и тех. карты, и не тянет
// библиотеку парсера.

type Block =
  | { kind: "h1"; text: string }
  | { kind: "card"; title?: string; items: string[]; paragraphs: string[]; images: { src: string; alt: string }[] };

function parseBody(body: string): Block[] {
  const blocks: Block[] = [];
  let current: Extract<Block, { kind: "card" }> | null = null;

  function closeCurrent() {
    if (current && (current.title || current.items.length || current.paragraphs.length || current.images.length)) {
      blocks.push(current);
    }
    current = null;
  }

  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("# ")) {
      closeCurrent();
      blocks.push({ kind: "h1", text: line.slice(2) });
      continue;
    }
    if (line.startsWith("## ")) {
      closeCurrent();
      current = { kind: "card", title: line.slice(3), items: [], paragraphs: [], images: [] };
      continue;
    }
    const img = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (img) {
      if (!current) current = { kind: "card", items: [], paragraphs: [], images: [] };
      current.images.push({ alt: img[1], src: img[2] });
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("— ")) {
      if (!current) current = { kind: "card", items: [], paragraphs: [], images: [] };
      current.items.push(line.slice(2));
      continue;
    }
    if (!current) current = { kind: "card", items: [], paragraphs: [], images: [] };
    current.paragraphs.push(line);
  }
  closeCurrent();
  return blocks;
}

type CardBlock = Extract<Block, { kind: "card" }>;

const VIEW_KEY = "kb-view";

function readView(): "cards" | "table" {
  try {
    return localStorage.getItem(VIEW_KEY) === "table" ? "table" : "cards";
  } catch {
    return "cards";
  }
}

function CardView({ block }: { block: CardBlock }) {
  return (
    <div className="card">
      {block.title && <div style={{ fontWeight: 700, marginBottom: block.items.length || block.paragraphs.length ? 8 : 0 }}>{block.title}</div>}
      {block.paragraphs.map((p, i) => (
        <p key={i} className={block.items.length ? "muted" : undefined} style={{ margin: i === 0 ? 0 : "8px 0 0", fontSize: 14, lineHeight: 1.5 }}>
          {p}
        </p>
      ))}
      {block.items.length > 0 && (
        <ul style={{ margin: block.paragraphs.length ? "8px 0 0" : 0, padding: 0, listStyle: "none" }}>
          {block.items.map((item, i) => (
            <li key={i} style={{ display: "flex", gap: 8, padding: "3px 0", fontSize: 14, lineHeight: 1.4 }}>
              <span className="muted">·</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
      {block.images.map((im, i) => (
        <img
          key={i}
          src={im.src}
          alt={im.alt}
          loading="lazy"
          style={{ display: "block", width: "100%", maxWidth: 320, margin: "10px auto 0", borderRadius: 12, border: "1px solid var(--border)" }}
        />
      ))}
    </div>
  );
}

function isTechCard(b: Block): b is CardBlock {
  return b.kind === "card" && !!b.title && b.items.length > 0 && b.images.length === 0;
}

export default function KnowledgeBody({ body, query }: { body: string; query?: string }) {
  const allBlocks = parseBody(body);
  const [view, setView] = useState<"cards" | "table">(readView);
  const [expanded, setExpanded] = useState(false);
  const q = query?.trim().toLowerCase();
  const blocks = !q
    ? allBlocks
    : allBlocks.filter(
        (block) =>
          block.kind === "h1" ||
          (block.title?.toLowerCase().includes(q) ?? false) ||
          block.items.some((i) => i.toLowerCase().includes(q)) ||
          block.paragraphs.some((p) => p.toLowerCase().includes(q)),
      );
  const canToggle = allBlocks.filter(isTechCard).length >= 2;

  function chooseView(v: "cards" | "table") {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* без хранилища просто не запоминаем */
    }
  }

  // В режиме таблицы подряд идущие тех. карты склеиваем в одну таблицу.
  const out: JSX.Element[] = [];
  for (let idx = 0; idx < blocks.length; idx++) {
    const block = blocks[idx];
    if (block.kind === "h1") {
      out.push(
        <h2 key={idx} id={`kb-h-${idx}`} style={{ marginTop: idx === 0 ? 0 : 20, scrollMarginTop: 12 }}>
          {block.text}
        </h2>,
      );
    } else if (view === "table" && isTechCard(block)) {
      const rows: CardBlock[] = [];
      let j = idx;
      while (j < blocks.length && isTechCard(blocks[j])) rows.push(blocks[j++] as CardBlock);
      out.push(
        <div key={idx} className="kb-table-wrap">
          <table className="kb-table">
            <tbody>
              {rows.map((r, k) => (
                <tr key={k}>
                  <th>{r.title}</th>
                  <td>{r.items.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      idx = j - 1;
    } else {
      out.push(<CardView key={idx} block={block} />);
    }
  }

  const headings = blocks.map((b, idx) => (b.kind === "h1" ? { idx, text: b.text } : null)).filter((x): x is { idx: number; text: string } => !!x);

  function jump(idx: number) {
    document.getElementById(`kb-h-${idx}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const content = (
    <>
      {headings.length >= 2 && !q && (
        <div className="kb-contents">
          {headings.map((h) => (
            <button key={h.idx} onClick={() => jump(h.idx)}>
              {h.text}
            </button>
          ))}
        </div>
      )}
      {out}
    </>
  );

  const toolbar = (
    <div className="kb-toolbar">
      {canToggle && (
        <div className="seg-toggle" role="tablist" style={{ margin: 0 }}>
          <button className={view === "table" ? "active" : ""} onClick={() => chooseView("table")}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" /><path d="M1.5 6.5h13M6 6.5v7" /></svg>
            Таблица
          </button>
          <button className={view === "cards" ? "active" : ""} onClick={() => chooseView("cards")}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1.5" y="2" width="13" height="5" rx="1.5" /><rect x="1.5" y="9" width="13" height="5" rx="1.5" /></svg>
            Карточки
          </button>
        </div>
      )}
      <button className="kb-expand-btn" onClick={() => setExpanded((e) => !e)}>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          {expanded ? <path d="M6 1.5V6H1.5M10 14.5V10h4.5M10 1.5V6h4.5M6 14.5V10H1.5" /> : <path d="M9.5 1.5h5v5M6.5 14.5h-5v-5M14.5 1.5L9 7M1.5 14.5L7 9" />}
        </svg>
        {expanded ? "Свернуть" : "Развернуть"}
      </button>
    </div>
  );

  if (expanded) {
    return (
      <div className="kb-expanded">
        {toolbar}
        {content}
      </div>
    );
  }
  return (
    <>
      {toolbar}
      {content}
    </>
  );
}
