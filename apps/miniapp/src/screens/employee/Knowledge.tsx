import { Link } from "react-router-dom";
import { useStore } from "@/data/useStore";
import { groupKnowledgeByCategory, knowledgeStore } from "@/data/repo";

export default function Knowledge() {
  useStore(knowledgeStore);
  const groups = groupKnowledgeByCategory();

  return (
    <div className="screen">
      <h1>База знаний</h1>
      {groups.map((group) => (
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
