import { useState } from "react";
import { Link, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
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
import StaffList from "@/screens/manager/StaffList";
import StaffDetail from "@/screens/manager/StaffDetail";
import SchedulePayroll from "@/screens/manager/SchedulePayroll";
import TableGuestScreen from "@/screens/guest/TableGuestScreen";
import { isCurrentUserManager, isInsideTelegramClient } from "@/lib/telegram";

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
      <NavLink to="/manager/staff" className={({ isActive }) => (isActive ? "active" : "")}>
        <span className="icon">👥</span>Сотрудники
      </NavLink>
      <NavLink to="/manager/schedule" className={({ isActive }) => (isActive ? "active" : "")}>
        <span className="icon">📅</span>График
      </NavLink>
      <NavLink to="/manager/problems" className={({ isActive }) => (isActive ? "active" : "")}>
        <span className="icon">🛠</span>Проблемы
      </NavLink>
    </nav>
  );
}

const DEFAULT_ROUTE: Record<AppRole, string> = {
  employee: "/employee/dashboard",
  manager: "/manager/summary",
};

function RoleShell() {
  // Переключатель между "Сотрудник" и "Руководитель" — только вне Telegram
  // (прямая ссылка в браузере, без initData): удобно тебе для теста, сразу
  // видно оба кабинета. Внутри настоящего Telegram-клиента у каждого
  // аккаунта закреплён ровно один кабинет без переключателя — руководитель
  // (аккаунт из VITE_MANAGER_TELEGRAM_IDS, см. lib/telegram.ts) сразу
  // попадает в "Руководитель" и не может переключиться на "Сотрудник",
  // остальной персонал — наоборот. См. обсуждение с Никитой 13.10.2026.
  const isManager = isCurrentUserManager();
  const inTelegram = isInsideTelegramClient();
  const canSwitchRole = isManager && !inTelegram;
  const [role, setRole] = useState<AppRole>(isManager && inTelegram ? "manager" : "employee");
  const location = useLocation();
  const isGuestScreen = location.pathname.startsWith("/table/");

  if (isGuestScreen) {
    return (
      <Routes>
        <Route path="/table/:token" element={<TableGuestScreen />} />
      </Routes>
    );
  }

  // Доп. защита: даже если кто-то наберёт /manager/... руками в адресной
  // строке, без флага руководителя его отправляют обратно в "Сотрудник".
  if (!isManager && location.pathname.startsWith("/manager")) {
    return <Navigate to={DEFAULT_ROUTE.employee} replace />;
  }

  // И наоборот: руководитель в Telegram (без переключателя) не должен
  // попадать в кабинет "Сотрудник" даже прямой ссылкой/кнопкой "назад".
  if (isManager && inTelegram && location.pathname.startsWith("/employee")) {
    return <Navigate to={DEFAULT_ROUTE.manager} replace />;
  }

  return (
    <div className="app">
      {canSwitchRole && (
        <div className="top-bar">
          <div className="role-switch">
            {(Object.keys(ROLE_LABEL) as AppRole[]).map((r) => (
              <button key={r} className={role === r ? "active" : ""} onClick={() => setRole(r)}>
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
        </div>
      )}

      <Routes>
        <Route path="/" element={<Navigate to={DEFAULT_ROUTE[role]} replace />} />

        <Route path="/employee/dashboard" element={<Dashboard />} />
        <Route path="/employee/guests" element={<GuestsList />} />
        <Route path="/employee/guests/:guestId" element={<GuestProfile />} />
        <Route path="/employee/guests/:guestId/mix" element={<MixBuilder />} />
        <Route path="/employee/mix/:mixId" element={<MixView />} />
        <Route path="/employee/shift" element={<Shift />} />
        <Route path="/employee/calls" element={<ServiceCalls />} />
        <Route path="/employee/problems" element={<Problems backTo="/employee/more" />} />
        <Route path="/employee/tasks" element={<Tasks />} />
        <Route path="/employee/more" element={<More />} />
        <Route path="/employee/profile" element={<Profile />} />
        <Route path="/employee/schedule" element={<Schedule />} />
        <Route path="/employee/adjustments" element={<Adjustments />} />
        <Route path="/employee/knowledge" element={<Knowledge />} />
        <Route path="/employee/knowledge/:articleId" element={<KnowledgeArticleScreen />} />
        <Route path="/employee/knowledge/:articleId/:sectionIndex" element={<KnowledgeArticleScreen />} />

        <Route path="/manager/summary" element={<Summary />} />
        <Route path="/manager/calls" element={<ServiceCalls />} />
        <Route path="/manager/staff" element={<StaffList />} />
        <Route path="/manager/staff/:staffId" element={<StaffDetail />} />
        <Route path="/manager/schedule" element={<SchedulePayroll />} />
        <Route path="/manager/problems" element={<Problems />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {(role === "employee" || !isManager) && !(isManager && inTelegram) && <EmployeeNav />}
      {role === "manager" && isManager && <ManagerNav />}
    </div>
  );
}

export default function App() {
  return <RoleShell />;
}
