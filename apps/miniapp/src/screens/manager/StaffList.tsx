import { Link } from "react-router-dom";
import { useStore } from "@/data/useStore";
import { formatSalaryModel, listStaffDirectory, staffDirectoryStore } from "@/data/repo";
import type { StaffRole } from "@/types";

const ROLE_LABELS: Record<StaffRole, string> = { bar: "Бар", hookah: "Кальяны" };

export default function StaffList() {
  useStore(staffDirectoryStore);
  const staff = listStaffDirectory();

  return (
    <div className="screen">
      <h1>Сотрудники</h1>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {staff.map((s, idx) => (
          <Link
            key={s.id}
            to={`/manager/staff/${s.id}`}
            style={{
              textDecoration: "none",
              color: "inherit",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "12px 14px",
              borderTop: idx === 0 ? "none" : "1px solid var(--border)",
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>{s.name}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                {s.role ? ROLE_LABELS[s.role] : "Роль не задана"} · {formatSalaryModel(s)}
              </div>
            </div>
            <span className="muted">→</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
