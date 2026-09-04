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

type AppRole = "staff" | "manager";

function StaffNav() {
  return (
    <nav className="bottom-nav">
      <NavLink to="/staff/guests" className={({ isActive }) => (isActive ? "active" : "")}>
        <span className="icon">🧪</span>Гости
      </NavLink>
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

function RoleShell() {
  const [role, setRole] = useState<AppRole>("staff");
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
          <button className={role === "staff" ? "active" : ""} onClick={() => setRole("staff")}>
            Персонал
          </button>
          <button className={role === "manager" ? "active" : ""} onClick={() => setRole("manager")}>
            Руководитель
          </button>
        </div>
      </div>

      <Routes>
        <Route path="/" element={<Navigate to={role === "staff" ? "/staff/guests" : "/manager/summary"} replace />} />
        <Route path="/staff/guests" element={<GuestsList />} />
        <Route path="/staff/guests/:guestId" element={<GuestProfile />} />
        <Route path="/staff/guests/:guestId/mix" element={<MixBuilder />} />
        <Route path="/staff/mix/:mixId" element={<MixView />} />
        <Route path="/staff/shift" element={<Shift />} />
        <Route path="/staff/problems" element={<Problems />} />
        <Route path="/staff/tasks" element={<Tasks />} />

        <Route path="/manager/summary" element={<Summary />} />
        <Route path="/manager/calls" element={<ServiceCalls />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {role === "staff" ? <StaffNav /> : <ManagerNav />}
    </div>
  );
}

export default function App() {
  return <RoleShell />;
}
