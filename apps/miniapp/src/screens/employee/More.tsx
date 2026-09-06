import { Link } from "react-router-dom";

const ITEMS = [
  { to: "/employee/profile", icon: "👤", label: "Профиль" },
  { to: "/employee/schedule", icon: "🗓", label: "График смен" },
  { to: "/employee/adjustments", icon: "💸", label: "Штрафы и премии" },
  { to: "/employee/problems", icon: "🛠", label: "Проблемы" },
  { to: "/employee/tasks", icon: "📋", label: "Задачи" },
  { to: "/employee/knowledge", icon: "📚", label: "База знаний" },
];

export default function More() {
  return (
    <div className="screen menu-list">
      <h1>Ещё</h1>
      {ITEMS.map((item) => (
        <Link key={item.to} to={item.to} style={{ textDecoration: "none", color: "inherit" }}>
          <div className="card card-row">
            <span>
              <span style={{ marginRight: 10 }}>{item.icon}</span>
              {item.label}
            </span>
            <span className="muted">→</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
