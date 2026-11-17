import { useState } from "react";
import { Link } from "react-router-dom";
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

function pluralArticles(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} статья`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} статьи`;
  return `${n} статей`;
}

export default function Knowledge() {
  useStore(knowledgeStore);
  const groups = groupKnowledgeByCategory();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const q = query.trim().toLowerCase();

  const visibleGroups = groups
    .filter((g) => !category || g.category === category)
    .map((g) => ({
      ...g,
      articles: q ? g.articles.filter((a) => a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q)) : g.articles,
    }))
    .filter((g) => g.articles.length > 0);

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

      <div className="kb-cat-grid">
        {groups.map((g) => (
          <button
            key={g.category}
            className={`kb-cat-tile ${category === g.category ? "active" : ""}`}
            onClick={() => setCategory(category === g.category ? null : g.category)}
          >
            <span className="icon">{CATEGORY_ICONS[g.category] ?? "📄"}</span>
            <span className="name">{g.category}</span>
            <span className="count">{pluralArticles(g.articles.length)}</span>
          </button>
        ))}
      </div>

      {visibleGroups.length === 0 && <div className="list-empty">Ничего не нашли</div>}
      {visibleGroups.map((group) => (
        <div key={group.category} style={{ marginBottom: 16 }}>
          <h2>{group.category}</h2>
          {group.articles.map((a) => (
            <Link key={a.id} to={`/employee/knowledge/${a.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div className="card card-row">
                <span>{a.title}</span>
                <span className="muted">→</span>
              </div>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}
