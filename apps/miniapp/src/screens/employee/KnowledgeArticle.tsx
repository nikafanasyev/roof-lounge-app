import { Link, useParams } from "react-router-dom";
import { getKnowledgeArticle, splitKnowledgeSections } from "@/data/repo";
import KnowledgeBody from "@/components/KnowledgeBody";

export default function KnowledgeArticleScreen() {
  const { articleId = "", sectionIndex } = useParams();
  const article = getKnowledgeArticle(articleId);

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

  // Статья с несколькими разделами и без выбранного раздела — показываем
  // меню категорий (кнопки), а не всё содержимое сразу.
  if (hasCategories && !selectedSection) {
    return (
      <div className="screen">
        <Link to="/employee/knowledge" className="muted" style={{ textDecoration: "none", fontSize: 14 }}>
          ← База знаний
        </Link>
        <div className="eyebrow" style={{ marginTop: 12 }}>
          {article.category}
        </div>
        <h1>{article.title}</h1>
        {sections.map((section, idx) => (
          <Link
            key={section.title + idx}
            to={`/employee/knowledge/${article.id}/${idx}`}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div className="card card-row">
              <span>{section.title}</span>
              <span className="muted">→</span>
            </div>
          </Link>
        ))}
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
      <KnowledgeBody
        body={
          selectedSection
            ? selectedSection.body.split("\n").slice(1).join("\n") // первая строка "# Раздел" уже показана как <h1>
            : article.body
        }
      />
    </div>
  );
}
