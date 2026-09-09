// Лёгкая разметка для статей базы знаний — вместо одной "простыни" текста
// рендерим заголовки разделов и карточки по пунктам/позициям, в духе Notion:
//   # Раздел              -> заголовок-разделитель между блоками
//   ## Название пункта    -> отдельная карточка с заголовком
//   - текст / — текст     -> пункт списка (внутри текущей карточки, если она есть)
//   обычная строка        -> абзац текста (внутри карточки или отдельно)
//   пустая строка         -> просто разделитель, самостоятельного смысла не несёт
//
// Формат специально простой (не полноценный markdown) — его достаточно для
// текста, который реально пишут в чек-листы и тех. карты, и не тянет
// библиотеку парсера.

type Block =
  | { kind: "h1"; text: string }
  | { kind: "card"; title?: string; items: string[]; paragraphs: string[] };

function parseBody(body: string): Block[] {
  const blocks: Block[] = [];
  let current: Extract<Block, { kind: "card" }> | null = null;

  function closeCurrent() {
    if (current && (current.title || current.items.length || current.paragraphs.length)) {
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
      current = { kind: "card", title: line.slice(3), items: [], paragraphs: [] };
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("— ")) {
      if (!current) current = { kind: "card", items: [], paragraphs: [] };
      current.items.push(line.slice(2));
      continue;
    }
    if (!current) current = { kind: "card", items: [], paragraphs: [] };
    current.paragraphs.push(line);
  }
  closeCurrent();
  return blocks;
}

export default function KnowledgeBody({ body }: { body: string }) {
  const blocks = parseBody(body);

  return (
    <>
      {blocks.map((block, idx) =>
        block.kind === "h1" ? (
          <h2 key={idx} style={{ marginTop: idx === 0 ? 0 : 20 }}>
            {block.text}
          </h2>
        ) : (
          <div key={idx} className="card">
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
          </div>
        ),
      )}
    </>
  );
}
