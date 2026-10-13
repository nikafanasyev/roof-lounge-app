import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useStore } from "@/data/useStore";
import {
  archiveStaff,
  computeAverageSalaryPerShift,
  computeEarnedThisCalendarMonthForStaff,
  computePayrollSummaryForStaff,
  createFixedAccrual,
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
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState<StaffRole | "">(profile.role ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [email, setEmail] = useState(profile.email ?? "");
  const [salaryType, setSalaryType] = useState<SalaryModelType>(profile.salaryModel.type);
  const [salaryValue, setSalaryValue] = useState(String(profile.salaryModel.type === "fixed_plus_percent" ? profile.salaryModel.base : profile.salaryModel.value));
  const [salaryPercent, setSalaryPercent] = useState(String(profile.salaryModel.type === "fixed_plus_percent" ? profile.salaryModel.percent : ""));

  function save() {
    let salaryModel: SalaryModel;
    if (salaryType === "fixed") salaryModel = { type: "fixed", value: Number(salaryValue) || 0 };
    else if (salaryType === "percent") salaryModel = { type: "percent", value: Number(salaryValue) || 0 };
    else salaryModel = { type: "fixed_plus_percent", base: Number(salaryValue) || 0, percent: Number(salaryPercent) || 0 };

    updateStaffProfileById(staffId, {
      role: role || undefined,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      salaryModel,
    });
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
    <>
      <h2>Фиксированные начисления</h2>
      {accruals.map((f) => (
        <div key={f.id} className="card-row">
          <span>
            {f.label || "Начисление"} · {formatFixedAccrualCadence(f.cadence)}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontWeight: 700 }}>{money(f.amount)}</span>
            <button className="muted" style={{ background: "none", border: "none", fontSize: 12, textDecoration: "underline", cursor: "pointer" }} onClick={() => removeFixedAccrual(f.id)}>
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
    </>
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
        <div>
          <div className="eyebrow">{profile.role ? ROLE_LABELS[profile.role] : "Роль не задана"}</div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{profile.name}</div>
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

      <PayrollPeriods summaries={periods} />

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

      <div className="stat-grid">
        <div className="stat-tile">
          <div className="value" style={{ color: "var(--accent)" }}>
            {money(summary.earned)}
          </div>
          <div className="label">Начислено (всего)</div>
        </div>
        <div className="stat-tile">
          <div className="value" style={{ color: "var(--good)" }}>
            {money(summary.paid)}
          </div>
          <div className="label">Выплачено</div>
        </div>
        <div className="stat-tile">
          <div className="value" style={{ color: "var(--danger)" }}>
            {money(summary.fines)}
          </div>
          <div className="label">Штрафы</div>
        </div>
        <div className="stat-tile">
          <div className="value" style={{ color: "var(--good)" }}>
            {money(summary.bonuses)}
          </div>
          <div className="label">Премии</div>
        </div>
      </div>

      <FixedAccrualsCard staffId={staffId} />

      <h2>Начисления по сменам</h2>
      {months.length === 0 && <div className="list-empty">Смен пока не было</div>}
      {months.map((group) => (
        <div key={group.monthLabel} style={{ marginBottom: 16 }}>
          <div className="card-row" style={{ marginBottom: 6 }}>
            <span className="muted" style={{ fontSize: 13, textTransform: "capitalize" }}>
              {group.monthLabel}
            </span>
            <span style={{ fontWeight: 700 }}>{money(group.total)}</span>
          </div>
          {group.shifts.map((s) => (
            <ShiftRow key={s.id} id={s.id} staffId={s.staffId} date={s.date} role={s.role} revenue={s.revenue} salary={s.salary} />
          ))}
        </div>
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
