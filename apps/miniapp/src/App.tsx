import { useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import GuestsList from "@/screens/master/GuestsList";
import GuestProfile from "@/screens/master/GuestProfile";
import MixBuilder from "@/screens/master/MixBuilder";
import MixView from "@/screens/master/MixView";
import Shift from "@/screens/staff/Shift";
import Problems from "@/screens/staff/Problems";
import Tasks from "@/screens/staff/Tasks";
import Summary from "@/screens/manager/Summary";
import ServiceCalls from "@/screens/manager/ServiceCalls";
import TableGuestScreen from "@/screens/guest/TableGuestScreen";

// Три роли — три разных набора экранов. Пока нет реальной Telegram-авторизации
// персонала, переключатель ниже — временная демо-заглушка: в проде у каждого
// сотрудника роль будет одна и назначаться она будет один раз (по staff.role
// в базе), без выбора вручную — см. README.
type AppRole = "master" | "staff" | "manager";

const ROLE_LABEL: Record<AppRole, string> = {
  master: "Мастер",
  staff: "Официант",
  manager: "Руководитель",
};

function MasterNav() {
  return (
    <nav className="bottom-nav">
      <NavLink to="/master/guests" className={({ isActive }) => (isActive ? "active" : "")}>
        <span className="icon">🧪</span>Гости
      </NavLink>
    </nav>
  );
}

function StaffNav() {
  return (
    <nav className="bottom-nav">
      <NavLink to="/staff/shift" className={({ isActive }) => (isActive ? "active" : "")}>
        <span className="icon">✅</span>Смена
      </NavLink>
      <NavLink to="/staff/problems" className={({ isActive }) => (isActive ? "active" : "")}>
        <span className="icon">🛠</span>Проблемы
      </NavLink>
      <NavLink to="/staff/tasks" className={({ isActive }) => (isActive ? "active" : "")}>
        <span className="icon">📋</span>Задачи
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
  master: "/master/guests",
  staff: "/staff/shift",
  manager: "/manager/summary",
};

function RoleShell() {
  const [role, setRole] = useState<AppRole>("master");
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

        <Route path="/master/guests" element={<GuestsList />} />
        <Route path="/master/guests/:guestId" element={<GuestProfile />} />
        <Route path="/master/guests/:guestId/mix" element={<MixBuilder />} />
        <Route path="/master/mix/:mixId" element={<MixView />} />

        <Route path="/staff/shift" element={<Shift />} />
        <Route path="/staff/problems" element={<Problems />} />
        <Route path="/staff/tasks" element={<Tasks />} />

        <Route path="/manager/summary" element={<Summary />} />
        <Route path="/manager/calls" element={<ServiceCalls />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {role === "master" && <MasterNav />}
      {role === "staff" && <StaffNav />}
      {role === "manager" && <ManagerNav />}
    </div>
  );
}

export default function App() {
  return <RoleShell />;
}
