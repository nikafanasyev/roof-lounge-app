import { useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import GuestsList from "@/screens/master/GuestsList";
import GuestProfile from "@/screens/master/GuestProfile";
import MixBuilder from "@/screens/master/MixBuilder";
import MixView from "@/screens/master/MixView";
import Shift from "@/screens/staff/Shift";
import Problems from "@/screens/staff/Problems";
import Tasks from "@/screens/staff/Tasks";
import Dashboard from "@/screens/employee/Dashboard";
import More from "@/screens/employee/More";
import Profile from "@/screens/employee/Profile";
import Schedule from "@/screens/employee/Schedule";
import Adjustments from "@/screens/employee/Adjustments";
import Knowledge from "@/screens/employee/Knowledge";
import KnowledgeArticleScreen from "@/screens/employee/KnowledgeArticle";
import Summary from "@/screens/manager/Summary";
import ServiceCalls from "@/screens/manager/ServiceCalls";
import TableGuestScreen from "@/screens/guest/TableGuestScreen";

// Единый кабинет "Сотрудник" (мастер + официант в одном лице — так это
// реально работает в заведении) и отдельно "Руководитель". Переключатель
// ниже — временная демо-заглушка, пока нет реальной Telegram-авторизации:
// в проде роль будет закрепляться за аккаунтом один раз, без выбора вручную.
type AppRole = "employee" | "manager";

const ROLE_LABEL: Record<AppRole, string> = {
  employee: "Сотрудник",
  manager: "Руководитель",
};

function EmployeeNav() {
  return (
    <nav className="bottom-nav">
      <NavLink to="/employee/dashboard" className={({ isActive }) => (isActive ? "active" : "")}>
        <span className="icon">💰</span>Зарплата
      </NavLink>
      <NavLink to="/employee/guests" className={({ isActive }) => (isActive ? "active" : "")}>
        <span className="icon">🧪</span>Гости
      </NavLink>
      <NavLink to="/employee/shift" className={({ isActive }) => (isActive ? "active" : "")}>
        <span className="icon">✅</span>Смена
      </NavLink>
      <NavLink to="/employee/calls" className={({ isActive }) => (isActive ? "active" : "")}>
        <span className="icon">🔔</span>Вызовы
      </NavLink>
      <NavLink to="/employee/more" className={({ isActive }) => (isActive ? "active" : "")}>
        <span className="icon">☰</span>Ещё
      </NavLink>
    </nav>
  );
}

function ManagerNav() {
  return (
    <nav className="bottom-nav">
      <NavLink to="/manager/summary" className={({ isActive }) => (isActive ? "active" : "")}>
        <span className="icon">📊</span>Сводка
      </NavLink>
      <NavLink to="/manager/calls" className={({ isActive }) => (isActive ? "active" : "")}>
        <span className="icon">🔔</span>Вызовы
      </NavLink>
    </nav>
  );
}

const DEFAULT_ROUTE: Record<AppRole, string> = {
  employee: "/employee/dashboard",
  manager: "/manager/summary",
};

function RoleShell() {
  const [role, setRole] = useState<AppRole>("employee");
  const location = useLocation();
  const isGuestScreen = location.pathname.startsWith("/table/");

  if (isGuestScreen) {
    return (
      <Routes>
        <Route path="/table/:token" element={<TableGuestScreen />} />
      </Routes>
    );
  }

  return (
    <div className="app">
      <div className="top-bar">
        <div className="role-switch">
          {(Object.keys(ROLE_LABEL) as AppRole[]).map((r) => (
            <button key={r} className={role === r ? "active" : ""} onClick={() => setRole(r)}>
              {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
      </div>

      <Routes>
        <Route path="/" element={<Navigate to={DEFAULT_ROUTE[role]} replace />} />

        <Route path="/employee/dashboard" element={<Dashboard />} />
        <Route path="/employee/guests" element={<GuestsList />} />
        <Route path="/employee/guests/:guestId" element={<GuestProfile />} />
        <Route path="/employee/guests/:guestId/mix" element={<MixBuilder />} />
        <Route path="/employee/mix/:mixId" element={<MixView />} />
        <Route path="/employee/shift" element={<Shift />} />
        <Route path="/employee/calls" element={<ServiceCalls />} />
        <Route path="/employee/problems" element={<Problems />} />
        <Route path="/employee/tasks" element={<Tasks />} />
        <Route path="/employee/more" element={<More />} />
        <Route path="/employee/profile" element={<Profile />} />
        <Route path="/employee/schedule" element={<Schedule />} />
        <Route path="/employee/adjustments" element={<Adjustments />} />
        <Route path="/employee/knowledge" element={<Knowledge />} />
        <Route path="/employee/knowledge/:articleId" element={<KnowledgeArticleScreen />} />

        <Route path="/manager/summary" element={<Summary />} />
        <Route path="/manager/calls" element={<ServiceCalls />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {role === "employee" && <EmployeeNav />}
      {role === "manager" && <ManagerNav />}
    </div>
  );
}

export default function App() {
  return <RoleShell />;
}
