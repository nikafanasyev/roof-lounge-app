import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getKnowledgeArticle, splitKnowledgeSections } from "@/data/repo";
import KnowledgeBody from "@/components/KnowledgeBody";

export default function KnowledgeArticleScreen() {
  const { articleId = "", sectionIndex } = useParams();
  const article = getKnowledgeArticle(articleId);
  const [query, setQuery] = useState("");

  if (!article) {
    return (
      <div className="screen">
        <div className="list-empty">Статья не найдена</div>
      </div>
    );
  }

  const sections = splitKnowledgeSections(article.body);
  const hasCategories = sections.length >= 2;
  const selectedIndex = sectionIndex !== undefined ? Number(sectionIndex) : null;
  const selectedSection = selectedIndex !== null ? sections[selectedIndex] : undefined;
  const q = query.trim().toLowerCase();

  // Статья с несколькими разделами и без выбранного раздела — показываем
  // меню категорий (кнопки). Поиск здесь фильтрует разделы по названию и по
  // содержимому внутри (чтобы можно было найти нужный раздел по позиции, а
  // не только по названию категории).
  if (hasCategories && !selectedSection) {
    const filteredSections = !q
      ? sections
      : sections.filter((section, idx) => sections[idx].title.toLowerCase().includes(q) || section.body.toLowerCase().includes(q));
    return (
      <div className="screen">
        <Link to="/employee/knowledge" className="muted" style={{ textDecoration: "none", fontSize: 14 }}>
          ← База знаний
        </Link>
        <div className="eyebrow" style={{ marginTop: 12 }}>
          {article.category}
        </div>
        <h1>{article.title}</h1>
        <input
          type="text"
          placeholder="Поиск по разделам и позициям"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ marginBottom: 12 }}
        />
        {filteredSections.length === 0 && <div className="list-empty">Ничего не нашли</div>}
        {filteredSections.map((section) => {
          const idx = sections.indexOf(section);
          return (
            <Link key={section.title + idx} to={`/employee/knowledge/${article.id}/${idx}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div className="card card-row">
                <span>{section.title}</span>
                <span className="muted">→</span>
              </div>
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <div className="screen">
      <Link
        to={hasCategories ? `/employee/knowledge/${article.id}` : "/employee/knowledge"}
        className="muted"
        style={{ textDecoration: "none", fontSize: 14 }}
      >
        {hasCategories ? `← ${article.title}` : "← База знаний"}
      </Link>
      <div className="eyebrow" style={{ marginTop: 12 }}>
        {article.category}
      </div>
      <h1>{selectedSection ? selectedSection.title : article.title}</h1>
      <input
        type="text"
        placeholder="Поиск по позициям"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 12 }}
      />
      <KnowledgeBody
        body={
          selectedSection
            ? selectedSection.body.split("\n").slice(1).join("\n") // первая строка "# Раздел" уже показана как <h1>
            : article.body
        }
        query={query}
      />
    </div>
  );
}
