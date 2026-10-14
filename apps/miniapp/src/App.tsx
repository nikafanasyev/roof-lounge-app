import { useEffect, useState } from "react";
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
import StaffList from "@/screens/manager/StaffList";
import StaffDetail from "@/screens/manager/StaffDetail";
import SchedulePayroll from "@/screens/manager/SchedulePayroll";
import Salary from "@/screens/manager/Salary";
import SalaryPeriodDetail from "@/screens/manager/SalaryPeriodDetail";
import Fines from "@/screens/manager/Fines";
import TableGuestScreen from "@/screens/guest/TableGuestScreen";
import { isCurrentUserManager, isGuestTestAccount, isInsideTelegramClient } from "@/lib/telegram";
import { dataSyncStatusStore } from "@/data/repo";
import { useStore } from "@/data/useStore";

// Единый кабинет "Сотрудник" (мастер + официант в одном лице — так это
// реально работает в заведении) и отдельно "Руководитель". Переключатель
// ниже — временная демо-заглушка, пока нет реальной Telegram-авторизации:
// в проде роль будет закрепляться за аккаунтом один раз, без выбора вручную.
type AppRole = "employee" | "manager";

const ROLE_LABEL: Record<AppRole, string> = {
  employee: "Сотрудник",
  manager: "Руководитель",
};

/**
 * Предупреждение, если реальные данные не загрузились (см. dataSyncStatusStore
 * в data/repo.ts) — без него экран молча показывает примерные данные из
 * data/seed.ts (правдоподобные цифры "для верстки"), неотличимые от
 * настоящих. См. разбор с Никитой 14.10.2026 — так на тестовом гостевом
 * аккаунте "Моя зарплата" показала выдуманную историю вместо реальной, и
 * ничего в интерфейсе на это не намекало.
 */
function DataSyncBanner() {
  const status = useStore(dataSyncStatusStore);
  if (status === "ok" || status === "loading") return null;
  const text =
    status === "unconfigured"
      ? "Нет связи с сервером (Supabase не настроен на этом деплое) — на экране примерные данные для демонстрации, не настоящие."
      : "Не удалось загрузить часть данных с сервера — часть цифр ниже может быть устаревшей или демонстрационной.";
  return (
    <div
      style={{
        background: "var(--danger)",
        color: "#fff",
        fontSize: 12,
        fontWeight: 600,
        textAlign: "center",
        padding: "6px 12px",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      ⚠️ {text}
    </div>
  );
}

/**
 * Пока идёт самая первая загрузка данных с сервера (dataSyncStatusStore ===
 * "loading"), все сторы ещё хранят дефолтные значения из data/seed.ts —
 * без этого экрана они на долю секунды реально отрисовывались бы на
 * экране как настоящие (см. разбор записи экрана с Никитой 14.10.2026:
 * при "Обновить страницу" в Telegram между перезагрузкой страницы и
 * ответом Supabase видна вспышка старых demo-цифр). Показываем вместо
 * этого нейтральный "Загрузка…" и ничего из seed не рендерим вовсе.
 */
function LoadingScreen() {
  return (
    <div className="screen" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "70vh" }}>
      <div className="muted">Загрузка…</div>
    </div>
  );
}

// Навигация переехала из нижней панели в выдвижное меню слева (гамбургер ☰
// в шапке) — см. обсуждение с Никитой 13.10.2026: с пятью кнопками внизу
// было неудобно переключаться между разделами. Пункты и иконки те же, что
// были в нижней панели, просто в вертикальный список; клик по пункту сам
// закрывает меню через onNavigate.
function EmployeeNav({ onNavigate }: { onNavigate: () => void }) {
  return (
    <nav className="drawer-nav">
      <NavLink to="/employee/dashboard" onClick={onNavigate} className={({ isActive }) => (isActive ? "active" : "")}>
        <span className="icon">💰</span>Зарплата
      </NavLink>
      <NavLink to="/employee/guests" onClick={onNavigate} className={({ isActive }) => (isActive ? "active" : "")}>
        <span className="icon">🧪</span>Гости
      </NavLink>
      <NavLink to="/employee/shift" onClick={onNavigate} className={({ isActive }) => (isActive ? "active" : "")}>
        <span className="icon">✅</span>Смена
      </NavLink>
      <NavLink to="/employee/calls" onClick={onNavigate} className={({ isActive }) => (isActive ? "active" : "")}>
        <span className="icon">🔔</span>Вызовы
      </NavLink>
      <NavLink to="/employee/more" onClick={onNavigate} className={({ isActive }) => (isActive ? "active" : "")}>
        <span className="icon">☰</span>Ещё
      </NavLink>
    </nav>
  );
}

function ManagerNav({ onNavigate }: { onNavigate: () => void }) {
  return (
    <nav className="drawer-nav">
      <NavLink to="/manager/summary" onClick={onNavigate} className={({ isActive }) => (isActive ? "active" : "")}>
        <span className="icon">📊</span>Сводка
      </NavLink>
      <NavLink to="/manager/salary" onClick={onNavigate} className={({ isActive }) => (isActive ? "active" : "")}>
        <span className="icon">💰</span>Зарплата
      </NavLink>
      <NavLink to="/manager/fines" onClick={onNavigate} className={({ isActive }) => (isActive ? "active" : "")}>
        <span className="icon">⚠️</span>Штрафы
      </NavLink>
      <NavLink to="/manager/calls" onClick={onNavigate} className={({ isActive }) => (isActive ? "active" : "")}>
        <span className="icon">🔔</span>Вызовы
      </NavLink>
      <NavLink to="/manager/staff" onClick={onNavigate} className={({ isActive }) => (isActive ? "active" : "")}>
        <span className="icon">👥</span>Сотрудники
      </NavLink>
      <NavLink to="/manager/schedule" onClick={onNavigate} className={({ isActive }) => (isActive ? "active" : "")}>
        <span className="icon">📅</span>График
      </NavLink>
      <NavLink to="/manager/problems" onClick={onNavigate} className={({ isActive }) => (isActive ? "active" : "")}>
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  // Тестовый гостевой аккаунт (VITE_GUEST_TEST_TELEGRAM_IDS, см. lib/telegram.ts)
  // всегда видит гостевой сценарий, даже открыв мини-апп обычной кнопкой
  // бота (не по QR-ссылке стола) — иначе он попадал в кабинет "Сотрудник",
  // как любой другой Telegram-аккаунт (см. обсуждение 14.10.2026).
  const isGuestScreen = location.pathname.startsWith("/table/") || isGuestTestAccount();
  const syncStatus = useStore(dataSyncStatusStore);

  // Меню само закрывается при переходе на другой экран (в т.ч. кнопкой
  // "назад" в Telegram) — чтобы не оставалось открытым поверх нового экрана.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  if (isGuestScreen) {
    if (syncStatus === "loading") return <LoadingScreen />;
    return (
      <Routes>
        <Route path="/table/:token" element={<TableGuestScreen />} />
        {/* Тестовый гостевой аккаунт открывает мини-апп не по QR-ссылке
            стола, а обычной кнопкой — путь будет "/", не "/table/...".
            TableGuestScreen сам подставляет "table-1", если :token не задан
            (см. его useParams с дефолтом). */}
        <Route path="*" element={<TableGuestScreen />} />
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

  const showEmployeeNav = (role === "employee" || !isManager) && !(isManager && inTelegram);
  const showManagerNav = role === "manager" && isManager;

  return (
    <div className="app">
      <DataSyncBanner />
      <div className="top-bar">
        <button className="hamburger-btn" onClick={() => setDrawerOpen(true)} aria-label="Меню">
          <span />
          <span />
          <span />
        </button>

        {canSwitchRole && (
          <div className="role-switch">
            {(Object.keys(ROLE_LABEL) as AppRole[]).map((r) => (
              <button key={r} className={role === r ? "active" : ""} onClick={() => setRole(r)}>
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
        )}
      </div>

      {drawerOpen && (
        <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)}>
          <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <span>{ROLE_LABEL[role]}</span>
              <button className="drawer-close" onClick={() => setDrawerOpen(false)} aria-label="Закрыть">
                ✕
              </button>
            </div>
            {showEmployeeNav && <EmployeeNav onNavigate={() => setDrawerOpen(false)} />}
            {showManagerNav && <ManagerNav onNavigate={() => setDrawerOpen(false)} />}
          </div>
        </div>
      )}

      {syncStatus === "loading" ? (
        <LoadingScreen />
      ) : (
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
        <Route path="/manager/salary" element={<Salary />} />
        <Route path="/manager/salary/:periodKey" element={<SalaryPeriodDetail />} />
        <Route path="/manager/fines" element={<Fines />} />
        <Route path="/manager/problems" element={<Problems />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      )}
    </div>
  );
}

export default function App() {
  return <RoleShell />;
}
