import { Link, useParams } from "react-router-dom";
import { getKnowledgeArticle } from "@/data/repo";

export default function KnowledgeArticleScreen() {
  const { articleId = "" } = useParams();
  const article = getKnowledgeArticle(articleId);

  if (!article) {
    return (
      <div className="screen">
        <div className="list-empty">Статья не найдена</div>
      </div>
    );
  }

  return (
    <div className="screen">
      <Link to="/employee/knowledge" className="muted" style={{ textDecoration: "none", fontSize: 14 }}>
        ← База знаний
      </Link>
      <div className="eyebrow" style={{ marginTop: 12 }}>
        {article.category}
      </div>
      <h1>{article.title}</h1>
      <div className="card">{article.body}</div>
    </div>
  );
}
