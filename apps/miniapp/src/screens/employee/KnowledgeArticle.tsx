import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CLEANING_ROLE_WEEKS, getCurrentStaffRole, getKnowledgeArticle, splitKnowledgeSections, STAFF_ROLE_TO_CLEANING_ROLE } from "@/data/repo";
import KnowledgeBody from "@/components/KnowledgeBody";
import CleaningChecklist from "./CleaningChecklist";

// Статья "Генеральная уборка" — единственная, у которой разделы (Бар/Кухня/
// Уборщица/Кальянный мастер) рендерятся не как текст, а как интерактивный
// чек-лист с чекбоксами и логом выполнения (см. CleaningChecklist.tsx и
// обсуждение с Никитой 11.10.2026 — "добавить чек-боксы и сохранять дату",
// "для бара и для км отображаться должны соответствующие задачи").
const CLEANING_ARTICLE_ID = "k12";

export default function KnowledgeArticleScreen() {
  const { articleId = "", sectionIndex } = useParams();
  const article = getKnowledgeArticle(articleId);
  const [query, setQuery] = useState("");
  const [showAllRoles, setShowAllRoles] = useState(false);

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

  const isCleaningArticle = article.id === CLEANING_ARTICLE_ID;
  const ownCleaningRole = isCleaningArticle ? STAFF_ROLE_TO_CLEANING_ROLE[getCurrentStaffRole()] : undefined;

  // Генеральная уборка: сразу показываем чек-лист своей роли (бар/КМ), без
  // похода в меню категорий — см. STAFF_ROLE_TO_CLEANING_ROLE. Ссылка
  // "Показать все роли" уводит на обычное меню (для Кухни/Уборщицы или
  // руководителя, которому нужно свериться с другой ролью).
  if (isCleaningArticle && ownCleaningRole && !showAllRoles && !selectedSection) {
    return (
      <div className="screen">
        <Link to="/employee/knowledge" className="muted" style={{ textDecoration: "none", fontSize: 14 }}>
          ← База знаний
        </Link>
        <div className="eyebrow" style={{ marginTop: 12 }}>
          {article.category}
        </div>
        <div className="card-row" style={{ marginBottom: 4 }}>
          <h1 style={{ marginBottom: 0 }}>{ownCleaningRole}</h1>
          <button className="btn ghost" style={{ padding: "4px 10px", fontSize: 13 }} onClick={() => setShowAllRoles(true)}>
            Все роли
          </button>
        </div>
        <CleaningChecklist role={ownCleaningRole} />
      </div>
    );
  }

  // Та же статья, но выбран конкретный раздел из меню (роль) — чек-лист
  // этой роли вместо текста. "Разовая уборка" — не роль с графиком по
  // неделям (CLEANING_ROLE_WEEKS её не знает), поэтому остаётся обычным
  // текстом ниже, как раньше.
  if (isCleaningArticle && selectedSection && CLEANING_ROLE_WEEKS[selectedSection.title]) {
    return (
      <div className="screen">
        <Link to={`/employee/knowledge/${article.id}`} className="muted" style={{ textDecoration: "none", fontSize: 14 }}>
          ← {article.title}
        </Link>
        <div className="eyebrow" style={{ marginTop: 12 }}>
          {article.category}
        </div>
        <h1>{selectedSection.title}</h1>
        <CleaningChecklist role={selectedSection.title} />
      </div>
    );
  }

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
