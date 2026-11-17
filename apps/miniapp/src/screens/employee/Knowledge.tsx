import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useStore } from "@/data/useStore";
import { groupKnowledgeByCategory, knowledgeStore } from "@/data/repo";

const CATEGORY_ICONS: Record<string, string> = {
  "Смена": "⏱",
  "Зал": "🛋",
  "Меню": "🍹",
  "HR": "👥",
  "Техника": "🔧",
  "Безопасность": "🛡",
  "Правила бронирования": "📅",
};

const CAT_VIEW_KEY = "kb-cat-view";

function readCatView(): "tiles" | "list" {
  try {
    return localStorage.getItem(CAT_VIEW_KEY) === "list" ? "list" : "tiles";
  } catch {
    return "tiles";
  }
}

export default function Knowledge() {
  useStore(knowledgeStore);
  const groups = groupKnowledgeByCategory();
  const [query, setQuery] = useState("");
  const [catView, setCatView] = useState<"tiles" | "list">(readCatView);
  const [params, setParams] = useSearchParams();
  const category = params.get("cat");
  const q = query.trim().toLowerCase();

  const inCategory = category ? groups.find((g) => g.category === category) : undefined;

  // Поиск работает по всей базе; внутри категории — только по её статьям.
  const visibleGroups = groups
    .filter((g) => !inCategory || g.category === inCategory.category)
    .map((g) => ({
      ...g,
      articles: q ? g.articles.filter((a) => a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q)) : g.articles,
    }))
    .filter((g) => g.articles.length > 0);

  function chooseCatView(v: "tiles" | "list") {
    setCatView(v);
    try {
      localStorage.setItem(CAT_VIEW_KEY, v);
    } catch {
      /* без хранилища просто не запоминаем */
    }
  }

  function openCategory(name: string) {
    setQuery("");
    setParams({ cat: name });
  }

  function articleCard(a: { id: string; title: string }) {
    return (
      <Link key={a.id} to={`/employee/knowledge/${a.id}`} style={{ textDecoration: "none", color: "inherit" }}>
        <div className="card card-row">
          <span>{a.title}</span>
          <span className="muted">→</span>
        </div>
      </Link>
    );
  }

  // Внутри категории: свой экран со списком статей.
  if (inCategory) {
    return (
      <div className="screen">
        <button
          className="muted"
          onClick={() => setParams({})}
          style={{ background: "none", border: "none", padding: 0, font: "inherit", fontSize: 14, cursor: "pointer" }}
        >
          ← База знаний
        </button>
        <h1>
          {CATEGORY_ICONS[inCategory.category] ?? "📄"} {inCategory.category}
        </h1>
        <input
          type="text"
          placeholder={`Поиск в «${inCategory.category}»`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ marginBottom: 12 }}
        />
        {visibleGroups.length === 0 && <div className="list-empty">Ничего не нашли</div>}
        {visibleGroups.flatMap((g) => g.articles).map(articleCard)}
      </div>
    );
  }

  return (
    <div className="screen">
      <Link to="/employee/more" className="muted" style={{ textDecoration: "none", fontSize: 14 }}>
        ← Ещё
      </Link>
      <h1>База знаний</h1>

      <input
        type="text"
        placeholder="Поиск по статьям и позициям"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 12 }}
      />

      {!q && (
        <>
          <div className="seg-toggle" role="tablist">
            <button className={catView === "tiles" ? "active" : ""} onClick={() => chooseCatView("tiles")}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1.5" y="1.5" width="5" height="5" rx="1" /><rect x="9.5" y="1.5" width="5" height="5" rx="1" /><rect x="1.5" y="9.5" width="5" height="5" rx="1" /><rect x="9.5" y="9.5" width="5" height="5" rx="1" /></svg>
              Плитки
            </button>
            <button className={catView === "list" ? "active" : ""} onClick={() => chooseCatView("list")}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 3.5h9.5M5 8h9.5M5 12.5h9.5M1.5 3.5h.5M1.5 8h.5M1.5 12.5h.5" /></svg>
              Список
            </button>
          </div>
          {catView === "tiles" ? (
            <div className="kb-cat-grid">
              {groups.map((g) => (
                <button key={g.category} className="kb-cat-tile" onClick={() => openCategory(g.category)}>
                  <span className="icon">{CATEGORY_ICONS[g.category] ?? "📄"}</span>
                  <span className="name">{g.category}</span>
                  <span className="count">{g.articles.length}</span>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ marginBottom: 16 }}>
              {groups.map((g) => (
                <div key={g.category} className="card card-row" style={{ cursor: "pointer" }} onClick={() => openCategory(g.category)}>
                  <span>
                    {CATEGORY_ICONS[g.category] ?? "📄"} {g.category}
                  </span>
                  <span className="muted">
                    {g.articles.length} →
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {q && visibleGroups.length === 0 && <div className="list-empty">Ничего не нашли</div>}
      {q &&
        visibleGroups.map((group) => (
          <div key={group.category} style={{ marginBottom: 16 }}>
            <h2>{group.category}</h2>
            {group.articles.map(articleCard)}
          </div>
        ))}
    </div>
  );
}
