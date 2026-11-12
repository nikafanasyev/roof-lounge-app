import { NameEditor } from "@/components/NameEditor";
import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useStore } from "@/data/useStore";
import {
  archiveStaff,
  computeAverageSalaryPerShift,
  computeEarnedThisCalendarMonthForStaff,
  computePayrollSummaryForStaff,
  createFixedAccrual,
  fixedAccrualsStore,
  formatFixedAccrualCadence,
  formatSalaryModel,
  getStaffProfileById,
  listActivePayrollPeriodSummariesForStaff,
  listFixedAccrualsForStaff,
  listShiftPayrollByMonthForStaff,
  listStaffDirectory,
  reassignShiftPayroll,
  removeFixedAccrual,
  shiftPayrollStore,
  staffDirectoryStore,
  updateStaffProfileById,
  uploadStaffPhoto,
  yearsOfService,
} from "@/data/repo";
import PayrollPeriods from "@/components/PayrollPeriods";
import type { FixedAccrualCadence, SalaryModel, SalaryModelType, StaffRole } from "@/types";

const ROLE_LABELS: Record<StaffRole, string> = { bar: "Бар", hookah: "Кальяны" };
const SALARY_TYPE_LABELS: Record<SalaryModelType, string> = {
  fixed: "Фиксированная ставка за смену",
  percent: "Процент от выручки",
  fixed_plus_percent: "Ставка + процент",
};

function money(n: number): string {
  return n.toLocaleString("ru-RU") + " ₽";
}

function formatTenure(hiredAt: string): string {
  const { years, months } = yearsOfService(hiredAt);
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} г.`);
  parts.push(`${months} мес.`);
  return parts.join(" ");
}

function formatExpiry(iso?: string): string {
  if (!iso) return "не указано";
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Карточка одной начисленной смены + переназначение на другого сотрудника —
 * на случай, если в графике была замена, а бот успел начислить не тому (см.
 * reassignShiftPayroll в data/repo.ts). Выручка переносится как есть,
 * сумма пересчитывается по salary_model выбранного сотрудника.
 */
function ShiftRow({ id, staffId, date, role, revenue, salary }: { id: string; staffId: string; date: string; role?: StaffRole; revenue: number; salary: number }) {
  const [open, setOpen] = useState(false);
  const staff = listStaffDirectory();
  const others = staff.filter((s) => s.id !== staffId);
  const [pick, setPick] = useState(() => others[0]?.id ?? "");

  return (
    <div className="card">
      <div className="card-row">
        <div>
          <div style={{ fontWeight: 700 }}>
            {new Date(date).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}
            {role ? ` · ${ROLE_LABELS[role]}` : ""}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            выручка {money(revenue)}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700, color: "var(--accent)" }}>{money(salary)}</div>
          <button
            className="muted"
            style={{ background: "none", border: "none", padding: 0, fontSize: 12, textDecoration: "underline", cursor: "pointer" }}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "отмена" : "переназначить"}
          </button>
        </div>
      </div>
      {open && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <select style={{ flex: 1 }} value={pick} onChange={(e) => setPick(e.target.value)}>
            {others.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            className="btn primary"
            style={{ width: "auto", padding: "11px 16px" }}
            disabled={!pick}
            onClick={() => {
              reassignShiftPayroll(id, pick);
              setOpen(false);
            }}
          >
            Перенести
          </button>
        </div>
      )}
    </div>
  );
}

/** Модель ЗП, роль на смене и контакты — редактируются прямо здесь, без отдельного экрана (см. запрос Никиты 13.10.2026). */
function EditableCard({ staffId, profile }: { staffId: string; profile: ReturnType<typeof getStaffProfileById> }) {
  if (!profile) return null;
  const currentTelegramId = profile.telegramId;
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState<StaffRole | "">(profile.role ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [email, setEmail] = useState(profile.email ?? "");
  const [telegramId, setTelegramId] = useState(currentTelegramId != null ? String(currentTelegramId) : "");
  const [telegramIdError, setTelegramIdError] = useState<string | null>(null);
  const [salaryType, setSalaryType] = useState<SalaryModelType>(profile.salaryModel.type);
  const [salaryValue, setSalaryValue] = useState(String(profile.salaryModel.type === "fixed_plus_percent" ? profile.salaryModel.base : profile.salaryModel.value));
  const [salaryPercent, setSalaryPercent] = useState(String(profile.salaryModel.type === "fixed_plus_percent" ? profile.salaryModel.percent : ""));

  async function save() {
    let salaryModel: SalaryModel;
    if (salaryType === "fixed") salaryModel = { type: "fixed", value: Number(salaryValue) || 0 };
    else if (salaryType === "percent") salaryModel = { type: "percent", value: Number(salaryValue) || 0 };
    else salaryModel = { type: "fixed_plus_percent", base: Number(salaryValue) || 0, percent: Number(salaryPercent) || 0 };

    const trimmedTelegramId = telegramId.trim();
    const telegramIdChanged = trimmedTelegramId !== (currentTelegramId != null ? String(currentTelegramId) : "");
    if (telegramIdChanged && trimmedTelegramId && !/^\d+$/.test(trimmedTelegramId)) {
      setTelegramIdError("Telegram ID — это число (см. у @userinfobot), без букв и пробелов");
      return;
    }

    const result = await updateStaffProfileById(staffId, {
      role: role || undefined,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      salaryModel,
      ...(telegramIdChanged && trimmedTelegramId ? { telegramId: Number(trimmedTelegramId) } : {}),
    });
    if (result?.error === "duplicate_telegram_id") {
      setTelegramIdError("Этот Telegram ID уже привязан к другому сотруднику — проверь, не дублируется ли карточка");
      return;
    }
    if (result?.error) {
      setTelegramIdError("Не получилось сохранить — попробуй ещё раз");
      return;
    }
    setTelegramIdError(null);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="card">
        <div className="card-row">
          <span className="muted">Стаж</span>
          <span>{formatTenure(profile.hiredAt)}</span>
        </div>
        <div className="card-row" style={{ marginTop: 8 }}>
          <span className="muted">Роль на смене</span>
          <span>{profile.role ? ROLE_LABELS[profile.role] : "не задана"}</span>
        </div>
        <div className="card-row" style={{ marginTop: 8 }}>
          <span className="muted">Телефон</span>
          <span>{profile.phone || "не указан"}</span>
        </div>
        <div className="card-row" style={{ marginTop: 8 }}>
          <span className="muted">Почта</span>
          <span>{profile.email || "не указана"}</span>
        </div>
        <div className="card-row" style={{ marginTop: 8 }}>
          <span className="muted">Telegram ID</span>
          <span>{profile.telegramId ?? "не указан"}</span>
        </div>
        <div className="card-row" style={{ marginTop: 8 }}>
          <span className="muted">Модель ЗП</span>
          <span>{formatSalaryModel(profile)}</span>
        </div>
        <button className="btn secondary" style={{ marginTop: 12, padding: "8px 12px", fontSize: 13 }} onClick={() => setEditing(true)}>
          Изменить
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="eyebrow">Роль на смене</div>
      <select value={role} onChange={(e) => setRole(e.target.value as StaffRole | "")} style={{ marginBottom: 10 }}>
        <option value="">не задана</option>
        <option value="hookah">Кальяны</option>
        <option value="bar">Бар</option>
      </select>

      <div className="eyebrow">Телефон</div>
      <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ marginBottom: 10 }} />

      <div className="eyebrow">Почта</div>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ marginBottom: 10 }} />

      <div className="eyebrow">Telegram ID</div>
      <input
        type="text"
        inputMode="numeric"
        value={telegramId}
        onChange={(e) => {
          setTelegramId(e.target.value);
          setTelegramIdError(null);
        }}
        placeholder="Например: 123456789"
        style={{ marginBottom: telegramIdError ? 4 : 10 }}
      />
      {telegramIdError && (
        <div className="muted" style={{ fontSize: 12, color: "var(--danger, #c0392b)", marginBottom: 10 }}>
          {telegramIdError}
        </div>
      )}
      {/*
        Чтобы узнать свой числовой Telegram ID, сотрудник пишет любому
        боту-"узнавалке" (например, @userinfobot) — он сразу присылает
        число в ответ. Задавать его здесь заранее стоит, когда карточка
        сотрудника уже существует (ЗП/график/история), а он пока не
        открывал приложение сам — так первое открытие подвяжется к этой же
        карточке, а не создаст дубликат (см. обсуждение с Никитой
        09.11.2026).
      */}

      <div className="eyebrow">Модель ЗП</div>
      <select value={salaryType} onChange={(e) => setSalaryType(e.target.value as SalaryModelType)} style={{ marginBottom: 8 }}>
        <option value="percent">{SALARY_TYPE_LABELS.percent}</option>
        <option value="fixed">{SALARY_TYPE_LABELS.fixed}</option>
        <option value="fixed_plus_percent">{SALARY_TYPE_LABELS.fixed_plus_percent}</option>
      </select>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input
          type="number"
          value={salaryValue}
          onChange={(e) => setSalaryValue(e.target.value)}
          placeholder={salaryType === "percent" ? "% от выручки" : "₽ за смену"}
          style={{ flex: 1 }}
        />
        {salaryType === "fixed_plus_percent" && (
          <input type="number" value={salaryPercent} onChange={(e) => setSalaryPercent(e.target.value)} placeholder="% от выручки" style={{ flex: 1 }} />
        )}
      </div>

      <div className="btn-row">
        <button className="btn secondary" onClick={() => setEditing(false)}>
          Отмена
        </button>
        <button className="btn primary" onClick={save}>
          Сохранить
        </button>
      </div>
    </div>
  );
}

/** Фиксированные начисления вне сменной сетки — см. запрос Никиты: "Никита 10000 (раз в 2 недели)". */
function FixedAccrualsCard({ staffId }: { staffId: string }) {
  // Раньше компонент не подписывался на fixedAccrualsStore — после
  // createFixedAccrual() стор обновлялся, но React об этом не узнавал и не
  // перерисовывал карточку, из-за чего новое начисление визуально "никуда
  // не сохранялось" (см. фидбек Никиты 12.11.2026), хотя на самом деле
  // сохранялось и в сторе, и в Supabase — просто не отображалось без
  // перехода на другой экран и обратно.
  useStore(fixedAccrualsStore);
  const accruals = listFixedAccrualsForStaff(staffId);
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState<FixedAccrualCadence>("biweekly");
  const [label, setLabel] = useState("");

  function submit() {
    const n = Number(amount);
    if (!n) return;
    createFixedAccrual(staffId, n, cadence, label.trim() || undefined);
    setAmount("");
    setLabel("");
    setAdding(false);
  }

  return (
    <div style={{ marginBottom: "var(--space-5)" }}>
      <h2>Фиксированные начисления</h2>
      {accruals.map((f) => (
        <div key={f.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>{f.label || "Начисление"}</div>
            <div className="muted" style={{ fontSize: 13 }}>{formatFixedAccrualCadence(f.cadence)}</div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{money(f.amount)}</div>
            <button className="muted" style={{ background: "none", border: "none", padding: 0, fontSize: 12, textDecoration: "underline", cursor: "pointer" }} onClick={() => removeFixedAccrual(f.id)}>
              убрать
            </button>
          </div>
        </div>
      ))}
      {!adding ? (
        <button className="btn secondary" style={{ padding: "8px 12px", fontSize: 13 }} onClick={() => setAdding(true)}>
          + Добавить начисление
        </button>
      ) : (
        <div className="card">
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Например: доплата за старшинство" style={{ marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Сумма ₽" style={{ flex: 1 }} />
            <select value={cadence} onChange={(e) => setCadence(e.target.value as FixedAccrualCadence)} style={{ flex: 1 }}>
              <option value="weekly">раз в неделю</option>
              <option value="biweekly">раз в 2 недели</option>
              <option value="monthly">раз в месяц</option>
            </select>
          </div>
          <div className="btn-row">
            <button className="btn secondary" onClick={() => setAdding(false)}>
              Отмена
            </button>
            <button className="btn primary" disabled={!Number(amount)} onClick={submit}>
              Добавить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Месяц со сменами — сворачиваемый (по умолчанию раскрыт только самый свежий),
 * иначе в карточке сотрудника бесконечный список смен за всё время (см.
 * фидбек Никиты 12.11.2026: "у сотрудника в карточке бесконечные смены").
 */
function pluralShifts(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} смена`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} смены`;
  return `${n} смен`;
}

function MonthShifts({
  group,
  defaultOpen,
}: {
  group: ReturnType<typeof listShiftPayrollByMonthForStaff>[number];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 12 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="card-row"
        style={{ width: "100%", background: "none", border: "none", padding: "8px 0", cursor: "pointer", color: "inherit", font: "inherit", marginBottom: 6 }}
      >
        <span className="muted" style={{ fontSize: 13, textTransform: "capitalize" }}>
          {open ? "▾" : "▸"} {group.monthLabel} · {pluralShifts(group.shifts.length)}
        </span>
        <span style={{ fontWeight: 700 }}>{money(group.total)}</span>
      </button>
      {open &&
        group.shifts.map((s) => (
          <ShiftRow key={s.id} id={s.id} staffId={s.staffId} date={s.date} role={s.role} revenue={s.revenue} salary={s.salary} />
        ))}
    </div>
  );
}

function DangerZone({ staffId, name }: { staffId: string; name: string }) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="card" style={{ borderColor: "var(--danger)", marginTop: 20 }}>
      {!confirming ? (
        <button className="btn danger-ghost" onClick={() => setConfirming(true)}>
          Удалить сотрудника
        </button>
      ) : (
        <>
          <div style={{ fontSize: 13, marginBottom: 10 }}>
            {name} будет скрыт из списка «Сотрудники» и графика — вся история начислений сохранится. Бот сам выведет
            его из рабочего чата; ПИН на терминале Quick Resto отключите вручную.
          </div>
          <div className="btn-row">
            <button className="btn secondary" onClick={() => setConfirming(false)}>
              Отмена
            </button>
            <button
              className="btn danger-ghost"
              onClick={() => {
                archiveStaff(staffId);
                navigate("/manager/staff");
              }}
            >
              Подтвердить удаление
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function StaffDetail() {
  useStore(staffDirectoryStore);
  useStore(shiftPayrollStore);
  const { staffId = "" } = useParams();
  const profile = getStaffProfileById(staffId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!profile) {
    return (
      <div className="screen">
        <Link to="/manager/staff" className="muted" style={{ textDecoration: "none", fontSize: 14 }}>
          ← Сотрудники
        </Link>
        <div className="list-empty">Сотрудник не найден</div>
      </div>
    );
  }

  function handlePhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadStaffPhoto(staffId, file);
  }

  const summary = computePayrollSummaryForStaff(staffId);
  const periods = listActivePayrollPeriodSummariesForStaff(staffId);
  const earnedThisMonth = computeEarnedThisCalendarMonthForStaff(staffId);
  const avgPerShift = computeAverageSalaryPerShift(staffId);
  const months = listShiftPayrollByMonthForStaff(staffId);
  const expirySoon =
    profile.medicalBookExpiry && new Date(profile.medicalBookExpiry).getTime() - Date.now() < 86400000 * 30;

  return (
    <div className="screen">
      <Link to="/manager/staff" className="muted" style={{ textDecoration: "none", fontSize: 14 }}>
        ← Сотрудники
      </Link>

      <div className="card" style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 12 }}>
        <div className="avatar-upload" onClick={() => fileInputRef.current?.click()}>
          {profile.photoUrl ? <img src={profile.photoUrl} alt="" /> : "📷"}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoPick} style={{ display: "none" }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="eyebrow">{profile.role ? ROLE_LABELS[profile.role] : "Роль не задана"}</div>
          <NameEditor name={profile.name} onSave={(next) => updateStaffProfileById(staffId, { name: next })} />
          <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 12, marginTop: 6 }} onClick={() => fileInputRef.current?.click()}>
            Сменить фото
          </button>
        </div>
      </div>

      <div className="eyebrow" style={{ marginTop: 12 }}>
        Медкнижка
      </div>
      <div className="card">
        <div className="card-row">
          <span className="muted">Номер</span>
          <span style={{ color: expirySoon ? "var(--warn)" : "var(--ink)" }}>
            {profile.medicalBookNumber ? `№ ${profile.medicalBookNumber} · до ${formatExpiry(profile.medicalBookExpiry)}` : "не указана"}
          </span>
        </div>
      </div>

      <div className="eyebrow">Карточка</div>
      <EditableCard staffId={staffId} profile={profile} />

      <PayrollPeriods summaries={periods} staffId={staffId} />

      <div className="stat-grid">
        <div className="stat-tile">
          <div className="value">{money(earnedThisMonth)}</div>
          <div className="label">Заработано за месяц</div>
        </div>
        <div className="stat-tile">
          <div className="value">{money(avgPerShift)}</div>
          <div className="label">Средняя ЗП за смену</div>
        </div>
      </div>

      {/*
        "Начислено (всего)" убрали — та же лишняя сумма за всё время с
        момента найма, что раньше убрали с "Моя зарплата" у сотрудника
        (см. обсуждение с Никитой 09.11.2026 и 11.11.2026: "эти поля с
        общей зп наверное не нужны, перегружено"). cols-3 — три плашки в
        ровный ряд вместо четырёх.
      */}
      <div className="stat-grid cols-3">
        <div className="stat-tile good">
          <div className="value">{money(summary.paid)}</div>
          <div className="label">Выплачено</div>
        </div>
        <div className="stat-tile danger">
          <div className="value">{money(summary.fines)}</div>
          <div className="label">Штрафы</div>
        </div>
        <div className="stat-tile good">
          <div className="value">{money(summary.bonuses)}</div>
          <div className="label">Премии</div>
        </div>
      </div>

      <FixedAccrualsCard staffId={staffId} />

      <h2>Начисления по сменам</h2>
      {months.length === 0 && <div className="list-empty">Смен пока не было</div>}
      {months.map((group, i) => (
        <MonthShifts key={group.monthLabel} group={group} defaultOpen={i === 0} />
      ))}

      {profile.archived ? (
        <div className="card" style={{ borderColor: "var(--border)", marginTop: 20 }}>
          <div className="muted" style={{ fontSize: 13 }}>
            Уволен — скрыт из «Сотрудники» и графика, вся история начислений выше сохранена.
          </div>
        </div>
      ) : (
        <DangerZone staffId={staffId} name={profile.name} />
      )}
    </div>
  );
}
